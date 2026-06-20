import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  burnObligations,
  deployableValue,
  projectLiquidityCoverage,
  type LiquidityInput,
  type Obligation,
  type ReserveTier,
} from "./engine";

/** A tiny, fully hand-computable coverage scenario. */
function tinyInput(overrides: Partial<LiquidityInput> = {}): LiquidityInput {
  const reserves: ReserveTier[] = [
    // 1,000,000 cash at par, available immediately.
    { id: "cash", label: "Cash", balance: "1000000" },
    // 2,000,000 securities at a 10% haircut → 1,800,000, available month 1.
    {
      id: "sec",
      label: "Securities",
      balance: "2000000",
      haircut: "0.1",
      availableFromMonth: 1,
    },
  ];
  const obligations: Obligation[] = [
    // A 500k call in month 0 and a 2,000,000 call in month 2.
    { id: "c0", label: "Call A", category: "pe-call", amount: "500000", month: 0 },
    { id: "c2", label: "Call B", category: "pe-call", amount: "2000000", month: 2 },
    // 100k household burn in month 1.
    { id: "b1", label: "Burn", category: "household-burn", amount: "100000", month: 1 },
  ];
  return {
    horizonMonths: 3,
    currency: "USD",
    startPeriod: "2024-01",
    reserves,
    obligations,
    ...overrides,
  };
}

describe("deployableValue", () => {
  it("applies the haircut multiplicatively", () => {
    expect(
      deployableValue({ id: "x", label: "x", balance: "2000000", haircut: "0.15" }).toFixed(),
    ).toBe("1700000");
  });

  it("treats a missing haircut as par", () => {
    expect(deployableValue({ id: "x", label: "x", balance: "500000" }).toFixed()).toBe(
      "500000",
    );
  });

  it("rejects a haircut outside [0, 1)", () => {
    expect(() =>
      deployableValue({ id: "x", label: "x", balance: "1", haircut: "1" }),
    ).toThrow(/haircut/);
    expect(() =>
      deployableValue({ id: "x", label: "x", balance: "1", haircut: "-0.01" }),
    ).toThrow(/haircut/);
  });

  it("rejects a negative balance", () => {
    expect(() =>
      deployableValue({ id: "x", label: "x", balance: "-1" }),
    ).toThrow(/non-negative/);
  });
});

describe("projectLiquidityCoverage — hand-calc oracle", () => {
  const p = projectLiquidityCoverage(tinyInput());

  it("totals deployable reserves with haircuts", () => {
    // 1,000,000 + 2,000,000×0.9 = 2,800,000.
    expect(p.summary.totalLiquidity.toFixed()).toBe("2800000");
    expect(p.summary.grossLiquidity.toFixed()).toBe("3000000");
  });

  it("totals obligations split by category", () => {
    expect(p.summary.totalObligations.toFixed()).toBe("2600000");
    expect(p.summary.totalCalls.toFixed()).toBe("2500000");
    expect(p.summary.totalBurn.toFixed()).toBe("100000");
  });

  it("horizon coverage ratio = deployable ÷ obligations", () => {
    // 2,800,000 / 2,600,000 = 1.076923...
    expect(p.summary.coverageRatio?.toFixed(6)).toBe(
      new Decimal("2800000").div("2600000").toFixed(6),
    );
  });

  it("rolls the buffer month by month", () => {
    // Month 0: only cash online (1,000,000). Obligation 500,000.
    expect(p.months[0].availableLiquidity.toFixed()).toBe("1000000");
    expect(p.months[0].obligation.toFixed()).toBe("500000");
    expect(p.months[0].coverageRatio?.toFixed()).toBe("2");
    expect(p.months[0].shortfall.toFixed()).toBe("0");
    expect(p.months[0].closingLiquidity.toFixed()).toBe("500000");

    // Month 1: securities come online (+1,800,000) → 2,300,000. Burn 100,000.
    expect(p.months[1].availableLiquidity.toFixed()).toBe("2300000");
    expect(p.months[1].obligation.toFixed()).toBe("100000");
    expect(p.months[1].closingLiquidity.toFixed()).toBe("2200000");

    // Month 2: buffer 2,200,000 vs the 2,000,000 call → covered, ratio 1.1.
    expect(p.months[2].availableLiquidity.toFixed()).toBe("2200000");
    expect(p.months[2].obligation.toFixed()).toBe("2000000");
    expect(p.months[2].coverageRatio?.toFixed(1)).toBe("1.1");
    expect(p.months[2].shortfall.toFixed()).toBe("0");
    expect(p.months[2].covered).toBe(true);
  });

  it("identifies the worst (tightest) month among obligation months", () => {
    // Monthly ratios: m0 = 2, m1 = 23, m2 = 1.1 → tightest is m2.
    expect(p.summary.worstMonth).toBe(2);
    expect(p.summary.worstCoverageRatio?.toFixed(1)).toBe("1.1");
  });

  it("reports full coverage with no shortfall", () => {
    expect(p.summary.fullyCovered).toBe(true);
    expect(p.summary.firstShortfallMonth).toBeNull();
    expect(p.summary.totalShortfall.toFixed()).toBe("0");
  });

  it("labels months from the start period", () => {
    expect(p.months.map((m) => m.period)).toEqual(["2024-01", "2024-02", "2024-03"]);
  });
});

