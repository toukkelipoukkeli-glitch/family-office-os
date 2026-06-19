import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "../money";
import type { Holding } from "../model/holding";
import type { Portfolio } from "../model/portfolio";
import { cashHolding, equityHolding } from "../model/fixtures";
import {
  allocationByAssetClass,
  allocationByCurrency,
  holdingContributions,
  portfolioTotal,
  rebalancingDrift,
} from "./allocation";
import { FxConverter } from "./fx";
import { allocationPortfolio, usdRateTable } from "./fixtures";
import { holdingValue, latestValuation } from "./holding-value";

// ---------------------------------------------------------------------------
// FxConverter
// ---------------------------------------------------------------------------

describe("FxConverter", () => {
  it("converts the base currency at exactly 1", () => {
    const fx = FxConverter.fromTable(usdRateTable);
    expect(fx.toBase(Money.of("100", "USD")).toJSON()).toEqual({
      amount: "100",
      currency: "USD",
    });
  });

  it("converts a foreign currency using the rate", () => {
    const fx = FxConverter.fromTable(usdRateTable);
    // 7200 EUR * 1.10 = 7920 USD
    expect(fx.toBase(Money.of("7200", "EUR")).toJSON()).toEqual({
      amount: "7920",
      currency: "USD",
    });
  });

  it("is precise (no floating point drift)", () => {
    const fx = FxConverter.fromTable({ base: "USD", rates: { EUR: "1.1" } });
    expect(fx.toBase(Money.of("0.1", "EUR")).amount.toFixed()).toBe("0.11");
  });

  it("reports convertibility", () => {
    const fx = FxConverter.fromTable(usdRateTable);
    expect(fx.canConvert("usd")).toBe(true);
    expect(fx.canConvert("eur")).toBe(true);
    expect(fx.canConvert("JPY")).toBe(false);
  });

  it("throws on an unknown currency", () => {
    const fx = FxConverter.fromTable(usdRateTable);
    expect(() => fx.toBase(Money.of("1", "JPY"))).toThrow(/No FX rate/);
  });

  it("normalizes rate-table keys and base casing", () => {
    const fx = FxConverter.fromTable({ base: "usd", rates: { eur: "1.10" } });
    expect(fx.base).toBe("USD");
    expect(fx.toBase(Money.of("10", "eur")).toJSON()).toEqual({
      amount: "11",
      currency: "USD",
    });
  });

  it("rejects a non-1 rate for the base currency", () => {
    expect(() =>
      FxConverter.fromTable({ base: "USD", rates: { USD: "1.2" } }),
    ).toThrow(/base currency/);
  });

  it("accepts an explicit base rate of 1", () => {
    const fx = FxConverter.fromTable({ base: "USD", rates: { USD: "1" } });
    expect(fx.toBase(Money.of("5", "USD")).toJSON()).toEqual({
      amount: "5",
      currency: "USD",
    });
  });

  it("rejects negative and non-finite rates", () => {
    expect(() =>
      FxConverter.fromTable({ base: "USD", rates: { EUR: "-1" } }),
    ).toThrow(/positive number/);
    expect(() =>
      FxConverter.fromTable({ base: "USD", rates: { EUR: "abc" } }),
    ).toThrow(/Invalid FX rate/);
  });

  it("rejects malformed currency codes", () => {
    expect(() => FxConverter.fromTable({ base: "US", rates: {} })).toThrow(
      /Invalid currency code/,
    );
  });

  it("rejects a floating-point numeric rate at the boundary", () => {
    // FxRateInput is string | Decimal; a JS caller could still pass a number.
    // Numeric rates carry binary-float imprecision, so they are rejected.
    expect(() =>
      FxConverter.fromTable({
        base: "USD",
        rates: { EUR: 1.1 as unknown as string },
      }),
    ).toThrow(/not a number/);
  });

  it("accepts a Decimal rate (exact, no float)", () => {
    const fx = FxConverter.fromTable({
      base: "USD",
      rates: { EUR: new Decimal("1.1") },
    });
    expect(fx.toBase(Money.of("10", "EUR")).amount.toFixed()).toBe("11");
  });

  it("rejects a zero rate for a non-base currency", () => {
    // A zero rate would silently value the holding at zero base currency.
    expect(() =>
      FxConverter.fromTable({ base: "USD", rates: { EUR: "0" } }),
    ).toThrow(/positive number/);
  });

  it("canConvert returns false for malformed input instead of throwing", () => {
    const fx = FxConverter.fromTable(usdRateTable);
    expect(fx.canConvert("US")).toBe(false);
    expect(fx.canConvert("")).toBe(false);
    expect(fx.canConvert("dollars")).toBe(false);
  });

  it("rejects a zero base rate is allowed only as exactly 1", () => {
    // Sanity: the base must be 1, and a non-base zero is rejected; together
    // these mean no currency can ever convert at a non-positive rate.
    const fx = FxConverter.fromTable({ base: "USD", rates: { USD: "1" } });
    expect(fx.toBase(Money.of("42", "USD")).amount.toFixed()).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// holdingValue / latestValuation
// ---------------------------------------------------------------------------

describe("latestValuation / holdingValue", () => {
  it("returns the holding value from its single valuation", () => {
    expect(holdingValue(equityHolding)?.toJSON()).toEqual({
      amount: "30000",
      currency: "USD",
    });
  });

  it("picks the most recent valuation by asOf", () => {
    const h: Holding = {
      ...cashHolding,
      valuations: [
        {
          id: "v-old",
          value: { amount: "100", currency: "USD" },
          asOf: "2024-01-01T00:00:00Z",
          source: "manual",
          confidence: "high",
        },
        {
          id: "v-new",
          value: { amount: "200", currency: "USD" },
          asOf: "2026-01-01T00:00:00Z",
          source: "manual",
          confidence: "high",
        },
        {
          id: "v-mid",
          value: { amount: "150", currency: "USD" },
          asOf: "2025-01-01T00:00:00Z",
          source: "manual",
          confidence: "high",
        },
      ],
    };
    expect(latestValuation(h)?.id).toBe("v-new");
    expect(holdingValue(h)?.amount.toFixed()).toBe("200");
  });

  it("breaks an asOf tie by later array position", () => {
    const h: Holding = {
      ...cashHolding,
      valuations: [
        {
          id: "v-first",
          value: { amount: "100", currency: "USD" },
          asOf: "2026-01-01T00:00:00Z",
          source: "manual",
          confidence: "high",
        },
        {
          id: "v-second",
          value: { amount: "200", currency: "USD" },
          asOf: "2026-01-01T00:00:00Z",
          source: "manual",
          confidence: "high",
        },
      ],
    };
    expect(latestValuation(h)?.id).toBe("v-second");
  });

  it("returns undefined for a holding with no valuations", () => {
    const h: Holding = { ...equityHolding, valuations: [] };
    expect(latestValuation(h)).toBeUndefined();
    expect(holdingValue(h)).toBeUndefined();
  });

  it("stays deterministic when asOf is unparseable (defensive fallback)", () => {
    // asOf is validated upstream, but the comparator must not return NaN if a
    // bad value ever slips through: it falls back to a total lexicographic order.
    const h: Holding = {
      ...cashHolding,
      valuations: [
        {
          id: "v-a",
          value: { amount: "100", currency: "USD" },
          asOf: "not-a-date-a",
          source: "manual",
          confidence: "high",
        },
        {
          id: "v-b",
          value: { amount: "200", currency: "USD" },
          asOf: "not-a-date-b",
          source: "manual",
          confidence: "high",
        },
      ] as unknown as Holding["valuations"],
    };
    // "not-a-date-b" > "not-a-date-a" lexicographically, so v-b wins.
    expect(latestValuation(h)?.id).toBe("v-b");
  });
});

// ---------------------------------------------------------------------------
// holdingContributions / portfolioTotal
// ---------------------------------------------------------------------------

describe("holdingContributions / portfolioTotal", () => {
  it("converts each holding to the base currency", () => {
    const fx = FxConverter.fromTable(usdRateTable);
    const contribs = holdingContributions(allocationPortfolio, fx);
    const byId = Object.fromEntries(
      contribs.map((c) => [c.holding.id, c.value?.amount.toFixed()]),
    );
    expect(byId["hold-aapl"]).toBe("30000");
    expect(byId["hold-lafite"]).toBe("7920"); // 7200 * 1.10
    expect(byId["hold-cash-usd"]).toBe("250000");
  });

  it("totals the portfolio in the base currency", () => {
    const fx = FxConverter.fromTable(usdRateTable);
    expect(portfolioTotal(allocationPortfolio, fx).amount.toFixed()).toBe("287920");
  });

  it("treats unvaluable holdings as a contribution with no value", () => {
    const noVal: Holding = { ...equityHolding, id: "h-noval", valuations: [] };
    const pf: Portfolio = {
      ...allocationPortfolio,
      holdings: [...allocationPortfolio.holdings, noVal],
    };
    const fx = FxConverter.fromTable(usdRateTable);
    const contribs = holdingContributions(pf, fx);
    expect(contribs.find((c) => c.holding.id === "h-noval")?.value).toBeUndefined();
    // Total unchanged by the unvaluable holding.
    expect(portfolioTotal(pf, fx).amount.toFixed()).toBe("287920");
  });

  it("returns a zero total in base currency for an empty portfolio", () => {
    const fx = FxConverter.fromTable(usdRateTable);
    const pf: Portfolio = { ...allocationPortfolio, holdings: [] };
    expect(portfolioTotal(pf, fx).isZero()).toBe(true);
    expect(portfolioTotal(pf, fx).currency).toBe("USD");
  });

  it("throws when the converter base differs from the portfolio base", () => {
    const fx = FxConverter.fromTable({ base: "EUR", rates: { USD: "0.9" } });
    expect(() => holdingContributions(allocationPortfolio, fx)).toThrow(
      /does not match portfolio base/,
    );
  });
});

// ---------------------------------------------------------------------------
// allocationByAssetClass
// ---------------------------------------------------------------------------

describe("allocationByAssetClass", () => {
  it("groups value by asset class with exact weights", () => {
    const b = allocationByAssetClass(allocationPortfolio, usdRateTable);
    expect(b.baseCurrency).toBe("USD");
    expect(b.total.amount.toFixed()).toBe("287920");

    const byKey = Object.fromEntries(b.slices.map((s) => [s.key, s]));
    expect(byKey.equity.value.amount.toFixed()).toBe("30000");
    expect(byKey.wine.value.amount.toFixed()).toBe("7920");
    expect(byKey.cash.value.amount.toFixed()).toBe("250000");

    // weights sum to 1
    const sum = b.slices.reduce(
      (acc, s) => acc.plus(s.weight),
      new Decimal(0),
    );
    expect(sum.toFixed()).toBe("1");
  });

  it("sorts slices by descending value", () => {
    const b = allocationByAssetClass(allocationPortfolio, usdRateTable);
    expect(b.slices.map((s) => s.key)).toEqual(["cash", "equity", "wine"]);
  });

  it("omits asset classes with no valued holdings", () => {
    const b = allocationByAssetClass(allocationPortfolio, usdRateTable);
    expect(b.slices.find((s) => s.key === "bond")).toBeUndefined();
  });

  it("yields zero weights and a zero total for an empty portfolio", () => {
    const pf: Portfolio = { ...allocationPortfolio, holdings: [] };
    const b = allocationByAssetClass(pf, usdRateTable);
    expect(b.slices).toHaveLength(0);
    expect(b.total.isZero()).toBe(true);
  });

  it("combines multiple holdings of the same asset class", () => {
    const aapl2: Holding = {
      ...equityHolding,
      id: "hold-msft",
      name: "Microsoft",
      valuations: [
        {
          id: "v-msft",
          value: { amount: "10000.00", currency: "USD" },
          asOf: "2026-06-18T16:00:00Z",
          source: "market",
          confidence: "high",
        },
      ],
    };
    const pf: Portfolio = {
      ...allocationPortfolio,
      holdings: [...allocationPortfolio.holdings, aapl2],
    };
    const b = allocationByAssetClass(pf, usdRateTable);
    const equity = b.slices.find((s) => s.key === "equity");
    expect(equity?.value.amount.toFixed()).toBe("40000");
  });
});

// ---------------------------------------------------------------------------
// allocationByCurrency
// ---------------------------------------------------------------------------

describe("allocationByCurrency", () => {
  it("groups value by holding currency, valued in base", () => {
    const b = allocationByCurrency(allocationPortfolio, usdRateTable);
    const byKey = Object.fromEntries(b.slices.map((s) => [s.key, s]));
    // USD: 30000 (equity) + 250000 (cash) = 280000
    expect(byKey.USD.value.amount.toFixed()).toBe("280000");
    // EUR: 7200 EUR -> 7920 USD
    expect(byKey.EUR.value.amount.toFixed()).toBe("7920");
  });

  it("weights reflect base-currency exposure", () => {
    const b = allocationByCurrency(allocationPortfolio, usdRateTable);
    const eur = b.slices.find((s) => s.key === "EUR");
    // 7920 / 287920
    expect(eur?.weight.toFixed(6)).toBe(
      new Decimal("7920").div("287920").toFixed(6),
    );
  });
});

// ---------------------------------------------------------------------------
// rebalancingDrift
// ---------------------------------------------------------------------------

describe("rebalancingDrift", () => {
  const breakdown = allocationByAssetClass(allocationPortfolio, usdRateTable);

  it("computes signed drift = current - target", () => {
    // current: cash ~0.868, equity ~0.104, wine ~0.0275
    const report = rebalancingDrift(breakdown, {
      cash: "0.5",
      equity: "0.4",
      wine: "0.1",
    });
    const byKey = Object.fromEntries(report.slices.map((s) => [s.key, s]));
    expect(byKey.cash.drift.greaterThan(0)).toBe(true); // overweight cash
    expect(byKey.equity.drift.lessThan(0)).toBe(true); // underweight equity
  });

  it("normalizes target weights that do not sum to 1", () => {
    const report = rebalancingDrift(breakdown, {
      cash: "2",
      equity: "1",
      wine: "1",
    });
    const byKey = Object.fromEntries(report.slices.map((s) => [s.key, s]));
    // normalized: cash 0.5, equity 0.25, wine 0.25
    expect(byKey.cash.targetWeight.toFixed()).toBe("0.5");
    expect(byKey.equity.targetWeight.toFixed()).toBe("0.25");
    expect(byKey.wine.targetWeight.toFixed()).toBe("0.25");
  });

  it("reports zero drift when on target", () => {
    const onTarget = {
      cash: breakdown.slices.find((s) => s.key === "cash")!.weight,
      equity: breakdown.slices.find((s) => s.key === "equity")!.weight,
      wine: breakdown.slices.find((s) => s.key === "wine")!.weight,
    };
    const report = rebalancingDrift(breakdown, onTarget, "0.0001");
    for (const s of report.slices) {
      expect(s.drift.abs().lessThan("0.0000001")).toBe(true);
    }
    expect(report.totalAbsoluteDrift.lessThan("0.0000001")).toBe(true);
    expect(report.withinBand).toBe(true);
  });

  it("computes a drift amount in base currency", () => {
    const report = rebalancingDrift(breakdown, {
      cash: "0.5",
      equity: "0.4",
      wine: "0.1",
    });
    const cash = report.slices.find((s) => s.key === "cash")!;
    // driftAmount = |drift| * total
    const expected = cash.drift.abs().times(breakdown.total.amount);
    expect(cash.driftAmount.amount.toFixed()).toBe(expected.toFixed());
    expect(cash.driftAmount.currency).toBe("USD");
    expect(cash.driftAmount.isNegative()).toBe(false);
  });

  it("includes target keys absent from the portfolio (underweight)", () => {
    const report = rebalancingDrift(breakdown, {
      cash: "0.4",
      equity: "0.3",
      wine: "0.1",
      bond: "0.2",
    });
    const bond = report.slices.find((s) => s.key === "bond");
    expect(bond).toBeDefined();
    expect(bond!.currentWeight.toFixed()).toBe("0");
    expect(bond!.drift.lessThan(0)).toBe(true); // fully underweight
  });

  it("includes portfolio keys absent from the target (overweight)", () => {
    const report = rebalancingDrift(breakdown, { cash: "1" });
    const equity = report.slices.find((s) => s.key === "equity");
    expect(equity).toBeDefined();
    expect(equity!.targetWeight.toFixed()).toBe("0");
    expect(equity!.drift.greaterThan(0)).toBe(true);
  });

  it("flags out-of-band drift", () => {
    const report = rebalancingDrift(
      breakdown,
      { cash: "0.5", equity: "0.4", wine: "0.1" },
      "0.05",
    );
    expect(report.withinBand).toBe(false);
  });

  it("sorts slices by descending absolute drift", () => {
    const report = rebalancingDrift(breakdown, {
      cash: "0.5",
      equity: "0.4",
      wine: "0.1",
    });
    for (let i = 1; i < report.slices.length; i++) {
      expect(
        report.slices[i - 1].drift
          .abs()
          .greaterThanOrEqualTo(report.slices[i].drift.abs()),
      ).toBe(true);
    }
  });

  it("totalAbsoluteDrift equals the sum of positive drifts", () => {
    const report = rebalancingDrift(breakdown, {
      cash: "0.5",
      equity: "0.4",
      wine: "0.1",
    });
    const sumPositive = report.slices.reduce(
      (acc, s) => (s.drift.greaterThan(0) ? acc.plus(s.drift) : acc),
      new Decimal(0),
    );
    expect(report.totalAbsoluteDrift.toFixed()).toBe(sumPositive.toFixed());
    // overweight and underweight must net to ~0
    const net = report.slices.reduce(
      (acc, s) => acc.plus(s.drift),
      new Decimal(0),
    );
    expect(net.abs().lessThan("0.0000001")).toBe(true);
  });

  it("throws when target weights sum to zero", () => {
    expect(() =>
      rebalancingDrift(breakdown, { cash: "0", equity: "0", wine: "0" }),
    ).toThrow(/positive value/);
  });

  it("throws on a negative target weight", () => {
    expect(() =>
      rebalancingDrift(breakdown, { cash: "-1", equity: "1", wine: "1" }),
    ).toThrow(/non-negative/);
  });
});
