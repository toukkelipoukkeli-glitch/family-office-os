import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import type { FxRateTable } from "../allocation";
import type { Portfolio } from "../model/portfolio";
import {
  buildBreachHistory,
  evaluatePolicy,
  toWeight,
  type CompliancePoint,
  type ComplianceReport,
  type InvestmentPolicy,
} from "./index";

/**
 * Adversarial edge-case tests for the IPS engine and history — independent
 * tester pass. These probe boundaries the happy-path suite doesn't: currency
 * casing, unvalued holdings, Decimal inputs, report integrity, and a breach
 * that resolves then re-opens (outstanding accounting).
 */

const USD_TABLE: FxRateTable = { base: "USD", rates: { USD: "1", EUR: "1.1" } };

function holding(
  id: string,
  name: string,
  assetClass: Portfolio["holdings"][number]["assetClass"],
  currency: string,
  amount: string | null,
): Portfolio["holdings"][number] {
  return {
    id,
    name,
    assetClass,
    currency,
    lots: [],
    valuations:
      amount === null
        ? []
        : [
            {
              id: `${id}-v`,
              value: { amount, currency },
              asOf: "2026-06-30T00:00:00Z",
              source: "manual",
              confidence: "high",
            },
          ],
    tags: [],
  };
}

function portfolio(holdings: Portfolio["holdings"]): Portfolio {
  return {
    id: "pf-adv",
    name: "Adversarial",
    baseCurrency: "USD",
    holdings,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-30T00:00:00Z",
  };
}

describe("currencyCap — case-insensitive matching", () => {
  // 50% USD, 50% EUR by reported currency. A lowercase "eur" cap of 25% must
  // still resolve to the EUR slice (the engine uppercases for lookup).
  const pf = portfolio([
    holding("h-usd", "USD Cash", "cash", "USD", "50000.00"),
    holding("h-eur", "EUR Cash", "cash", "EUR", "50000.00"),
  ]);

  it("matches a lowercase currency code against the uppercase slice", () => {
    const policy: InvestmentPolicy = {
      id: "p",
      name: "p",
      constraints: [
        { id: "ccy-eur", kind: "currencyCap", label: "EUR cap", currency: "eur", max: "0.25" },
      ],
    };
    const report = evaluatePolicy(pf, policy, USD_TABLE);
    const c = report.checks.find((x) => x.constraint.id === "ccy-eur");
    expect(c).toBeDefined();
    expect(c!.subject).toBe("EUR");
    // EUR value is 50000 EUR -> 55000 USD; 55000 / 105000 = ~52.4% > 25% cap.
    expect(c!.breached).toBe(true);
  });

  it("treats an absent currency as 0% (compliant against a cap)", () => {
    const policy: InvestmentPolicy = {
      id: "p",
      name: "p",
      constraints: [
        { id: "ccy-gbp", kind: "currencyCap", label: "GBP cap", currency: "GBP", max: "0.10" },
      ],
    };
    const report = evaluatePolicy(pf, policy, USD_TABLE);
    const c = report.checks.find((x) => x.constraint.id === "ccy-gbp")!;
    expect(c.weight.isZero()).toBe(true);
    expect(c.breached).toBe(false);
  });
});

describe("positionCap — unvalued holdings", () => {
  it("skips a holding with no valuation (contributes no check)", () => {
    const pf = portfolio([
      holding("h-real", "Real Co", "equity", "USD", "10000.00"),
      holding("h-ghost", "Ghost Co", "equity", "USD", null),
    ]);
    const policy: InvestmentPolicy = {
      id: "p",
      name: "p",
      constraints: [{ id: "pos", kind: "positionCap", label: "cap", max: "0.50" }],
    };
    const report = evaluatePolicy(pf, policy, USD_TABLE);
    const posChecks = report.checks.filter((c) => c.constraint.id === "pos");
    // Only the valued holding produces a check.
    expect(posChecks).toHaveLength(1);
    expect(posChecks[0].subject).toBe("Real Co");
    // It is the whole book (100%) so it breaches the 50% cap.
    expect(posChecks[0].breached).toBe(true);
  });
});

