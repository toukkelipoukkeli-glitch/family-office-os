import { describe, expect, it } from "vitest";

import { Entity } from "../org/entity";

import {
  consolidateLookThrough,
  directGross,
} from "./consolidate";
import { EntityHoldings } from "./exposure";
import {
  LOOKTHROUGH_ENTITIES,
  LOOKTHROUGH_HOLDINGS,
  LOOKTHROUGH_ROOT_ID,
} from "./fixtures";

/** Convenience: find a line's value amount as a plain string. */
function lineAmount(
  report: ReturnType<typeof consolidateLookThrough>,
  cls: string,
): string | undefined {
  return report.lines
    .find((l) => l.assetClass === cls)
    ?.value.amount.toString();
}

describe("consolidateLookThrough — fixture oracle", () => {
  const report = consolidateLookThrough(
    LOOKTHROUGH_ENTITIES,
    LOOKTHROUGH_HOLDINGS,
    LOOKTHROUGH_ROOT_ID,
  );

  it("reports the root and currency", () => {
    expect(report.rootId).toBe("trust");
    expect(report.rootName).toBe("Ravenscroft Family Trust");
    expect(report.currency).toBe("USD");
  });

  it("attributes equity at 100% (wholly-owned operating co)", () => {
    // Meridian 9,000,000 × 1.0
    expect(lineAmount(report, "equity")).toBe("9000000");
  });

  it("rolls cash up across two wholly-owned entities", () => {
    // holdco 1,500,000 × 1 + meridian 1,000,000 × 1
    expect(lineAmount(report, "cash")).toBe("2500000");
  });

  it("rolls real estate through three partial chains", () => {
    // meridian-spv 2,500,000 × 0.8 = 2,000,000
    // harbor       8,000,000 × 0.6 = 4,800,000
    // pier9        6,800,000 × 0.6 = 4,080,000
    expect(lineAmount(report, "real_estate")).toBe("10880000");
  });

  it("rolls private equity through the deep half-owned SPV", () => {
    // aurora 5,200,000 × 0.75 = 3,900,000
    // aurora-climate 1,500,000 × (0.75 × 0.5 = 0.375) = 562,500
    expect(lineAmount(report, "private_equity")).toBe("4462500");
  });

  it("attributes crypto at the deep effective stake", () => {
    // aurora-climate 400,000 × 0.375 = 150,000
    expect(lineAmount(report, "crypto")).toBe("150000");
  });

  it("attributes fixed income at the 40% fund stake", () => {
    // beacon 12,000,000 × 0.4 = 4,800,000
    expect(lineAmount(report, "fixed_income")).toBe("4800000");
  });

  it("totals to the sum of all look-through lines", () => {
    expect(report.total.amount.toString()).toBe("31792500");
    const sumOfLines = report.lines.reduce(
      (acc, l) => acc.plus(l.value.amount),
      report.lines[0].value.amount.minus(report.lines[0].value.amount),
    );
    expect(sumOfLines.toString()).toBe(report.total.amount.toString());
  });

  it("weights sum to ~1 and are each in [0,1]", () => {
    const sum = report.lines.reduce((a, l) => a + l.weight, 0);
    expect(sum).toBeCloseTo(1, 10);
    for (const l of report.lines) {
      expect(l.weight).toBeGreaterThanOrEqual(0);
      expect(l.weight).toBeLessThanOrEqual(1);
    }
  });

  it("sorts lines by look-through value descending", () => {
    const values = report.lines.map((l) => l.value.amount.toNumber());
    const sorted = [...values].sort((a, b) => b - a);
    expect(values).toEqual(sorted);
  });

  it("real estate is the largest exposure", () => {
    expect(report.lines[0].assetClass).toBe("real_estate");
  });

  it("each line's contributions sum exactly to the line value", () => {
    for (const line of report.lines) {
      const sum = line.contributions.reduce(
        (acc, c) => acc.plus(c.attributed.amount),
        line.value.amount.minus(line.value.amount),
      );
      expect(sum.toString()).toBe(line.value.amount.toString());
    }
  });

  it("real-estate line is attributed to three entities, largest first", () => {
    const re = report.lines.find((l) => l.assetClass === "real_estate")!;
    expect(re.contributions.map((c) => c.entityId)).toEqual([
      "harbor", // 4,800,000
      "pier9", // 4,080,000
      "meridian-spv", // 2,000,000
    ]);
  });
});

