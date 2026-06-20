/**
 * Adversarial / property-style coverage for the estate engine.
 *
 * Independent of the happy-path suite: it hammers invariants that must hold for
 * *any* valid plan, plus nasty edge cases the example tests don't reach.
 * Deterministic and offline — every "random" plan is generated from a fixed
 * integer seed (mulberry32), so a failure reproduces exactly.
 */

import { describe, expect, it } from "vitest";

import { Money, sumMoney } from "@/lib/money";

import {
  analyzeEstate,
  LIQUIDITY_CLASSES,
  type EstatePlan,
  type LiquidityClass,
} from "./estate";

/** Tiny seeded PRNG — deterministic across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const usd = (a: string) => Money.of(a, "USD");

/** Generate a structurally valid but arbitrary plan from a seed. */
function randomPlan(seed: number): EstatePlan {
  const rng = mulberry32(seed);
  const int = (lo: number, hi: number) =>
    lo + Math.floor(rng() * (hi - lo + 1));

  const nAssets = int(1, 6);
  const assets = Array.from({ length: nAssets }, (_, i) => ({
    id: `a${i}`,
    name: `Asset ${i}`,
    value: usd(String(int(0, 5_000_000))),
    liquidity: LIQUIDITY_CLASSES[int(0, 2)] as LiquidityClass,
  }));

  const relations = ["spouse", "child", "relative", "charity", "other"] as const;
  const nBen = int(1, 4);
  const beneficiaries = Array.from({ length: nBen }, (_, i) => ({
    id: `b${i}`,
    name: `Ben ${i}`,
    relation: relations[int(0, relations.length - 1)],
  }));

  const bequests = beneficiaries.map((b, i) =>
    rng() < 0.4
      ? {
          id: `q${i}`,
          beneficiaryId: b.id,
          amount: usd(String(int(0, 2_000_000))),
        }
      : { id: `q${i}`, beneficiaryId: b.id, residueShare: int(0, 5) },
  );

  return {
    id: `plan-${seed}`,
    name: `Plan ${seed}`,
    currency: "USD",
    principal: "P",
    entities: [],
    assets,
    liabilities:
      rng() < 0.5
        ? [{ id: "l0", name: "Debt", amount: usd(String(int(0, 1_000_000))) }]
        : [],
    beneficiaries,
    bequests,
    exemption: usd(String(int(0, 10_000_000))),
    taxRate: int(0, 50) / 100,
    adminCostRate: int(0, 5) / 100,
  };
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7 + 1);

