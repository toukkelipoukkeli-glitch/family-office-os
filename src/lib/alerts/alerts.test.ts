import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import type { Portfolio } from "../model/portfolio";
import type { FxRateTable } from "../allocation/fx";
import { evaluateAlerts } from "./engine";
import { formatLimit, formatWeight } from "./format";
import {
  alertsPortfolio,
  alertsRateTable,
  defaultAlertRules,
} from "./fixtures";
import { toWeight, validateRule, type AlertRule } from "./rule";

/**
 * The sample portfolio (base USD, EUR = 1.10) rolls up to:
 *   Cash 250,000 (86.83%), Equity 30,000 (10.42%), Wine 7,920 (2.75%);
 *   total 287,920. Currency: USD 280,000 (97.25%), EUR 7,920 (2.75%).
 * These are the oracle numbers the assertions below are anchored to.
 */
const TOTAL = "287920";

function byId(rules: AlertRule[], id: string) {
  return rules.find((r) => r.id === id)!;
}

describe("toWeight", () => {
  it("accepts decimals, strings and numbers in [0, 1]", () => {
    expect(toWeight("0.2").toString()).toBe("0.2");
    expect(toWeight(0.5).toString()).toBe("0.5");
    expect(toWeight(new Decimal("1")).toString()).toBe("1");
    expect(toWeight(0).toString()).toBe("0");
  });

  it("rejects values outside [0, 1] and non-finite input", () => {
    expect(() => toWeight("-0.01")).toThrow(/\[0, 1\]/);
    expect(() => toWeight("1.5")).toThrow(/\[0, 1\]/);
    expect(() => toWeight(Infinity)).toThrow(/\[0, 1\]/);
  });
});

describe("validateRule", () => {
  it("requires a target asset class for assetClass scope", () => {
    expect(() =>
      validateRule({
        id: "x",
        label: "x",
        scope: "assetClass",
        direction: "max",
        threshold: "0.1",
      }),
    ).toThrow(/assetClass/);
  });

  it("requires a target currency for currency scope", () => {
    expect(() =>
      validateRule({
        id: "x",
        label: "x",
        scope: "currency",
        direction: "max",
        threshold: "0.1",
      }),
    ).toThrow(/currency/);
  });

  it("passes a well-formed position rule (no target needed)", () => {
    const rule: AlertRule = {
      id: "p",
      label: "p",
      scope: "position",
      direction: "max",
      threshold: "0.2",
    };
    expect(validateRule(rule)).toBe(rule);
  });

  it("rejects an out-of-range threshold", () => {
    expect(() =>
      validateRule({
        id: "p",
        label: "p",
        scope: "position",
        direction: "max",
        threshold: "1.2",
      }),
    ).toThrow(/threshold/);
  });
});

