import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { xnpv } from "@/lib/returns/xirr";

import { computeLifecycle, peIrr, type FundPosition } from "./privatemarkets";
import { realizedVentureFund, sampleFund } from "./fixtures";

/** Assert a Decimal equals a string value exactly. */
function expectDecimal(actual: Decimal, expected: string) {
  expect(actual.toString()).toBe(expected);
}

describe("computeLifecycle — sampleFund (hand-computed oracle)", () => {
  const m = computeLifecycle(sampleFund);

  it("aggregates paid-in, distributed, NAV and unfunded", () => {
    expectDecimal(m.committed, "10000000");
    // calls: 4M + 3M + 1M = 8M
    expectDecimal(m.paidIn, "8000000");
    // distributions: 2M + 7M = 9M
    expectDecimal(m.distributed, "9000000");
    expectDecimal(m.nav, "5000000");
    // 10M − 8M = 2M
    expectDecimal(m.unfunded, "2000000");
  });

  it("computes the multiples exactly (Decimal, not float)", () => {
    // DPI = 9M / 8M = 1.125
    expectDecimal(m.dpi, "1.125");
    // RVPI = 5M / 8M = 0.625
    expectDecimal(m.rvpi, "0.625");
    // TVPI = (9M + 5M) / 8M = 14/8 = 1.75
    expectDecimal(m.tvpi, "1.75");
    // MOIC == TVPI here
    expectDecimal(m.moic, "1.75");
    // TVPI must equal DPI + RVPI identically
    expectDecimal(m.dpi.plus(m.rvpi), m.tvpi.toString());
    // called% = 8M / 10M = 0.8
    expectDecimal(m.calledPct, "0.8");
  });

  it("preserves metadata", () => {
    expect(m.fundName).toBe("Evergreen Buyout Fund IV");
    expect(m.currency).toBe("USD");
    expect(m.vintageYear).toBe(2019);
  });

  it("solves an IRR whose NPV is ~zero at the discovered rate", () => {
    expect(m.irr).not.toBeNull();
    // Reconstruct the dated flow series (calls negative, dists positive, NAV
    // terminal inflow on the as-of date) and confirm xnpv at the IRR ≈ 0.
    const flows = [
      { date: "2019-03-15", amount: "-4000000" },
      { date: "2020-06-01", amount: "-3000000" },
      { date: "2021-02-10", amount: "2000000" },
      { date: "2021-09-30", amount: "-1000000" },
      { date: "2023-05-20", amount: "7000000" },
      { date: "2024-12-31", amount: "5000000" },
    ];
    const npv = xnpv(m.irr!, flows);
    expect(npv.abs().toNumber()).toBeLessThan(1e-2);
    // Sanity band: a 1.75x over ~6y is a healthy double-digit IRR.
    expect(m.irr!.toNumber()).toBeGreaterThan(0.1);
    expect(m.irr!.toNumber()).toBeLessThan(0.25);
  });

  it("produces a J-curve that dips negative then recovers", () => {
    const net = m.jCurve.map((p) => p.cumulativeNet.toNumber());
    expect(m.jCurve).toHaveLength(5);
    // After the first call the LP is underwater.
    expect(net[0]).toBe(-4000000);
    // The trough is the most negative point.
    const trough = Math.min(...net);
    expect(trough).toBeLessThan(0);
    // The final cumulative net = distributed − paidIn = 9M − 8M = +1M.
    expect(net[net.length - 1]).toBe(1000000);
    // Dates are sorted ascending.
    const dates = m.jCurve.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("tracks cumulative paid-in and distributions monotonically", () => {
    let lastPaid = 0;
    let lastDist = 0;
    for (const p of m.jCurve) {
      expect(p.cumulativePaidIn.toNumber()).toBeGreaterThanOrEqual(lastPaid);
      expect(p.cumulativeDistributions.toNumber()).toBeGreaterThanOrEqual(lastDist);
      lastPaid = p.cumulativePaidIn.toNumber();
      lastDist = p.cumulativeDistributions.toNumber();
    }
    expectDecimal(m.jCurve[m.jCurve.length - 1].cumulativePaidIn, "8000000");
    expectDecimal(
      m.jCurve[m.jCurve.length - 1].cumulativeDistributions,
      "9000000",
    );
  });
});

describe("computeLifecycle — realizedVentureFund (no residual NAV)", () => {
  const m = computeLifecycle(realizedVentureFund);

  it("has RVPI of zero and DPI == TVPI", () => {
    expectDecimal(m.nav, "0");
    expectDecimal(m.rvpi, "0");
    // paid-in 5M, distributed 12.5M => 2.5x
    expectDecimal(m.dpi, "2.5");
    expectDecimal(m.tvpi, "2.5");
    expect(m.dpi.equals(m.tvpi)).toBe(true);
  });

  it("is fully drawn (unfunded zero, called 100%)", () => {
    expectDecimal(m.unfunded, "0");
    expectDecimal(m.calledPct, "1");
  });

  it("solves a positive IRR with NPV ~zero", () => {
    expect(m.irr).not.toBeNull();
    const flows = [
      { date: "2015-04-01", amount: "-5000000" },
      { date: "2019-08-15", amount: "4500000" },
      { date: "2022-11-30", amount: "8000000" },
    ];
    const npv = xnpv(m.irr!, flows);
    expect(npv.abs().toNumber()).toBeLessThan(1e-2);
    expect(m.irr!.toNumber()).toBeGreaterThan(0);
  });
});

describe("edge cases", () => {
  it("returns zero multiples when nothing is paid in", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Empty", committed: "1000000", vintageYear: 2024, currency: "USD" },
      cashflows: [],
    };
    const m = computeLifecycle(pos);
    expectDecimal(m.paidIn, "0");
    expectDecimal(m.tvpi, "0");
    expectDecimal(m.dpi, "0");
    expectDecimal(m.rvpi, "0");
    expectDecimal(m.unfunded, "1000000");
    expect(m.irr).toBeNull();
    expect(m.jCurve).toEqual([]);
  });

  it("returns null IRR when there are only calls and no NAV", () => {
    const pos: FundPosition = {
      commitment: { fundName: "AllCalls", committed: "1000000", vintageYear: 2024, currency: "USD" },
      cashflows: [{ date: "2024-01-01", kind: "call", amount: "500000" }],
      nav: "0",
    };
    expect(peIrr(pos)).toBeNull();
    const m = computeLifecycle(pos);
    expect(m.irr).toBeNull();
    // Still fully accounts for the paid-in capital.
    expectDecimal(m.paidIn, "500000");
    expectDecimal(m.rvpi, "0");
  });

  it("solves an IRR from calls + a terminal NAV alone (no distributions)", () => {
    const pos: FundPosition = {
      commitment: { fundName: "MarkedUp", committed: "1000000", vintageYear: 2022, currency: "USD" },
      cashflows: [{ date: "2022-01-01", kind: "call", amount: "1000000" }],
      nav: "1500000",
      asOf: "2024-01-01",
    };
    const irr = peIrr(pos);
    expect(irr).not.toBeNull();
    // 1.5x over ~2y ≈ 22.5% IRR.
    expect(irr!.toNumber()).toBeGreaterThan(0.2);
    expect(irr!.toNumber()).toBeLessThan(0.25);
  });

  it("never lets unfunded go negative when over-called", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Recycled", committed: "1000000", vintageYear: 2021, currency: "USD" },
      cashflows: [
        { date: "2021-01-01", kind: "call", amount: "700000" },
        { date: "2022-01-01", kind: "call", amount: "600000" },
      ],
    };
    const m = computeLifecycle(pos);
    // 1.3M called against a 1M commitment (recycling) — unfunded floors at 0.
    expectDecimal(m.paidIn, "1300000");
    expectDecimal(m.unfunded, "0");
  });

  it("sorts out-of-order cashflows by date before computing the J-curve", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Unsorted", committed: "1000000", vintageYear: 2020, currency: "USD" },
      cashflows: [
        { date: "2022-01-01", kind: "distribution", amount: "800000" },
        { date: "2020-01-01", kind: "call", amount: "1000000" },
      ],
    };
    const m = computeLifecycle(pos);
    expect(m.jCurve.map((p) => p.date)).toEqual(["2020-01-01", "2022-01-01"]);
    // First point is the call (underwater), then recovery toward −200k.
    expect(m.jCurve[0].cumulativeNet.toNumber()).toBe(-1000000);
    expect(m.jCurve[1].cumulativeNet.toNumber()).toBe(-200000);
  });
});