describe("consolidateLookThrough — reporting from a sub-root", () => {
  it("excludes entities the chosen root does not own", () => {
    // Report from Harbor: it only owns Pier 9 (100%); nothing upstream.
    const report = consolidateLookThrough(
      LOOKTHROUGH_ENTITIES,
      LOOKTHROUGH_HOLDINGS,
      "harbor",
    );
    // Harbor's own 8M real estate + Pier 9's 6.8M × 100% = 14,800,000.
    expect(report.total.amount.toString()).toBe("14800000");
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0].assetClass).toBe("real_estate");
    // No equity / PE / cash leak in from sibling branches.
    expect(report.lines.find((l) => l.assetClass === "equity")).toBeUndefined();
  });

  it("a leaf root sees only its own holdings", () => {
    const report = consolidateLookThrough(
      LOOKTHROUGH_ENTITIES,
      LOOKTHROUGH_HOLDINGS,
      "pier9",
    );
    expect(report.total.amount.toString()).toBe("6800000");
  });
});

describe("consolidateLookThrough — additivity property", () => {
  it("root total equals the sum of its direct subsidiaries' look-through shares", () => {
    // The trust owns holdco 100%; holdco's look-through (reported from holdco)
    // plus the trust's own holdings (none) must equal the trust's total.
    const fromTrust = consolidateLookThrough(
      LOOKTHROUGH_ENTITIES,
      LOOKTHROUGH_HOLDINGS,
      "trust",
    );
    const fromHoldco = consolidateLookThrough(
      LOOKTHROUGH_ENTITIES,
      LOOKTHROUGH_HOLDINGS,
      "holdco",
    );
    // Trust owns 100% of holdco and has no direct holdings, so totals match.
    expect(fromTrust.total.amount.toString()).toBe(
      fromHoldco.total.amount.toString(),
    );
  });
});

describe("consolidateLookThrough — edge cases", () => {
  const entities = [
    Entity.parse({ id: "r", name: "Root", kind: "trust" }),
    Entity.parse({
      id: "a",
      name: "A",
      kind: "operating",
      owners: [{ parentId: "r", ownershipPct: 0.5 }],
    }),
  ];

  it("handles an empty holdings list (zero total)", () => {
    const report = consolidateLookThrough(entities, [], "r", {
      currency: "EUR",
    });
    expect(report.total.amount.toString()).toBe("0");
    expect(report.lines).toHaveLength(0);
    expect(report.currency).toBe("EUR");
  });

  it("halves a 50%-owned subsidiary's holdings", () => {
    const holdings = [
      EntityHoldings.parse({
        entityId: "a",
        holdings: [
          { assetClass: "equity", value: { amount: "1000000", currency: "USD" } },
        ],
      }),
    ];
    const report = consolidateLookThrough(entities, holdings, "r");
    expect(report.total.amount.toString()).toBe("500000");
  });

  it("combines duplicate asset classes within one entity", () => {
    const holdings = [
      EntityHoldings.parse({
        entityId: "a",
        holdings: [
          { assetClass: "equity", value: { amount: "100", currency: "USD" } },
          { assetClass: "equity", value: { amount: "300", currency: "USD" } },
        ],
      }),
    ];
    const report = consolidateLookThrough(entities, holdings, "r");
    // (100 + 300) × 0.5 = 200, attributed in a single contribution row.
    expect(report.total.amount.toString()).toBe("200");
    expect(report.lines[0].contributions).toHaveLength(1);
  });

  it("throws on an unknown root", () => {
    expect(() => consolidateLookThrough(entities, [], "nope")).toThrow(
      /root entity not found/i,
    );
  });

  it("throws when the org has a cycle", () => {
    const cyclic = [
      Entity.parse({
        id: "x",
        name: "X",
        kind: "holding",
        owners: [{ parentId: "y", ownershipPct: 1 }],
      }),
      Entity.parse({
        id: "y",
        name: "Y",
        kind: "holding",
        owners: [{ parentId: "x", ownershipPct: 1 }],
      }),
    ];
    expect(() => consolidateLookThrough(cyclic, [], "x")).toThrow(
      /invalid|cycle/i,
    );
  });

  it("throws when holdings mix currencies", () => {
    const holdings = [
      EntityHoldings.parse({
        entityId: "a",
        holdings: [
          { assetClass: "equity", value: { amount: "1", currency: "USD" } },
        ],
      }),
      EntityHoldings.parse({
        entityId: "r",
        holdings: [
          { assetClass: "cash", value: { amount: "1", currency: "EUR" } },
        ],
      }),
    ];
    expect(() => consolidateLookThrough(entities, holdings, "r")).toThrow(
      /single currency/i,
    );
  });

  it("throws when holdings reference an entity missing from the org", () => {
    const holdings = [
      EntityHoldings.parse({
        entityId: "ghost",
        holdings: [
          { assetClass: "cash", value: { amount: "1", currency: "USD" } },
        ],
      }),
    ];
    // 'ghost' has no effective ownership from r, so it is skipped (pct <= 0):
    // the engine reports zero rather than throwing for unreachable holdings.
    const report = consolidateLookThrough(entities, holdings, "r");
    expect(report.total.amount.toString()).toBe("0");
  });

  it("throws on duplicate holdings entries for one entity", () => {
    const holdings = [
      EntityHoldings.parse({ entityId: "a", holdings: [] }),
      EntityHoldings.parse({ entityId: "a", holdings: [] }),
    ];
    expect(() => consolidateLookThrough(entities, holdings, "r")).toThrow(
      /duplicate holdings/i,
    );
  });
});