describe("projectLiquidityCoverage — shortfall path", () => {
  // Same scenario but the securities tier is locked until month 3 (after the
  // big call), so the family is short when the call lands.
  const input = tinyInput({
    reserves: [
      { id: "cash", label: "Cash", balance: "1000000" },
      {
        id: "sec",
        label: "Securities",
        balance: "2000000",
        haircut: "0.1",
        availableFromMonth: 3, // beyond the horizon → never deployable here
      },
    ],
  });
  const p = projectLiquidityCoverage(input);

  it("only counts reserves that come online within the horizon", () => {
    // Total deployable still includes the locked tier (it exists)…
    expect(p.summary.totalLiquidity.toFixed()).toBe("2800000");
  });

  it("goes short when the call lands before reserves are available", () => {
    // Month 0: 1,000,000 − 500,000 = 500,000 carried.
    // Month 1: burn 100,000 → 400,000 carried (no securities online).
    // Month 2: buffer 400,000 vs the 2,000,000 call → 1,600,000 short.
    expect(p.months[2].availableLiquidity.toFixed()).toBe("400000");
    expect(p.months[2].shortfall.toFixed()).toBe("1600000");
    expect(p.months[2].covered).toBe(false);
    // Coverage 400,000 / 2,000,000 = 0.2.
    expect(p.months[2].coverageRatio?.toFixed(1)).toBe("0.2");
  });

  it("flags the first shortfall month and totals the shortfall", () => {
    expect(p.summary.firstShortfallMonth).toBe(2);
    expect(p.summary.totalShortfall.toFixed()).toBe("1600000");
    expect(p.summary.fullyCovered).toBe(false);
    expect(p.summary.worstMonth).toBe(2);
  });
});

describe("projectLiquidityCoverage — edge cases", () => {
  it("returns null coverage for months and horizon with no obligation", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 2,
      currency: "USD",
      reserves: [{ id: "cash", label: "Cash", balance: "100" }],
      obligations: [],
    });
    expect(p.summary.coverageRatio).toBeNull();
    expect(p.summary.worstMonth).toBeNull();
    expect(p.months[0].coverageRatio).toBeNull();
    expect(p.summary.fullyCovered).toBe(true);
  });

  it("drops obligations outside the horizon window", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 2,
      currency: "USD",
      reserves: [{ id: "cash", label: "Cash", balance: "1000" }],
      obligations: [
        { id: "in", label: "in", category: "pe-call", amount: "100", month: 1 },
        { id: "out", label: "out", category: "pe-call", amount: "999", month: 5 },
      ],
    });
    expect(p.summary.totalObligations.toFixed()).toBe("100");
  });

  it("nets multiple obligations landing in the same month", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 1,
      currency: "USD",
      reserves: [{ id: "cash", label: "Cash", balance: "1000" }],
      obligations: [
        { id: "a", label: "a", category: "pe-call", amount: "300", month: 0 },
        { id: "b", label: "b", category: "household-burn", amount: "200", month: 0 },
      ],
    });
    expect(p.months[0].obligation.toFixed()).toBe("500");
    expect(p.months[0].coverageRatio?.toFixed()).toBe("2");
  });

  it("rejects a non-positive horizon", () => {
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 0,
        currency: "USD",
        reserves: [],
        obligations: [],
      }),
    ).toThrow(/horizonMonths/);
  });

  it("rejects a malformed start period", () => {
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 1,
        currency: "USD",
        startPeriod: "2024-13",
        reserves: [],
        obligations: [],
      }),
    ).toThrow(/calendar month/);
  });

  it("rejects a negative obligation amount", () => {
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 1,
        currency: "USD",
        reserves: [],
        obligations: [
          { id: "n", label: "n", category: "pe-call", amount: "-1", month: 0 },
        ],
      }),
    ).toThrow(/non-negative/);
  });
});

describe("burnObligations", () => {
  it("turns positive net outflow months into obligations and skips the rest", () => {
    const obs = burnObligations(["100", "0", "-50", "250"]);
    expect(obs.map((o) => [o.month, new Decimal(o.amount).toFixed()])).toEqual([
      [0, "100"],
      [3, "250"],
    ]);
    expect(obs.every((o) => o.category === "household-burn")).toBe(true);
  });
});