describe("evaluateAlerts — default rule set on the sample portfolio", () => {
  const report = evaluateAlerts(
    alertsPortfolio,
    defaultAlertRules,
    alertsRateTable,
  );

  it("computes the portfolio total in base currency", () => {
    expect(report.total.amount.toFixed()).toBe(TOTAL);
    expect(report.baseCurrency).toBe("USD");
  });

  it("flags the single-position ceiling breach (Cash at 86.83% > 20%)", () => {
    const breach = report.breaches.find(
      (e) => e.rule.id === "pos-single-20" && e.subject === "USD Cash",
    );
    expect(breach).toBeDefined();
    expect(breach!.breached).toBe(true);
    expect(breach!.severity).toBe("critical");
    // weight = 250000 / 287920
    expect(breach!.weight.toFixed(4)).toBe(
      new Decimal("250000").div(TOTAL).toFixed(4),
    );
    // Amount over the 20% ceiling: 250000 - 0.20 * 287920 = 250000 - 57584.
    expect(breach!.exceedanceAmount.amount.toFixed()).toBe("192416");
  });

  it("does not flag positions that are within the limit (Apple at 10.42%)", () => {
    const apple = report.evaluations.find(
      (e) => e.rule.id === "pos-single-20" && e.subject === "Apple Inc.",
    );
    expect(apple).toBeDefined();
    expect(apple!.breached).toBe(false);
    expect(apple!.exceedanceAmount.isZero()).toBe(true);
  });

  it("flags the cash asset-class ceiling (86.83% > 50%)", () => {
    const cash = report.evaluations.find((e) => e.rule.id === "ac-cash-50")!;
    expect(cash.breached).toBe(true);
    expect(cash.subject).toBe("Cash");
    expect(cash.severity).toBe("warning");
  });

  it("satisfies the crypto ceiling (no crypto, 0% <= 5%)", () => {
    const crypto = report.evaluations.find((e) => e.rule.id === "ac-crypto-5")!;
    expect(crypto.breached).toBe(false);
    expect(crypto.weight.isZero()).toBe(true);
    expect(crypto.value.isZero()).toBe(true);
  });

  it("flags the equity floor breach (10.42% < 15% minimum)", () => {
    const floor = report.evaluations.find(
      (e) => e.rule.id === "ac-equity-floor-15",
    )!;
    expect(floor.direction).toBe("min");
    expect(floor.breached).toBe(true);
    // Short of the 15% floor by value: 0.15 * 287920 - 30000 = 43188 - 30000.
    expect(floor.exceedanceAmount.amount.toFixed()).toBe("13188");
  });

  it("satisfies the EUR currency ceiling (2.75% <= 25%)", () => {
    const eur = report.evaluations.find((e) => e.rule.id === "ccy-eur-25")!;
    expect(eur.breached).toBe(false);
    expect(eur.subject).toBe("EUR");
    expect(eur.weight.toFixed(4)).toBe(
      new Decimal("7920").div(TOTAL).toFixed(4),
    );
  });

  it("summarises breach counts by severity", () => {
    // critical: the single-position breach (Cash). warning: cash ceiling +
    // equity floor.
    expect(report.counts.critical).toBe(1);
    expect(report.counts.warning).toBe(2);
    expect(report.breaches).toHaveLength(3);
  });

  it("sorts breaches first, criticals before warnings", () => {
    expect(report.evaluations[0].breached).toBe(true);
    expect(report.evaluations[0].severity).toBe("critical");
    // All breaches come before all non-breaches.
    const firstClean = report.evaluations.findIndex((e) => !e.breached);
    const lastBreach = report.evaluations
      .map((e) => e.breached)
      .lastIndexOf(true);
    expect(lastBreach).toBeLessThan(firstClean);
  });
});

