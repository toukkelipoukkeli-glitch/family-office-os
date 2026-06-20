import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import { ReportingConverter } from "@/lib/reporting-currency";
import { networthRateTable } from "@/lib/networth";

import { toJson } from "./json";
import { toCsv } from "./csv";
import {
  baseConverter,
  cashflowExport,
  consolidationExport,
  estateExport,
  feesExport,
  givingExport,
  goalsExport,
  insuranceExport,
  liquidityExport,
  lookThroughExport,
  privateMarketsExport,
  scenarioExport,
  stressExport,
  type MoneyConverter,
} from "./pages";

import { analyzeGivingPlan, seededGivingPlan } from "@/lib/giving";
import { analyzeEstate, seededEstatePlan } from "@/lib/estate";
import { buildFeeModel } from "@/lib/fees";
import { buildCashflowModel } from "@/lib/cashflow";
import { buildLiquidityModel } from "@/lib/liquidity";
import { analyzeFundingPlan, seededFundingPlan } from "@/lib/goals";
import { analyzeInsurance, seededInsuranceBook } from "@/lib/insurance";
import { buildPrivateMarketsModel } from "@/lib/privatemarkets";
import {
  consolidateLookThrough,
  LOOKTHROUGH_ENTITIES,
  LOOKTHROUGH_HOLDINGS,
  LOOKTHROUGH_ROOT_ID,
} from "@/lib/lookthrough";
import {
  consolidate,
  CONSOLIDATION_ENTITIES,
  CONSOLIDATION_INTERCOMPANY,
  CONSOLIDATION_ROOT_ID,
} from "@/lib/consolidation";
import { buildCockpitModel } from "@/lib/scenario/cockpit/cockpit";
import { COCKPIT_BASE_INPUT } from "@/lib/scenario/cockpit/fixtures";
import { buildStressModel, STRESS_BASE_INPUT } from "@/lib/stress";

/* ------------------------------------------------------------------------- */
/* Converters                                                                */
/* ------------------------------------------------------------------------- */

/** Base (USD) — exact pass-through, no FX. */
const USD = baseConverter("USD");

/** A real EUR converter wired to the canonical FX table (rate 1.08 USD/EUR). */
const EUR_CONV = ReportingConverter.from(networthRateTable, "EUR");
const EUR: MoneyConverter = {
  currency: "EUR",
  convertMoney: (m) => EUR_CONV.convert(m),
};

/** EUR rate-to-base (USD per EUR). value_EUR = value_USD ÷ rateToBase. */
const EUR_RATE = new Decimal("1.08");

/** What the page shows: convert a base-USD `Money` to its EUR exact string. */
const eurOf = (m: Money): string => EUR_CONV.convert(m).amount.toFixed();
/** Convert a base-USD *number* to its EUR exact decimal string. */
const eurNum = (v: number): string =>
  new Decimal(v).div(EUR_RATE).toFixed();

/**
 * Every cell in a CSV `value (...)` / decimal column must be a finite decimal
 * string — never `"NaN"`, `"undefined"`, or an exponential form. This is the
 * exact-Decimal contract the export promises.
 */
function expectDecimalString(s: string): void {
  expect(s).toMatch(/^-?\d+(\.\d+)?$/);
}

/** Round-trip a dataset through both serializers (asserts they don't throw). */
function expectSerializable(ds: ReturnType<typeof givingExport>): void {
  expect(() => toCsv(ds.table)).not.toThrow();
  expect(() => toJson(ds.json)).not.toThrow();
  // Every column header is present and rows are rectangular.
  for (const row of ds.table.rows) {
    expect(row.length).toBe(ds.table.columns.length);
  }
}

/* ------------------------------------------------------------------------- */
/* Conversion-boundary invariants (adversarial)                              */
/* ------------------------------------------------------------------------- */