describe("adversarial edge cases", () => {
  it("keeps original order for same-date cashflows (stable sort)", () => {
    // A call and a distribution settle on the same day; the entry order in the
    // ledger must be preserved so the J-curve is deterministic.
    const pos: FundPosition = {
      commitment: { fundName: "SameDay", committed: "1000000", vintageYear: 2020, currency: "USD" },
      cashflows: [
        { date: "2020-01-01", kind: "call", amount: "1000000" },
        { date: "2020-01-01", kind: "distribution", amount: "300000" },
      ],
    };
    const m = computeLifecycle(pos);
    // Both points share the date; the running net goes −1M then −700k.
    expect(m.jCurve.map((p) => p.cumulativeNet.toNumber())).toEqual([
      -1000000, -700000,
    ]);
    expectDecimal(m.paidIn, "1000000");
    expectDecimal(m.distributed, "300000");
  });

  it("uses an explicit asOf even when it predates the last cashflow", () => {
    // The IRR's terminal NAV is dated at asOf; an asOf before the final flow
    // must still be honoured (xirr handles non-monotonic terminal dating).
    const pos: FundPosition = {
      commitment: { fundName: "EarlyMark", committed: "1000000", vintageYear: 2020, currency: "USD" },
      cashflows: [
        { date: "2020-01-01", kind: "call", amount: "1000000" },
        { date: "2023-01-01", kind: "distribution", amount: "500000" },
      ],
      nav: "800000",
      asOf: "2021-01-01",
    };
    const m = computeLifecycle(pos);
    // Multiples are date-independent: TVPI = (0.5M + 0.8M)/1M = 1.3.
    expectDecimal(m.tvpi, "1.3");
    expect(m.irr).not.toBeNull();
  });

  it("preserves the TVPI = DPI + RVPI identity for the realized fund too", () => {
    const m = computeLifecycle(realizedVentureFund);
    expectDecimal(m.dpi.plus(m.rvpi), m.tvpi.toString());
  });

  it("computes exact-decimal multiples that a float would round wrong", () => {
    // 0.1 + 0.2 != 0.3 in float; Decimal must keep it exact.
    const pos: FundPosition = {
      commitment: { fundName: "FloatTrap", committed: "1", vintageYear: 2020, currency: "USD" },
      cashflows: [
        { date: "2020-01-01", kind: "call", amount: "0.3" },
        { date: "2021-01-01", kind: "distribution", amount: "0.1" },
        { date: "2022-01-01", kind: "distribution", amount: "0.2" },
      ],
    };
    const m = computeLifecycle(pos);
    // distributed 0.1 + 0.2 = 0.3 exactly; DPI = 0.3 / 0.3 = 1.
    expectDecimal(m.distributed, "0.3");
    expectDecimal(m.dpi, "1");
  });

  it("treats zero committed safely (calledPct ratio guards divide-by-zero)", () => {
    const pos: FundPosition = {
      commitment: { fundName: "ZeroCommit", committed: "0", vintageYear: 2020, currency: "USD" },
      cashflows: [{ date: "2020-01-01", kind: "call", amount: "100" }],
    };
    const m = computeLifecycle(pos);
    // committed is 0 → calledPct ratio returns 0 rather than Infinity/NaN.
    expectDecimal(m.calledPct, "0");
    expectDecimal(m.unfunded, "0");
  });

  it("accepts a Decimal instance directly as an amount input", () => {
    const pos: FundPosition = {
      commitment: { fundName: "DecimalIn", committed: new Decimal("1000"), vintageYear: 2020, currency: "USD" },
      cashflows: [
        { date: "2020-01-01", kind: "call", amount: new Decimal("1000") },
        { date: "2021-01-01", kind: "distribution", amount: new Decimal("1500") },
      ],
    };
    const m = computeLifecycle(pos);
    expectDecimal(m.paidIn, "1000");
    expectDecimal(m.tvpi, "1.5");
  });
});