describe("evaluateAlerts — boundary and edge behaviour", () => {
  const rate: FxRateTable = { base: "USD", rates: {} };

  function singleHoldingPortfolio(value: string): Portfolio {
    return {
      id: "pf",
      name: "PF",
      baseCurrency: "USD",
      holdings: [
        {
          id: "h1",
          name: "Only",
          assetClass: "equity",
          currency: "USD",
          lots: [],
          valuations: [
            {
              id: "v1",
              value: { amount: value, currency: "USD" },
              asOf: "2026-01-01T00:00:00Z",
              source: "manual",
              confidence: "high",
            },
          ],
          tags: [],
        },
      ],
    };
  }

  it("treats exact-equality as within the limit (not a breach)", () => {
    // A single holding is 100% of the book. A max rule at exactly 1.0 is met.
    const report = evaluateAlerts(
      singleHoldingPortfolio("100"),
      [
        {
          id: "pos",
          label: "pos",
          scope: "position",
          direction: "max",
          threshold: "1",
        },
      ],
      rate,
    );
    expect(report.breaches).toHaveLength(0);
    expect(report.evaluations[0].weight.toString()).toBe("1");
  });

  it("flags a min floor when the single holding is under it", () => {
    const report = evaluateAlerts(
      singleHoldingPortfolio("100"),
      [
        {
          id: "ac",
          label: "Bond floor",
          scope: "assetClass",
          direction: "min",
          threshold: "0.10",
          target: { assetClass: "bond" },
        },
      ],
      rate,
    );
    // No bonds → 0% < 10% floor → breach.
    const bond = report.evaluations[0];
    expect(bond.breached).toBe(true);
    expect(bond.weight.isZero()).toBe(true);
    // Short by 10% of 100 = 10.
    expect(bond.exceedanceAmount.amount.toFixed()).toBe("10");
  });

  it("handles a zero-value portfolio without dividing by zero", () => {
    const empty: Portfolio = {
      id: "pf",
      name: "Empty",
      baseCurrency: "USD",
      holdings: [],
    };
    const report = evaluateAlerts(
      empty,
      [
        {
          id: "ac",
          label: "Cash ceiling",
          scope: "assetClass",
          direction: "max",
          threshold: "0.5",
          target: { assetClass: "cash" },
        },
      ],
      rate,
    );
    expect(report.total.isZero()).toBe(true);
    expect(report.evaluations[0].weight.isZero()).toBe(true);
    expect(report.evaluations[0].breached).toBe(false);
  });

  it("skips position rules for holdings with no valuation", () => {
    const pf: Portfolio = {
      id: "pf",
      name: "PF",
      baseCurrency: "USD",
      holdings: [
        {
          id: "h1",
          name: "Valued",
          assetClass: "equity",
          currency: "USD",
          lots: [],
          valuations: [
            {
              id: "v1",
              value: { amount: "100", currency: "USD" },
              asOf: "2026-01-01T00:00:00Z",
              source: "manual",
              confidence: "high",
            },
          ],
          tags: [],
        },
        {
          id: "h2",
          name: "Unvalued",
          assetClass: "art",
          currency: "USD",
          lots: [],
          valuations: [],
          tags: [],
        },
      ],
    };
    const report = evaluateAlerts(
      pf,
      [
        {
          id: "pos",
          label: "pos",
          scope: "position",
          direction: "max",
          threshold: "0.5",
        },
      ],
      rate,
    );
    // Only the valued holding produced an evaluation.
    expect(report.evaluations).toHaveLength(1);
    expect(report.evaluations[0].subject).toBe("Valued");
  });

  it("throws when the FX base does not match the portfolio base", () => {
    expect(() =>
      evaluateAlerts(alertsPortfolio, defaultAlertRules, {
        base: "EUR",
        rates: { USD: "0.9" },
      }),
    ).toThrow(/base/);
  });

  it("is deterministic — same inputs yield identical reports", () => {
    const a = evaluateAlerts(alertsPortfolio, defaultAlertRules, alertsRateTable);
    const b = evaluateAlerts(alertsPortfolio, defaultAlertRules, alertsRateTable);
    expect(JSON.stringify(a.evaluations.map((e) => [e.subject, e.weight.toString(), e.breached]))).toBe(
      JSON.stringify(b.evaluations.map((e) => [e.subject, e.weight.toString(), e.breached])),
    );
  });
});

describe("format helpers", () => {
  it("formats a weight as a percent", () => {
    expect(formatWeight(new Decimal("0.8683"))).toBe("86.8%");
    expect(formatWeight(new Decimal("0.05"), 0)).toBe("5%");
  });

  it("formats a limit description", () => {
    expect(formatLimit("max", new Decimal("0.2"))).toBe("max 20.0%");
    expect(formatLimit("min", new Decimal("0.15"))).toBe("min 15.0%");
  });
});

describe("READ-ONLY guarantee", () => {
  it("never mutates the input portfolio or rules", () => {
    const ruleSnapshot = JSON.stringify(byId(defaultAlertRules, "pos-single-20"));
    const pfSnapshot = JSON.stringify(alertsPortfolio);
    evaluateAlerts(alertsPortfolio, defaultAlertRules, alertsRateTable);
    expect(JSON.stringify(byId(defaultAlertRules, "pos-single-20"))).toBe(
      ruleSnapshot,
    );
    expect(JSON.stringify(alertsPortfolio)).toBe(pfSnapshot);
  });
});