describe("export conversion boundary", () => {
  // The number path (fees/cashflow/etc.) and the Money path (giving/estate/etc.)
  // must apply IDENTICAL FX math, so a number figure and an equal Money figure
  // convert to the exact same reporting-currency string. fees uses `num`,
  // giving uses `money`; a base value present in both must agree.
  it("number-path and Money-path conversions agree to the exact digit", () => {
    const v = 1_234_567.89;
    const viaMoney = EUR_CONV.convert(Money.of(v, "USD")).amount.toFixed();
    const viaNumber = new Decimal(v).div(EUR_RATE).toFixed();
    expect(viaMoney).toBe(viaNumber);
  });

  // toFixed() must never emit exponential notation or lose precision, even for a
  // value whose exact EUR conversion is a long non-terminating-looking decimal.
  it("emits a plain decimal string (no exponent) for awkward conversions", () => {
    const model = buildFeeModel();
    const eur = feesExport(model, EUR);
    const totalCol = eur.table.columns.indexOf("totalCost (EUR)");
    for (const row of eur.table.rows) {
      const cell = String(row[totalCol]);
      expect(cell).not.toMatch(/[eE]/); // no scientific notation
      expectDecimalString(cell);
    }
  });

  // The USD (base) path is an exact pass-through: no FX division, no rounding,
  // identical to the engine's own toFixed().
  it("base-currency export is an exact pass-through (no rounding)", () => {
    const analysis = analyzeGivingPlan(seededGivingPlan);
    const usd = givingExport(analysis, USD);
    const col = usd.table.columns.indexOf("gifted (USD)");
    analysis.yearResults.forEach((y, i) => {
      expect(usd.table.rows[i][col]).toBe(y.gifted.amount.toFixed());
    });
  });
});

/* ------------------------------------------------------------------------- */
/* Giving                                                                    */
/* ------------------------------------------------------------------------- */

describe("givingExport", () => {
  const analysis = analyzeGivingPlan(seededGivingPlan);

  it("emits exact base-currency decimal strings in the plan table", () => {
    const ds = givingExport(analysis, USD);
    expectSerializable(ds);
    expect(ds.table.columns).toContain("gifted (USD)");
    const giftedCol = ds.table.columns.indexOf("totalBenefit (USD)");
    analysis.yearResults.forEach((y, i) => {
      expect(ds.table.rows[i][giftedCol]).toBe(y.totalBenefit.amount.toFixed());
      expectDecimalString(String(ds.table.rows[i][giftedCol]));
    });
  });

  it("applies the reporting-currency conversion exactly", () => {
    const ds = givingExport(analysis, EUR);
    expect(ds.table.columns).toContain("gifted (EUR)");
    const col = ds.table.columns.indexOf("gifted (EUR)");
    analysis.yearResults.forEach((y, i) => {
      expect(ds.table.rows[i][col]).toBe(eurOf(y.gifted));
    });
    const json = ds.json as { currency: string; totals: { netCost: string } };
    expect(json.currency).toBe("EUR");
    expect(json.totals.netCost).toBe(eurOf(analysis.netCost));
  });
});

/* ------------------------------------------------------------------------- */
/* Estate                                                                    */
/* ------------------------------------------------------------------------- */

describe("estateExport", () => {
  const analysis = analyzeEstate(seededEstatePlan);

  it("emits exact decimal strings and converts the waterfall", () => {
    const usd = estateExport(analysis, USD);
    expectSerializable(usd);
    const grossCol = usd.table.columns.indexOf("grossUsed (USD)");
    analysis.fundingWaterfall.forEach((s, i) => {
      expect(usd.table.rows[i][grossCol]).toBe(s.grossUsed.amount.toFixed());
    });

    const eur = estateExport(analysis, EUR);
    const eurCol = eur.table.columns.indexOf("grossUsed (EUR)");
    analysis.fundingWaterfall.forEach((s, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurOf(s.grossUsed));
    });
    const json = eur.json as { estateTax: string };
    expect(json.estateTax).toBe(eurOf(analysis.estateTax));
  });
});

/* ------------------------------------------------------------------------- */
/* Fees (number-based view model)                                            */
/* ------------------------------------------------------------------------- */

