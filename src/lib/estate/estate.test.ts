import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import {
  analyzeEstate,
  DEFAULT_LIQUIDITY_HAIRCUTS,
  EstateError,
  formatCoverage,
  LIQUIDITY_CLASSES,
  liquidityPriority,
  validateEstatePlan,
  type EstatePlan,
} from "./estate";
import { seededEstatePlan } from "./fixtures";

const usd = (a: string) => Money.of(a, "USD");

/** A tiny, fully-controllable plan for arithmetic checks. */
function tinyPlan(overrides: Partial<EstatePlan> = {}): EstatePlan {
  return {
    id: "p",
    name: "tiny",
    currency: "USD",
    principal: "P",
    entities: [{ id: "t", name: "Trust", kind: "trust" }],
    assets: [
      { id: "cash", name: "Cash", value: usd("100000"), liquidity: "cash" },
      {
        id: "mkt",
        name: "Stocks",
        value: usd("200000"),
        liquidity: "marketable",
        entityId: "t",
      },
      {
        id: "ill",
        name: "Company",
        value: usd("700000"),
        liquidity: "illiquid",
        entityId: "t",
      },
    ],
    liabilities: [],
    beneficiaries: [{ id: "kid", name: "Kid", relation: "child" }],
    bequests: [{ id: "bq", beneficiaryId: "kid", residueShare: 1 }],
    exemption: usd("0"),
    taxRate: 0.5,
    ...overrides,
  };
}

describe("liquidity classes", () => {
  it("are ordered most-liquid first and prioritized accordingly", () => {
    expect(LIQUIDITY_CLASSES).toEqual(["cash", "marketable", "illiquid"]);
    expect(liquidityPriority("cash")).toBe(0);
    expect(liquidityPriority("marketable")).toBe(1);
    expect(liquidityPriority("illiquid")).toBe(2);
  });

  it("cash never takes a haircut; illiquids take the steepest", () => {
    expect(DEFAULT_LIQUIDITY_HAIRCUTS.cash).toBe("0");
    expect(
      new Decimal(DEFAULT_LIQUIDITY_HAIRCUTS.illiquid).greaterThan(
        DEFAULT_LIQUIDITY_HAIRCUTS.marketable,
      ),
    ).toBe(true);
  });
});

describe("validateEstatePlan", () => {
  it("accepts the seeded plan", () => {
    expect(() => validateEstatePlan(seededEstatePlan)).not.toThrow();
  });

  it("rejects an out-of-range tax rate", () => {
    expect(() => validateEstatePlan(tinyPlan({ taxRate: 1.4 }))).toThrow(
      EstateError,
    );
    expect(() => validateEstatePlan(tinyPlan({ taxRate: -0.1 }))).toThrow(
      EstateError,
    );
  });

  it("rejects a currency mismatch in an asset", () => {
    const plan = tinyPlan();
    plan.assets[0] = { ...plan.assets[0], value: Money.of("1", "EUR") };
    expect(() => validateEstatePlan(plan)).toThrow(/currency mismatch/);
  });

  it("rejects an asset pointing at an unknown entity", () => {
    const plan = tinyPlan();
    plan.assets[0] = { ...plan.assets[0], entityId: "nope" };
    expect(() => validateEstatePlan(plan)).toThrow(/unknown entity/);
  });

  it("rejects a bequest pointing at an unknown beneficiary", () => {
    const plan = tinyPlan();
    plan.bequests = [{ id: "x", beneficiaryId: "ghost", residueShare: 1 }];
    expect(() => validateEstatePlan(plan)).toThrow(/unknown beneficiary/);
  });

  it("rejects a bequest that sets both amount and residueShare", () => {
    const plan = tinyPlan();
    plan.bequests = [
      { id: "x", beneficiaryId: "kid", amount: usd("1"), residueShare: 1 },
    ];
    expect(() => validateEstatePlan(plan)).toThrow(/exactly one/);
  });

  it("rejects a bequest that sets neither amount nor residueShare", () => {
    const plan = tinyPlan();
    plan.bequests = [{ id: "x", beneficiaryId: "kid" }];
    expect(() => validateEstatePlan(plan)).toThrow(/exactly one/);
  });

  it("rejects duplicate ids", () => {
    const dup = tinyPlan();
    dup.assets.push({ ...dup.assets[0] });
    expect(() => validateEstatePlan(dup)).toThrow(/duplicate asset id/);
  });
});