describe("input validation", () => {
  it("rejects a non-finite NAV", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Bad", committed: "1000000", vintageYear: 2024, currency: "USD" },
      cashflows: [],
      nav: Infinity,
    };
    expect(() => computeLifecycle(pos)).toThrow(/non-finite/);
  });

  it("rejects an unparseable amount string", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Bad", committed: "1000000", vintageYear: 2024, currency: "USD" },
      cashflows: [{ date: "2024-01-01", kind: "call", amount: "not-a-number" }],
    };
    expect(() => computeLifecycle(pos)).toThrow(/invalid/);
  });

  it("rejects an unknown cashflow kind", () => {
    const pos = {
      commitment: { fundName: "Bad", committed: "1000000", vintageYear: 2024, currency: "USD" },
      cashflows: [{ date: "2024-01-01", kind: "redemption", amount: "1" }],
    } as unknown as FundPosition;
    expect(() => computeLifecycle(pos)).toThrow(/call.*distribution/);
  });

  it("rejects a negative cashflow magnitude", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Bad", committed: "1000000", vintageYear: 2024, currency: "USD" },
      cashflows: [{ date: "2024-01-01", kind: "call", amount: "-1" }],
    };
    expect(() => computeLifecycle(pos)).toThrow(/positive magnitude/);
  });

  it("rejects a malformed date", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Bad", committed: "1000000", vintageYear: 2024, currency: "USD" },
      cashflows: [{ date: "2024-13-40", kind: "call", amount: "1" }],
    };
    expect(() => computeLifecycle(pos)).toThrow();
  });

  it("rejects a negative committed amount", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Bad", committed: "-1", vintageYear: 2024, currency: "USD" },
      cashflows: [],
    };
    expect(() => computeLifecycle(pos)).toThrow(/committed must be non-negative/);
  });

  it("rejects a non-integer vintage year", () => {
    const pos: FundPosition = {
      commitment: { fundName: "Bad", committed: "1", vintageYear: 2024.5, currency: "USD" },
      cashflows: [],
    };
    expect(() => computeLifecycle(pos)).toThrow(/vintageYear/);
  });
});