describe("toWeight — exact decimal and boundary inputs", () => {
  it("accepts a Decimal instance unchanged", () => {
    const d = new Decimal("0.333333333333333333");
    expect(toWeight(d).equals(d)).toBe(true);
  });

  it("accepts the exact bounds 0 and 1", () => {
    expect(toWeight(0).toString()).toBe("0");
    expect(toWeight(1).toString()).toBe("1");
    expect(toWeight("1").toString()).toBe("1");
  });

  it("rejects Infinity and just-over-1 overflow", () => {
    expect(() => toWeight(Infinity)).toThrow(/\[0, 1\]/);
    expect(() => toWeight(-Infinity)).toThrow(/\[0, 1\]/);
    expect(() => toWeight("1.0000000001")).toThrow(/\[0, 1\]/);
  });
});

describe("evaluatePolicy — report integrity", () => {
  const pf = portfolio([
    holding("h-eq", "Equity", "equity", "USD", "60000.00"),
    holding("h-cash", "Cash", "cash", "USD", "40000.00"),
  ]);
  const policy: InvestmentPolicy = {
    id: "p",
    name: "p",
    constraints: [
      {
        id: "band-eq",
        kind: "assetClassBand",
        label: "Equity band",
        assetClass: "equity",
        min: "0.70",
        max: "0.90",
        severity: "critical",
      },
      { id: "pos", kind: "positionCap", label: "Position cap", max: "0.50" },
    ],
  };

  it("keeps breaches and counts consistent with checks", () => {
    const report = evaluatePolicy(pf, policy, USD_TABLE);
    const breachedInChecks = report.checks.filter((c) => c.breached);
    expect(report.breaches).toEqual(breachedInChecks);
    const total = report.counts.critical + report.counts.warning;
    expect(total).toBe(report.breaches.length);
    expect(report.compliant).toBe(report.breaches.length === 0);
  });

  it("sorts breaches ahead of satisfied checks", () => {
    const report = evaluatePolicy(pf, policy, USD_TABLE);
    let seenSatisfied = false;
    for (const c of report.checks) {
      if (!c.breached) seenSatisfied = true;
      else expect(seenSatisfied, "a breach appeared after a satisfied check").toBe(false);
    }
  });

  it("never emits a negative exceedance on a breach", () => {
    const report = evaluatePolicy(pf, policy, USD_TABLE);
    for (const c of report.breaches) {
      expect(c.exceedance.isNegative()).toBe(false);
      expect(c.exceedanceAmount.amount.isNegative()).toBe(false);
    }
  });
});

describe("buildBreachHistory — resolve then re-open is not outstanding", () => {
  // Build synthetic reports that share one breach key, toggling it
  // present / absent / present so the final point's breach is *brand new* again
  // and must NOT count as outstanding.
  function reportWith(breached: boolean): ComplianceReport {
    const pf = portfolio([
      holding("h-cash", "Cash", "cash", "USD", breached ? "100000.00" : "10000.00"),
      holding("h-eq", "Equity", "equity", "USD", breached ? "1000.00" : "90000.00"),
    ]);
    const policy: InvestmentPolicy = {
      id: "p",
      name: "p",
      constraints: [
        {
          id: "cash-cap",
          kind: "assetClassBand",
          label: "Cash cap",
          assetClass: "cash",
          max: "0.50",
        },
      ],
    };
    return evaluatePolicy(pf, policy, USD_TABLE);
  }

  it("does not mark a re-opened breach as outstanding", () => {
    const points: CompliancePoint[] = [
      { asOf: "2026-01-31T00:00:00Z", report: reportWith(true) }, // opened
      { asOf: "2026-02-28T00:00:00Z", report: reportWith(false) }, // resolved
      { asOf: "2026-03-31T00:00:00Z", report: reportWith(true) }, // re-opened (brand new)
    ];
    const history = buildBreachHistory(points);

    const t1 = history.transitions[1];
    expect(t1.resolved.map((b) => b.key)).toContain("cash-cap::max::Cash");

    const t2 = history.transitions[2];
    expect(t2.opened.map((b) => b.key)).toContain("cash-cap::max::Cash");
    expect(t2.persisting).toHaveLength(0);

    // Re-opened at the final point → brand new → NOT outstanding.
    expect(history.outstanding).toHaveLength(0);
  });
});