describe("analyzeEstate — tax math", () => {
  it("computes a simple taxable estate and tax", () => {
    // gross 1,000,000; no debts/admin/exemption; 50% rate; no exempt bequests.
    const a = analyzeEstate(tinyPlan());
    expect(a.grossEstate.toString()).toBe("1000000 USD");
    expect(a.netEstate.toString()).toBe("1000000 USD");
    expect(a.taxableEstate.toString()).toBe("1000000 USD");
    expect(a.estateTax.toString()).toBe("500000 USD");
  });

  it("applies the lifetime exemption before taxing", () => {
    const a = analyzeEstate(tinyPlan({ exemption: usd("400000") }));
    // taxable = 1,000,000 − 400,000 = 600,000; tax = 300,000.
    expect(a.exemptionApplied.toString()).toBe("400000 USD");
    expect(a.taxableEstate.toString()).toBe("600000 USD");
    expect(a.estateTax.toString()).toBe("300000 USD");
  });

  it("caps the exemption at the net estate (never negative taxable estate)", () => {
    const a = analyzeEstate(tinyPlan({ exemption: usd("5000000") }));
    expect(a.exemptionApplied.toString()).toBe("1000000 USD");
    expect(a.taxableEstate.toString()).toBe("0 USD");
    expect(a.estateTax.toString()).toBe("0 USD");
  });

  it("excludes spousal and charitable bequests from the taxable estate", () => {
    const plan = tinyPlan({
      beneficiaries: [
        { id: "sp", name: "Spouse", relation: "spouse" },
        { id: "kid", name: "Kid", relation: "child" },
      ],
      bequests: [
        { id: "b1", beneficiaryId: "sp", amount: usd("600000") },
        { id: "b2", beneficiaryId: "kid", residueShare: 1 },
      ],
    });
    const a = analyzeEstate(plan);
    // 600k passes to spouse tax-free; residue 400k to kid is taxable.
    expect(a.exemptBequests.toString()).toBe("600000 USD");
    expect(a.netEstate.toString()).toBe("400000 USD");
    expect(a.estateTax.toString()).toBe("200000 USD");
  });

  it("subtracts debts and admin cost before tax", () => {
    const plan = tinyPlan({
      liabilities: [{ id: "d", name: "Loan", amount: usd("100000") }],
      adminCostRate: 0.02, // 2% of 1,000,000 = 20,000
    });
    const a = analyzeEstate(plan);
    expect(a.totalDebts.toString()).toBe("100000 USD");
    expect(a.adminCost.toString()).toBe("20000 USD");
    // net estate = 1,000,000 − 100,000 − 20,000 = 880,000; tax = 440,000.
    expect(a.netEstate.toString()).toBe("880000 USD");
    expect(a.estateTax.toString()).toBe("440000 USD");
  });
});

