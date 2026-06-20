import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money, sumMoney } from "../money";
import { Entity } from "../org/entity";

import {
  consolidate,
  type ConsolidationInput,
  type IntercompanyInvestment,
} from "./consolidate";
import {
  CONSOLIDATION_ENTITIES,
  CONSOLIDATION_INTERCOMPANY,
  CONSOLIDATION_ROOT_ID,
} from "./fixtures";

const usd = (n: string | number) => Money.of(n, "USD");

function fixtureInput(
  overrides: Partial<ConsolidationInput> = {},
): ConsolidationInput {
  return {
    entities: CONSOLIDATION_ENTITIES,
    intercompany: CONSOLIDATION_INTERCOMPANY,
    rootId: CONSOLIDATION_ROOT_ID,
    ...overrides,
  };
}

describe("consolidate — fixture oracle", () => {
  const report = consolidate(fixtureInput());

  it("sums every standalone NAV into grossNav", () => {
    // 1.5 + 3 + 9 + 2.5 + 16 + 7 + 5 + 2 = 46M
    expect(report.grossNav.equals(usd(46_000_000))).toBe(true);
  });

  it("computes minority interest from non-wholly-owned subsidiaries", () => {
    // 0.5 (atlas-spv) + 6.4 (beacon) + 2.8 (pier12) + 1.25 (cobalt) + 1.25 (cobalt-spv)
    expect(report.minorityInterest.equals(usd(12_200_000))).toBe(true);
  });

  it("eliminates each intercompany investment at the holder's effective stake", () => {
    // 1.2 + 1.8 + 0.9 + 0.6 + 0.4 = 4.9M (all holders are 100% owned by root)
    expect(report.intercompanyEliminations.equals(usd(4_900_000))).toBe(true);
  });

  it("produces a consolidated net worth with no value double-counted", () => {
    expect(report.consolidatedNetWorth.equals(usd(28_900_000))).toBe(true);
  });

  it("reconciles: gross − eliminations − minority = consolidated", () => {
    const reconciled = report.grossNav
      .minus(report.intercompanyEliminations)
      .minus(report.minorityInterest);
    expect(reconciled.equals(report.consolidatedNetWorth)).toBe(true);
  });

  it("reconciles the second way: Σ ownedNav − Σ eliminated = consolidated", () => {
    const owned = sumMoney(
      report.entities.map((e) => e.ownedNav),
      "USD",
    );
    const eliminated = sumMoney(
      report.eliminations.map((e) => e.eliminated),
      "USD",
    );
    expect(owned.minus(eliminated).equals(report.consolidatedNetWorth)).toBe(
      true,
    );
  });

  it("ownedNav + minorityInterest equals standaloneNav for every entity", () => {
    for (const line of report.entities) {
      expect(
        line.ownedNav.plus(line.minorityInterest).equals(line.standaloneNav),
      ).toBe(true);
    }
  });

  it("attributes the correct effective ownership per entity", () => {
    const eff = Object.fromEntries(
      report.entities.map((e) => [e.entityId, e.effectivePct]),
    );
    expect(eff["trust"]).toBeCloseTo(1, 10);
    expect(eff["holdco"]).toBeCloseTo(1, 10);
    expect(eff["atlas"]).toBeCloseTo(1, 10);
    expect(eff["atlas-spv"]).toBeCloseTo(0.8, 10);
    expect(eff["beacon"]).toBeCloseTo(0.6, 10);
    expect(eff["pier12"]).toBeCloseTo(0.6, 10);
    expect(eff["cobalt"]).toBeCloseTo(0.75, 10);
    expect(eff["cobalt-spv"]).toBeCloseTo(0.375, 10);
  });

  it("sorts entity lines by owned NAV descending", () => {
    for (let i = 1; i < report.entities.length; i++) {
      expect(
        report.entities[i - 1].ownedNav.compare(report.entities[i].ownedNav),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("sorts eliminations by eliminated value descending", () => {
    for (let i = 1; i < report.eliminations.length; i++) {
      expect(
        report.eliminations[i - 1].eliminated.compare(
          report.eliminations[i].eliminated,
        ),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports the largest elimination first (holdco → atlas, 1.8M)", () => {
    const top = report.eliminations[0];
    expect(top.holderId).toBe("holdco");
    expect(top.investeeId).toBe("atlas");
    expect(top.eliminated.equals(usd(1_800_000))).toBe(true);
  });
});

describe("consolidate — intercompany elimination semantics", () => {
  // Two entities, parent fully owns child. Parent's NAV includes a 100k stake
  // in the child whose own NAV is 100k. Without elimination we'd see 100k twice.
  const entities = [
    Entity.parse({
      id: "p",
      name: "Parent",
      kind: "holding",
      nav: { amount: "100000", currency: "USD" },
    }),
    Entity.parse({
      id: "c",
      name: "Child",
      kind: "operating",
      owners: [{ parentId: "p", ownershipPct: 1 }],
      nav: { amount: "100000", currency: "USD" },
    }),
  ];

  it("removes the double-count of a wholly-owned intercompany stake", () => {
    const ic: IntercompanyInvestment[] = [
      { holderId: "p", investeeId: "c", value: { amount: "100000", currency: "USD" } },
    ];
    const report = consolidate({ entities, intercompany: ic, rootId: "p" });
    // gross 200k − elim 100k − minority 0 = 100k consolidated.
    expect(report.grossNav.equals(usd(200_000))).toBe(true);
    expect(report.intercompanyEliminations.equals(usd(100_000))).toBe(true);
    expect(report.consolidatedNetWorth.equals(usd(100_000))).toBe(true);
  });

  it("with no intercompany given, consolidated = Σ owned NAV", () => {
    const report = consolidate({ entities, rootId: "p" });
    expect(report.intercompanyEliminations.isZero()).toBe(true);
    expect(report.consolidatedNetWorth.equals(usd(200_000))).toBe(true);
  });

  it("eliminates only the root-owned slice of an intercompany stake", () => {
    // Root owns the holder 50%, so only half the 100k carrying value is in the
    // root's consolidated picture and only half is eliminated.
    const e = [
      Entity.parse({ id: "root", name: "Root", kind: "trust", nav: { amount: "0", currency: "USD" } }),
      Entity.parse({
        id: "h",
        name: "Holder",
        kind: "holding",
        owners: [{ parentId: "root", ownershipPct: 0.5 }],
        nav: { amount: "100000", currency: "USD" },
      }),
      Entity.parse({
        id: "sub",
        name: "Sub",
        kind: "operating",
        owners: [{ parentId: "h", ownershipPct: 1 }],
        nav: { amount: "100000", currency: "USD" },
      }),
    ];
    const ic: IntercompanyInvestment[] = [
      { holderId: "h", investeeId: "sub", value: { amount: "100000", currency: "USD" } },
    ];
    const report = consolidate({ entities: e, intercompany: ic, rootId: "root" });
    expect(report.eliminations[0].eliminated.equals(usd(50_000))).toBe(true);
    // Reconciliation still holds.
    const reconciled = report.grossNav
      .minus(report.intercompanyEliminations)
      .minus(report.minorityInterest);
    expect(reconciled.equals(report.consolidatedNetWorth)).toBe(true);
  });
});

describe("consolidate — exactness & edge cases", () => {
  it("keeps half/quarter ownership bit-exact (no binary float drift)", () => {
    // 0.5 and 0.25 are exactly representable, so the Decimal math is exact.
    const e = [
      Entity.parse({ id: "r", name: "Root", kind: "trust", nav: { amount: "0", currency: "USD" } }),
      Entity.parse({
        id: "x",
        name: "X",
        kind: "fund",
        owners: [{ parentId: "r", ownershipPct: 0.25 }],
        nav: { amount: "3000000", currency: "USD" },
      }),
    ];
    const report = consolidate({ entities: e, rootId: "r" });
    const owned = report.entities.find((l) => l.entityId === "x")!.ownedNav;
    expect(owned.amount.equals(new Decimal(750_000))).toBe(true);
  });

  it("rounds cleanly to cents on a one-third stake", () => {
    const e = [
      Entity.parse({ id: "r", name: "Root", kind: "trust", nav: { amount: "0", currency: "USD" } }),
      Entity.parse({
        id: "x",
        name: "X",
        kind: "fund",
        owners: [{ parentId: "r", ownershipPct: 1 / 3 }],
        nav: { amount: "3000000", currency: "USD" },
      }),
    ];
    const report = consolidate({ entities: e, rootId: "r" });
    const owned = report.entities.find((l) => l.entityId === "x")!.ownedNav;
    // 3,000,000 / 3 = 1,000,000 to the cent (float fraction → tiny residue).
    expect(owned.round().amount.equals(new Decimal(1_000_000))).toBe(true);
  });

  it("treats entities with no NAV as zero", () => {
    const e = [
      Entity.parse({ id: "r", name: "Root", kind: "trust" }),
      Entity.parse({
        id: "c",
        name: "C",
        kind: "operating",
        owners: [{ parentId: "r", ownershipPct: 1 }],
        nav: { amount: "500000", currency: "USD" },
      }),
    ];
    const report = consolidate({ entities: e, rootId: "r", currency: "USD" });
    expect(report.grossNav.equals(usd(500_000))).toBe(true);
    expect(report.consolidatedNetWorth.equals(usd(500_000))).toBe(true);
  });

  it("excludes entities outside the root's ownership scope", () => {
    // Consolidating up to the holdco drops the parent trust entirely (the root
    // does not own the trust) and removes the trust→holdco elimination.
    const report = consolidate(fixtureInput({ rootId: "holdco" }));
    expect(report.entities.some((e) => e.entityId === "trust")).toBe(false);
    // gross = 46M − 1.5M trust = 44.5M.
    expect(report.grossNav.equals(usd(44_500_000))).toBe(true);
    // Only the 4 holdco/atlas-held stakes remain.
    expect(report.eliminations).toHaveLength(4);
    expect(report.intercompanyEliminations.equals(usd(3_700_000))).toBe(true);
    // Reconciliation still holds in the narrowed scope.
    const reconciled = report.grossNav
      .minus(report.intercompanyEliminations)
      .minus(report.minorityInterest);
    expect(reconciled.equals(report.consolidatedNetWorth)).toBe(true);
  });

  it("throws on an unknown root", () => {
    expect(() => consolidate(fixtureInput({ rootId: "nope" }))).toThrow(
      /unknown root/,
    );
  });

  it("throws when intercompany references a missing entity", () => {
    expect(() =>
      consolidate(
        fixtureInput({
          intercompany: [
            { holderId: "holdco", investeeId: "ghost", value: { amount: "1", currency: "USD" } },
          ],
        }),
      ),
    ).toThrow(/investee not found/);
  });

  it("throws when an entity invests in itself", () => {
    expect(() =>
      consolidate(
        fixtureInput({
          intercompany: [
            { holderId: "holdco", investeeId: "holdco", value: { amount: "1", currency: "USD" } },
          ],
        }),
      ),
    ).toThrow(/cannot invest in itself/);
  });

  it("throws on a currency mismatch", () => {
    const e = [
      Entity.parse({ id: "r", name: "Root", kind: "trust", nav: { amount: "1", currency: "EUR" } }),
    ];
    expect(() => consolidate({ entities: e, rootId: "r", currency: "USD" })).toThrow(
      /currency mismatch/,
    );
  });

  it("throws on an invalid org (cycle)", () => {
    const e = [
      Entity.parse({ id: "a", name: "A", kind: "holding", owners: [{ parentId: "b", ownershipPct: 1 }] }),
      Entity.parse({ id: "b", name: "B", kind: "holding", owners: [{ parentId: "a", ownershipPct: 1 }] }),
    ];
    expect(() => consolidate({ entities: e, rootId: "a", currency: "USD" })).toThrow(
      /cannot consolidate/,
    );
  });
});