describe("estate engine invariants (property-style)", () => {
  it("never produces a negative taxable estate or negative tax", () => {
    for (const seed of SEEDS) {
      const a = analyzeEstate(randomPlan(seed));
      expect(a.taxableEstate.isNegative(), `seed ${seed}`).toBe(false);
      expect(a.estateTax.isNegative(), `seed ${seed}`).toBe(false);
    }
  });

  it("estate tax never exceeds taxable estate × rate (rounding aside)", () => {
    for (const seed of SEEDS) {
      const plan = randomPlan(seed);
      const a = analyzeEstate(plan);
      const cap = a.taxableEstate.times(plan.taxRate);
      // tax ≤ cap + 1 minor unit of rounding slack (inclusive of an exact cent).
      expect(
        a.estateTax.minus(cap).greaterThan(usd("0.01")),
        `seed ${seed}`,
      ).toBe(false);
    }
  });

  it("liquidity buckets sum (gross) to the gross estate", () => {
    for (const seed of SEEDS) {
      const a = analyzeEstate(randomPlan(seed));
      const sumGross = sumMoney(
        a.buckets.map((b) => b.gross),
        "USD",
      );
      expect(sumGross.toString(), `seed ${seed}`).toBe(a.grossEstate.toString());
    }
  });

  it("net bucket value never exceeds gross (haircut is a loss, not a gain)", () => {
    for (const seed of SEEDS) {
      const a = analyzeEstate(randomPlan(seed));
      for (const b of a.buckets) {
        expect(b.net.greaterThan(b.gross), `seed ${seed} ${b.cls}`).toBe(false);
      }
    }
  });

  it("coverage and shortfall are mutually consistent", () => {
    for (const seed of SEEDS) {
      const a = analyzeEstate(randomPlan(seed));
      if (a.covered) {
        expect(a.shortfall.isZero(), `seed ${seed}`).toBe(true);
        expect(
          a.liquidAvailable.lessThan(a.settlementNeed),
          `seed ${seed}`,
        ).toBe(false);
      } else {
        expect(a.shortfall.isPositive(), `seed ${seed}`).toBe(true);
        expect(
          a.shortfall.toString(),
          `seed ${seed}`,
        ).toBe(a.settlementNeed.minus(a.liquidAvailable).toString());
      }
    }
  });

  it("the funding waterfall's net draws cover the settlement need (or exhaust everything)", () => {
    for (const seed of SEEDS) {
      const a = analyzeEstate(randomPlan(seed));
      const fundedNet = sumMoney(
        a.fundingWaterfall.map((s) => s.netUsed),
        "USD",
      );
      if (!a.totalRealizable.lessThan(a.settlementNeed)) {
        // Enough total liquidity exists → waterfall meets the need exactly.
        expect(fundedNet.toString(), `seed ${seed}`).toBe(
          a.settlementNeed.toString(),
        );
      } else {
        // Not enough even selling everything → waterfall taps the full book.
        expect(fundedNet.toString(), `seed ${seed}`).toBe(
          a.totalRealizable.toString(),
        );
      }
    }
  });

  it("waterfall steps are drained in liquidity priority order", () => {
    for (const seed of SEEDS) {
      const a = analyzeEstate(randomPlan(seed));
      const priorities = a.fundingWaterfall.map((s) =>
        LIQUIDITY_CLASSES.indexOf(s.cls),
      );
      const sorted = [...priorities].sort((x, y) => x - y);
      expect(priorities, `seed ${seed}`).toEqual(sorted);
    }
  });

  it("estate→entity flow links always conserve the gross estate", () => {
    for (const seed of SEEDS) {
      const a = analyzeEstate(randomPlan(seed));
      const fromEstate = a.flowLinks
        .filter((l) => l.source === "estate")
        .reduce((acc, l) => acc.plus(l.value), Money.zero("USD"));
      // All assets are held personally here (no entities), so one link.
      expect(fromEstate.toString(), `seed ${seed}`).toBe(
        a.grossEstate.isZero() ? "0 USD" : a.grossEstate.toString(),
      );
    }
  });

  it("exempt bequests never inflate the taxable estate", () => {
    for (const seed of SEEDS) {
      const plan = randomPlan(seed);
      const a = analyzeEstate(plan);
      // Beneficiary-share tax for spouse/charity must be zero.
      for (const s of a.beneficiaryShares) {
        if (s.relation === "spouse" || s.relation === "charity") {
          expect(s.tax.toString(), `seed ${seed} ${s.name}`).toBe("0 USD");
        }
      }
    }
  });

  it("the succession flow conserves value through the entity layer", () => {
    // Multi-entity plans (the property generator above uses none): each entity
    // node's incoming value (estate → entity) must equal its outgoing value
    // (entity → beneficiaries + entity → tax), to within rounding slack.
    for (const seed of SEEDS.slice(0, 30)) {
      const plan = withEntities(randomPlan(seed), seed);
      const a = analyzeEstate(plan);

      for (const node of a.flowNodes) {
        if (node.kind !== "entity") continue;
        const incoming = sumLinks(a.flowLinks, (l) => l.target === node.id);
        const outgoing = sumLinks(a.flowLinks, (l) => l.source === node.id);
        // Per-node conservation is exact (the last target absorbs the residual).
        expect(outgoing.toString(), `seed ${seed} ${node.id}`).toBe(
          incoming.toString(),
        );
      }

      // Estate → entity links still sum to the gross estate.
      const fromEstate = sumLinks(a.flowLinks, (l) => l.source === "estate");
      expect(fromEstate.toString(), `seed ${seed}`).toBe(
        a.grossEstate.isZero() ? "0 USD" : a.grossEstate.toString(),
      );

      // The whole entity layer conserves value: total inflow (gross estate) ==
      // total outflow to beneficiaries-net + tax + debts/admin + residue.
      const totalOut = sumLinks(a.flowLinks, (l) =>
        l.source.startsWith("entity:"),
      );
      expect(totalOut.toString(), `seed ${seed} layer`).toBe(
        fromEstate.toString(),
      );
    }
  });

  it("a zero-value estate analyzes cleanly without dividing by zero", () => {
    const empty: EstatePlan = {
      id: "empty",
      name: "Empty",
      currency: "USD",
      principal: "P",
      entities: [],
      assets: [{ id: "a0", name: "A", value: usd("0"), liquidity: "cash" }],
      liabilities: [],
      beneficiaries: [{ id: "b0", name: "B", relation: "child" }],
      bequests: [{ id: "q0", beneficiaryId: "b0", residueShare: 1 }],
      exemption: usd("0"),
      taxRate: 0.4,
    };
    const a = analyzeEstate(empty);
    expect(a.grossEstate.toString()).toBe("0 USD");
    expect(a.estateTax.toString()).toBe("0 USD");
    // Zero settlement need is treated as fully covered (coverage = 100%).
    expect(a.covered).toBe(true);
    expect(a.coverageRatio.toString()).toBe("1");
    expect(a.shortfall.toString()).toBe("0 USD");
  });
});

/** Sum the value of every flow link matching `pred` (USD). */
function sumLinks(
  links: ReturnType<typeof analyzeEstate>["flowLinks"],
  pred: (l: (typeof links)[number]) => boolean,
): Money {
  return sumMoney(
    links.filter(pred).map((l) => l.value),
    "USD",
  );
}

/** Attach holding entities to a generated plan, round-robin across its assets. */
function withEntities(plan: EstatePlan, seed: number): EstatePlan {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const entities = [
    { id: "e0", name: "Trust", kind: "trust" as const },
    { id: "e1", name: "HoldCo", kind: "holdco" as const },
  ];
  const assets = plan.assets.map((a, i) =>
    // Leave some assets held personally (undefined entityId) to mix both paths.
    rng() < 0.75 ? { ...a, entityId: entities[i % entities.length].id } : a,
  );
  return { ...plan, entities, assets };
}