describe("analyzeEstate — liquidity at death", () => {
  it("rolls up each liquidity class with its haircut", () => {
    const a = analyzeEstate(tinyPlan());
    const byCls = Object.fromEntries(a.buckets.map((b) => [b.cls, b]));
    expect(byCls.cash.gross.toString()).toBe("100000 USD");
    expect(byCls.cash.net.toString()).toBe("100000 USD"); // 0% haircut
    expect(byCls.marketable.net.toString()).toBe("190000 USD"); // 5% of 200k
    expect(byCls.illiquid.net.toString()).toBe("490000 USD"); // 30% of 700k
  });

  it("flags a covered estate when liquid assets exceed settlement need", () => {
    // Settlement need = tax 500,000. Liquid (cash 100k + mkt 190k) = 290,000.
    // So the tiny plan is NOT covered. Make it covered by cutting the tax.
    const a = analyzeEstate(tinyPlan({ taxRate: 0.2 }));
    // tax = 200,000; liquid = 290,000 → covered.
    expect(a.settlementNeed.toString()).toBe("200000 USD");
    expect(a.liquidAvailable.toString()).toBe("290000 USD");
    expect(a.covered).toBe(true);
    expect(a.shortfall.toString()).toBe("0 USD");
    expect(a.coverageRatio.greaterThan(1)).toBe(true);
  });

  it("flags a liquidity shortfall that would force an illiquid sale", () => {
    const a = analyzeEstate(tinyPlan()); // 50% rate
    // need 500,000; liquid 290,000 → short by 210,000.
    expect(a.covered).toBe(false);
    expect(a.shortfall.toString()).toBe("210000 USD");
    expect(a.coverageRatio.lessThan(1)).toBe(true);
    // Funding waterfall must dip into illiquid to make up the difference.
    const classes = a.fundingWaterfall.map((s) => s.cls);
    expect(classes).toContain("illiquid");
  });

  it("drains the funding waterfall cash-first and stops once funded", () => {
    const a = analyzeEstate(tinyPlan({ taxRate: 0.15 }));
    // need = 150,000. cash (100,000 net) first, then 50,000 net of marketable.
    expect(a.fundingWaterfall[0].cls).toBe("cash");
    expect(a.fundingWaterfall[0].netUsed.toString()).toBe("100000 USD");
    expect(a.fundingWaterfall[1].cls).toBe("marketable");
    expect(a.fundingWaterfall[1].netUsed.toString()).toBe("50000 USD");
    // Marketable gross consumed to net 50,000 at 5% haircut = 50,000 / 0.95.
    expect(a.fundingWaterfall[1].grossUsed.toString()).toBe("52631.58 USD");
    // No illiquid step — fully funded from liquid assets.
    expect(a.fundingWaterfall.some((s) => s.cls === "illiquid")).toBe(false);
  });

  it("reports a 100% coverage ratio when there is nothing to settle", () => {
    const a = analyzeEstate(
      tinyPlan({ taxRate: 0, liabilities: [], adminCostRate: 0 }),
    );
    expect(a.settlementNeed.toString()).toBe("0 USD");
    expect(a.coverageRatio.toFixed()).toBe("1");
    expect(a.covered).toBe(true);
    expect(a.fundingWaterfall).toHaveLength(0);
  });

  it("honors haircut overrides", () => {
    const a = analyzeEstate(tinyPlan(), {
      haircuts: { marketable: "0.5" },
    });
    const mkt = a.buckets.find((b) => b.cls === "marketable")!;
    expect(mkt.net.toString()).toBe("100000 USD"); // 50% of 200,000
  });

  it("rejects an out-of-range haircut override", () => {
    expect(() =>
      analyzeEstate(tinyPlan(), { haircuts: { cash: 2 } }),
    ).toThrow(/haircut/);
  });
});