describe("consolidateLookThrough — adversarial edge cases", () => {
  it("sums two independent ownership paths (diamond) into one effective stake", () => {
    // r owns m (50%) and n (50%); both own leaf (40% each). Effective
    // ownership of leaf = 0.5*0.4 + 0.5*0.4 = 0.4. A naive single-path walk
    // would under-count this.
    const entities = [
      Entity.parse({ id: "r", name: "Root", kind: "trust" }),
      Entity.parse({
        id: "m",
        name: "M",
        kind: "holding",
        owners: [{ parentId: "r", ownershipPct: 0.5 }],
      }),
      Entity.parse({
        id: "n",
        name: "N",
        kind: "holding",
        owners: [{ parentId: "r", ownershipPct: 0.5 }],
      }),
      Entity.parse({
        id: "leaf",
        name: "Leaf",
        kind: "operating",
        owners: [
          { parentId: "m", ownershipPct: 0.4 },
          { parentId: "n", ownershipPct: 0.4 },
        ],
      }),
    ];
    const holdings = [
      EntityHoldings.parse({
        entityId: "leaf",
        holdings: [
          { assetClass: "equity", value: { amount: "1000000", currency: "USD" } },
        ],
      }),
    ];
    const report = consolidateLookThrough(entities, holdings, "r");
    // 1,000,000 × 0.4 = 400,000.
    expect(report.total.amount.toString()).toBe("400000");
    const eq = report.lines.find((l) => l.assetClass === "equity")!;
    expect(eq.contributions).toHaveLength(1);
    expect(eq.contributions[0].effectivePct).toBeCloseTo(0.4, 12);
  });

  it("attributes the root's own holdings at 100% (effective ownership of self)", () => {
    const entities = [
      Entity.parse({ id: "r", name: "Root", kind: "trust" }),
      Entity.parse({
        id: "a",
        name: "A",
        kind: "operating",
        owners: [{ parentId: "r", ownershipPct: 0.5 }],
      }),
    ];
    const holdings = [
      EntityHoldings.parse({
        entityId: "r",
        holdings: [
          { assetClass: "cash", value: { amount: "250000", currency: "USD" } },
        ],
      }),
      EntityHoldings.parse({
        entityId: "a",
        holdings: [
          { assetClass: "cash", value: { amount: "250000", currency: "USD" } },
        ],
      }),
    ];
    const report = consolidateLookThrough(entities, holdings, "r");
    // root 250,000 × 1.0 + a 250,000 × 0.5 = 375,000.
    expect(report.total.amount.toString()).toBe("375000");
    const cash = report.lines.find((l) => l.assetClass === "cash")!;
    const rootRow = cash.contributions.find((c) => c.entityId === "r")!;
    expect(rootRow.effectivePct).toBe(1);
    expect(rootRow.attributed.amount.toString()).toBe("250000");
  });

  it("keeps a repeating-decimal split exact in Decimal and additive", () => {
    // 100 owned at 1/3 → 33.333... which floating point cannot represent.
    // The contribution must still sum exactly back to the line value.
    const entities = [
      Entity.parse({ id: "r", name: "Root", kind: "trust" }),
      Entity.parse({
        id: "a",
        name: "A",
        kind: "operating",
        owners: [{ parentId: "r", ownershipPct: 1 / 3 }],
      }),
    ];
    const holdings = [
      EntityHoldings.parse({
        entityId: "a",
        holdings: [
          { assetClass: "equity", value: { amount: "100", currency: "USD" } },
        ],
      }),
    ];
    const report = consolidateLookThrough(entities, holdings, "r");
    const eq = report.lines.find((l) => l.assetClass === "equity")!;
    const sum = eq.contributions.reduce(
      (acc, c) => acc.plus(c.attributed.amount),
      eq.value.amount.minus(eq.value.amount),
    );
    expect(sum.toString()).toBe(eq.value.amount.toString());
    expect(report.total.amount.toString()).toBe(eq.value.amount.toString());
  });

  it("omits a zero-valued holding from contributions entirely", () => {
    const entities = [
      Entity.parse({ id: "r", name: "Root", kind: "trust" }),
      Entity.parse({
        id: "a",
        name: "A",
        kind: "operating",
        owners: [{ parentId: "r", ownershipPct: 1 }],
      }),
    ];
    const holdings = [
      EntityHoldings.parse({
        entityId: "a",
        holdings: [
          { assetClass: "equity", value: { amount: "0", currency: "USD" } },
          { assetClass: "cash", value: { amount: "100", currency: "USD" } },
        ],
      }),
    ];
    const report = consolidateLookThrough(entities, holdings, "r");
    expect(report.lines.map((l) => l.assetClass)).toEqual(["cash"]);
    expect(report.total.amount.toString()).toBe("100");
  });

  it("does not leak holdings from a sibling the root does not own", () => {
    // r owns a (100%); b is a sibling root-less branch r has no stake in.
    const entities = [
      Entity.parse({ id: "r", name: "Root", kind: "trust" }),
      Entity.parse({
        id: "a",
        name: "A",
        kind: "operating",
        owners: [{ parentId: "r", ownershipPct: 1 }],
      }),
      Entity.parse({ id: "b", name: "B", kind: "operating" }),
    ];
    const holdings = [
      EntityHoldings.parse({
        entityId: "a",
        holdings: [
          { assetClass: "equity", value: { amount: "100", currency: "USD" } },
        ],
      }),
      EntityHoldings.parse({
        entityId: "b",
        holdings: [
          { assetClass: "equity", value: { amount: "999", currency: "USD" } },
        ],
      }),
    ];
    const report = consolidateLookThrough(entities, holdings, "r");
    expect(report.total.amount.toString()).toBe("100");
  });
});

describe("directGross", () => {
  it("sums an entity's own balance sheet ignoring ownership", () => {
    const g = directGross(LOOKTHROUGH_HOLDINGS, "aurora-climate", "USD");
    // 1,500,000 + 400,000
    expect(g.amount.toString()).toBe("1900000");
  });

  it("returns zero for an entity with no holdings", () => {
    const g = directGross(LOOKTHROUGH_HOLDINGS, "trust", "USD");
    expect(g.amount.toString()).toBe("0");
  });

  it("refuses to sum a holding whose currency differs from the label", () => {
    const holdings = [
      EntityHoldings.parse({
        entityId: "x",
        holdings: [
          { assetClass: "cash", value: { amount: "100", currency: "EUR" } },
        ],
      }),
    ];
    expect(() => directGross(holdings, "x", "USD")).toThrow(
      /does not match requested/i,
    );
  });
});