describe("feesExport", () => {
  const model = buildFeeModel();

  it("emits exact decimal strings and converts per-fund costs", () => {
    const usd = feesExport(model, USD);
    expectSerializable(usd);
    const totalCol = usd.table.columns.indexOf("totalCost (USD)");
    model.funds.forEach((f, i) => {
      expect(usd.table.rows[i][totalCol]).toBe(new Decimal(f.totalCost).toFixed());
      expectDecimalString(String(usd.table.rows[i][totalCol]));
    });

    const eur = feesExport(model, EUR);
    const eurCol = eur.table.columns.indexOf("totalCost (EUR)");
    model.funds.forEach((f, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurNum(f.totalCost));
    });
  });
});

/* ------------------------------------------------------------------------- */
/* Cashflow (number-based)                                                   */
/* ------------------------------------------------------------------------- */

describe("cashflowExport", () => {
  const model = buildCashflowModel();

  it("emits exact decimal strings and converts monthly balances", () => {
    const usd = cashflowExport(model, USD);
    expectSerializable(usd);
    const closeCol = usd.table.columns.indexOf("closingBalance (USD)");
    model.months.forEach((m, i) => {
      expect(usd.table.rows[i][closeCol]).toBe(
        new Decimal(m.closingBalance).toFixed(),
      );
    });

    const eur = cashflowExport(model, EUR);
    const eurCol = eur.table.columns.indexOf("closingBalance (EUR)");
    model.months.forEach((m, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurNum(m.closingBalance));
    });
  });
});

/* ------------------------------------------------------------------------- */
/* Liquidity (number-based)                                                  */
/* ------------------------------------------------------------------------- */

describe("liquidityExport", () => {
  const model = buildLiquidityModel();

  it("emits exact decimal strings and converts coverage figures", () => {
    const usd = liquidityExport(model, USD);
    expectSerializable(usd);
    const availCol = usd.table.columns.indexOf("availableLiquidity (USD)");
    model.months.forEach((m, i) => {
      expect(usd.table.rows[i][availCol]).toBe(
        new Decimal(m.availableLiquidity).toFixed(),
      );
    });

    const eur = liquidityExport(model, EUR);
    const eurCol = eur.table.columns.indexOf("availableLiquidity (EUR)");
    model.months.forEach((m, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurNum(m.availableLiquidity));
    });
  });
});

/* ------------------------------------------------------------------------- */
/* Goals                                                                     */
/* ------------------------------------------------------------------------- */

describe("goalsExport", () => {
  const summary = analyzeFundingPlan(seededFundingPlan);

  it("emits exact decimal strings and converts per-goal targets", () => {
    const usd = goalsExport(summary, USD);
    expectSerializable(usd);
    const targetCol = usd.table.columns.indexOf("target (USD)");
    summary.goals.forEach((g, i) => {
      expect(usd.table.rows[i][targetCol]).toBe(g.target.amount.toFixed());
    });

    const eur = goalsExport(summary, EUR);
    const eurCol = eur.table.columns.indexOf("target (EUR)");
    summary.goals.forEach((g, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurOf(g.target));
    });
  });
});

/* ------------------------------------------------------------------------- */
/* Insurance                                                                 */
/* ------------------------------------------------------------------------- */

describe("insuranceExport", () => {
  const analysis = analyzeInsurance(seededInsuranceBook);

  it("emits exact decimal strings and converts coverage by category", () => {
    const usd = insuranceExport(analysis, USD);
    expectSerializable(usd);
    const covCol = usd.table.columns.indexOf("activeCoverage (USD)");
    analysis.categories.forEach((c, i) => {
      expect(usd.table.rows[i][covCol]).toBe(c.activeCoverage.amount.toFixed());
    });

    const eur = insuranceExport(analysis, EUR);
    const eurCol = eur.table.columns.indexOf("activeCoverage (EUR)");
    analysis.categories.forEach((c, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurOf(c.activeCoverage));
    });
  });
});

/* ------------------------------------------------------------------------- */
/* Private markets (number-based)                                            */
/* ------------------------------------------------------------------------- */

describe("privateMarketsExport", () => {
  const model = buildPrivateMarketsModel();

  it("emits exact decimal strings and converts commitments", () => {
    const usd = privateMarketsExport(model, USD);
    expectSerializable(usd);
    const navCol = usd.table.columns.indexOf("nav (USD)");
    model.commitments.forEach((c, i) => {
      expect(usd.table.rows[i][navCol]).toBe(new Decimal(c.nav).toFixed());
    });

    const eur = privateMarketsExport(model, EUR);
    const eurCol = eur.table.columns.indexOf("nav (EUR)");
    model.commitments.forEach((c, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurNum(c.nav));
    });
  });
});

