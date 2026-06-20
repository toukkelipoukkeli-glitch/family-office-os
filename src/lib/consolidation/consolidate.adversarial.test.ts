import { describe, expect, it } from "vitest";

import { Money, sumMoney } from "../money";
import { Entity } from "../org/entity";

import { consolidate, type IntercompanyInvestment } from "./consolidate";

const usd = (n: string | number) => Money.of(n, "USD");

/**
 * Independent adversarial tests added by the tester. These probe boundaries the
 * owner's suite did not pin: out-of-scope intercompany stakes, diamond (multi-
 * path) ownership, a root that owns nothing of an entity, and global
 * reconciliation under each shape.
 */
describe("consolidate — adversarial scope & multi-path", () => {
  it("ignores an intercompany stake held entirely outside the root's tree", () => {
    // Root owns `sub`. A *sibling* holder `out` (not under root) holds a stake
    // in `sub`. That elimination is none of the root's business and must be
    // dropped, leaving consolidation untouched.
    const entities = [
      Entity.parse({
        id: "root",
        name: "Root",
        kind: "trust",
        nav: { amount: "0", currency: "USD" },
      }),
      Entity.parse({
        id: "sub",
        name: "Sub",
        kind: "operating",
        owners: [{ parentId: "root", ownershipPct: 1 }],
        nav: { amount: "1000000", currency: "USD" },
      }),
      Entity.parse({
        id: "out",
        name: "Outsider",
        kind: "holding",
        nav: { amount: "500000", currency: "USD" },
      }),
    ];
    const ic: IntercompanyInvestment[] = [
      {
        holderId: "out",
        investeeId: "sub",
        value: { amount: "500000", currency: "USD" },
      },
    ];
    const report = consolidate({ entities, intercompany: ic, rootId: "root" });
    // `out` is out of scope -> excluded from the entity lines entirely.
    expect(report.entities.some((e) => e.entityId === "out")).toBe(false);
    // Its stake is not eliminated.
    expect(report.eliminations).toHaveLength(0);
    expect(report.intercompanyEliminations.isZero()).toBe(true);
    // Only `sub` (1M, wholly owned) is consolidated.
    expect(report.grossNav.equals(usd(1_000_000))).toBe(true);
    expect(report.consolidatedNetWorth.equals(usd(1_000_000))).toBe(true);
  });

  it("sums effective ownership across two paths (diamond) and reconciles", () => {
    // root -> a (50%), root -> b (50%); both a and b own 50% of `leaf`.
    // Effective ownership of leaf = 0.5*0.5 + 0.5*0.5 = 0.5.
    const entities = [
      Entity.parse({
        id: "root",
        name: "Root",
        kind: "trust",
        nav: { amount: "0", currency: "USD" },
      }),
      Entity.parse({
        id: "a",
        name: "A",
        kind: "holding",
        owners: [{ parentId: "root", ownershipPct: 0.5 }],
        nav: { amount: "0", currency: "USD" },
      }),
      Entity.parse({
        id: "b",
        name: "B",
        kind: "holding",
        owners: [{ parentId: "root", ownershipPct: 0.5 }],
        nav: { amount: "0", currency: "USD" },
      }),
      Entity.parse({
        id: "leaf",
        name: "Leaf",
        kind: "operating",
        owners: [
          { parentId: "a", ownershipPct: 0.5 },
          { parentId: "b", ownershipPct: 0.5 },
        ],
        nav: { amount: "4000000", currency: "USD" },
      }),
    ];
    const report = consolidate({ entities, rootId: "root" });
    const leaf = report.entities.find((e) => e.entityId === "leaf")!;
    expect(leaf.effectivePct).toBeCloseTo(0.5, 12);
    // Owned 2M, minority 2M -> consolidated 2M (no intercompany).
    expect(report.consolidatedNetWorth.equals(usd(2_000_000))).toBe(true);
    const reconciled = report.grossNav
      .minus(report.intercompanyEliminations)
      .minus(report.minorityInterest);
    expect(reconciled.equals(report.consolidatedNetWorth)).toBe(true);
  });

  it("keeps Σ owned − Σ eliminated identity under a partial-owner holder", () => {
    // Root owns holder 40%; holder holds a 200k stake in a wholly-(of-holder)
    // owned sub. Only 40% of the carrying value is eliminated.
    const entities = [
      Entity.parse({
        id: "root",
        name: "Root",
        kind: "trust",
        nav: { amount: "0", currency: "USD" },
      }),
      Entity.parse({
        id: "h",
        name: "Holder",
        kind: "holding",
        owners: [{ parentId: "root", ownershipPct: 0.4 }],
        nav: { amount: "500000", currency: "USD" },
      }),
      Entity.parse({
        id: "sub",
        name: "Sub",
        kind: "operating",
        owners: [{ parentId: "h", ownershipPct: 1 }],
        nav: { amount: "300000", currency: "USD" },
      }),
    ];
    const ic: IntercompanyInvestment[] = [
      {
        holderId: "h",
        investeeId: "sub",
        value: { amount: "200000", currency: "USD" },
      },
    ];
    const report = consolidate({ entities, intercompany: ic, rootId: "root" });
    expect(report.eliminations[0].eliminated.equals(usd(80_000))).toBe(true);
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

  it("throws when the intercompany holder is missing", () => {
    const entities = [
      Entity.parse({
        id: "r",
        name: "Root",
        kind: "trust",
        nav: { amount: "1", currency: "USD" },
      }),
    ];
    expect(() =>
      consolidate({
        entities,
        rootId: "r",
        intercompany: [
          { holderId: "ghost", investeeId: "r", value: { amount: "1", currency: "USD" } },
        ],
      }),
    ).toThrow(/holder not found/);
  });

  it("handles a root that owns 0% of an entity (out of scope, dropped)", () => {
    // `island` has no owners and is not the root -> effectivePct 0 -> excluded.
    const entities = [
      Entity.parse({
        id: "r",
        name: "Root",
        kind: "trust",
        nav: { amount: "1000000", currency: "USD" },
      }),
      Entity.parse({
        id: "island",
        name: "Island",
        kind: "holding",
        nav: { amount: "9000000", currency: "USD" },
      }),
    ];
    const report = consolidate({ entities, rootId: "r" });
    expect(report.entities.map((e) => e.entityId)).toEqual(["r"]);
    expect(report.grossNav.equals(usd(1_000_000))).toBe(true);
    expect(report.consolidatedNetWorth.equals(usd(1_000_000))).toBe(true);
  });
});