describe("analyzeEstate — per-beneficiary inheritance", () => {
  it("allocates estate tax pro-rata to non-exempt beneficiaries only", () => {
    const plan = tinyPlan({
      beneficiaries: [
        { id: "sp", name: "Spouse", relation: "spouse" },
        { id: "k1", name: "Kid 1", relation: "child" },
        { id: "k2", name: "Kid 2", relation: "child" },
      ],
      bequests: [
        { id: "b0", beneficiaryId: "sp", amount: usd("400000") },
        { id: "b1", beneficiaryId: "k1", residueShare: 3 },
        { id: "b2", beneficiaryId: "k2", residueShare: 1 },
      ],
      taxRate: 0.5,
    });
    const a = analyzeEstate(plan);
    const byId = Object.fromEntries(
      a.beneficiaryShares.map((s) => [s.beneficiaryId, s]),
    );
    // Spouse tax-free, full 400,000.
    expect(byId.sp.tax.toString()).toBe("0 USD");
    expect(byId.sp.net.toString()).toBe("400000 USD");
    // Residue 600,000 split 3:1 → 450,000 / 150,000. Taxable estate 600,000,
    // tax 300,000 split by gross 3:1 → 225,000 / 75,000.
    expect(byId.k1.gross.toString()).toBe("450000 USD");
    expect(byId.k1.tax.toString()).toBe("225000 USD");
    expect(byId.k1.net.toString()).toBe("225000 USD");
    expect(byId.k2.tax.toString()).toBe("75000 USD");
  });

  it("sorts beneficiary shares by net descending", () => {
    const a = analyzeEstate(seededEstatePlan);
    const nets = a.beneficiaryShares.map((s) => s.net.amount.toNumber());
    expect([...nets].sort((x, y) => y - x)).toEqual(nets);
  });
});

describe("analyzeEstate — succession flow graph", () => {
  it("emits estate, entity, beneficiary and tax nodes", () => {
    const a = analyzeEstate(seededEstatePlan);
    const kinds = new Set(a.flowNodes.map((n) => n.kind));
    expect(kinds).toContain("estate");
    expect(kinds).toContain("entity");
    expect(kinds).toContain("beneficiary");
    expect(kinds).toContain("tax");
  });

  it("conserves value: estate→entity links sum to the gross estate", () => {
    const a = analyzeEstate(seededEstatePlan);
    const fromEstate = a.flowLinks
      .filter((l) => l.source === "estate")
      .reduce((acc, l) => acc.plus(l.value), Money.zero("USD"));
    expect(fromEstate.toString()).toBe(a.grossEstate.toString());
  });

  it("routes assets without an entity through a 'held personally' node", () => {
    const a = analyzeEstate(seededEstatePlan);
    const personal = a.flowNodes.find((n) => n.id === "entity:__personal__");
    expect(personal?.label).toBe("Held personally");
  });

  it("omits the tax node when no tax is due", () => {
    const a = analyzeEstate(tinyPlan({ taxRate: 0 }));
    expect(a.flowNodes.some((n) => n.kind === "tax")).toBe(false);
    expect(a.flowLinks.some((l) => l.target === "tax")).toBe(false);
  });
});

describe("formatCoverage", () => {
  it("renders a ratio as a rounded percentage", () => {
    expect(formatCoverage(new Decimal("2.0793"))).toBe("208%");
    expect(formatCoverage(new Decimal("1"))).toBe("100%");
    expect(formatCoverage(new Decimal("0.5"))).toBe("50%");
  });
});

describe("seeded fixture snapshot (pinned)", () => {
  it("matches the hand-computed Ursin plan outputs", () => {
    const a = analyzeEstate(seededEstatePlan);
    expect(a.grossEstate.toString()).toBe("54500000 USD");
    expect(a.totalDebts.toString()).toBe("2000000 USD");
    expect(a.adminCost.toString()).toBe("817500 USD");
    expect(a.exemptBequests.toString()).toBe("26000000 USD");
    expect(a.netEstate.toString()).toBe("25682500 USD");
    expect(a.exemptionApplied.toString()).toBe("13610000 USD");
    expect(a.taxableEstate.toString()).toBe("12072500 USD");
    expect(a.estateTax.toString()).toBe("4829000 USD");
    expect(a.settlementNeed.toString()).toBe("7646500 USD");
    expect(a.liquidAvailable.toString()).toBe("15900000 USD");
    expect(a.totalRealizable.toString()).toBe("42500000 USD");
    expect(a.covered).toBe(true);
    expect(formatCoverage(a.coverageRatio)).toBe("208%");
  });
});