/* ------------------------------------------------------------------------- */
/* Look-through                                                              */
/* ------------------------------------------------------------------------- */

describe("lookThroughExport", () => {
  const report = consolidateLookThrough(
    LOOKTHROUGH_ENTITIES,
    LOOKTHROUGH_HOLDINGS,
    LOOKTHROUGH_ROOT_ID,
  );

  it("emits exact decimal strings and converts per-class exposure", () => {
    const usd = lookThroughExport(report, USD);
    expectSerializable(usd);
    const valCol = usd.table.columns.indexOf("value (USD)");
    report.lines.forEach((l, i) => {
      expect(usd.table.rows[i][valCol]).toBe(l.value.amount.toFixed());
    });

    const eur = lookThroughExport(report, EUR);
    const eurCol = eur.table.columns.indexOf("value (EUR)");
    report.lines.forEach((l, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurOf(l.value));
    });
    const json = eur.json as { total: string };
    expect(json.total).toBe(eurOf(report.total));
  });
});

/* ------------------------------------------------------------------------- */
/* Consolidation                                                             */
/* ------------------------------------------------------------------------- */

describe("consolidationExport", () => {
  const report = consolidate({
    entities: CONSOLIDATION_ENTITIES,
    intercompany: CONSOLIDATION_INTERCOMPANY,
    rootId: CONSOLIDATION_ROOT_ID,
  });

  it("emits exact decimal strings and converts per-entity NAV", () => {
    const usd = consolidationExport(report, USD);
    expectSerializable(usd);
    const ownedCol = usd.table.columns.indexOf("ownedNav (USD)");
    report.entities.forEach((e, i) => {
      expect(usd.table.rows[i][ownedCol]).toBe(e.ownedNav.amount.toFixed());
    });

    const eur = consolidationExport(report, EUR);
    const eurCol = eur.table.columns.indexOf("ownedNav (EUR)");
    report.entities.forEach((e, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurOf(e.ownedNav));
    });
    const json = eur.json as { consolidatedNetWorth: string };
    expect(json.consolidatedNetWorth).toBe(eurOf(report.consolidatedNetWorth));
  });
});

/* ------------------------------------------------------------------------- */
/* Scenarios (number-based)                                                  */
/* ------------------------------------------------------------------------- */

describe("scenarioExport", () => {
  const model = buildCockpitModel(COCKPIT_BASE_INPUT);

  it("emits exact decimal strings and converts the tornado deltas", () => {
    const usd = scenarioExport(model, USD);
    expectSerializable(usd);
    const meanCol = usd.table.columns.indexOf("meanDelta (USD)");
    model.tornado.bars.forEach((b, i) => {
      expect(usd.table.rows[i][meanCol]).toBe(new Decimal(b.meanDelta).toFixed());
    });

    const eur = scenarioExport(model, EUR);
    const eurCol = eur.table.columns.indexOf("meanDelta (EUR)");
    model.tornado.bars.forEach((b, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurNum(b.meanDelta));
    });
  });
});

/* ------------------------------------------------------------------------- */
/* Stress (number-based)                                                     */
/* ------------------------------------------------------------------------- */

describe("stressExport", () => {
  const model = buildStressModel(STRESS_BASE_INPUT);

  it("emits exact decimal strings and converts per-episode impact", () => {
    const usd = stressExport(model, USD);
    expectSerializable(usd);
    const beforeCol = usd.table.columns.indexOf("netWorthBefore (USD)");
    model.results.forEach((r, i) => {
      expect(usd.table.rows[i][beforeCol]).toBe(
        new Decimal(r.netWorthBefore).toFixed(),
      );
    });

    const eur = stressExport(model, EUR);
    const eurCol = eur.table.columns.indexOf("netWorthBefore (EUR)");
    model.results.forEach((r, i) => {
      expect(eur.table.rows[i][eurCol]).toBe(eurNum(r.netWorthBefore));
    });
  });
});
