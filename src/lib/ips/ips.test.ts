import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import type { Portfolio } from "../model/portfolio";
import {
  buildBreachHistory,
  evaluatePolicy,
  formatLimit,
  formatWeight,
  ipsAsOf1,
  ipsAsOf2,
  ipsPortfolio,
  ipsRateTable,
  rebalancedPortfolio,
  sampleIps,
  toWeight,
  validateConstraint,
  validatePolicy,
  type CompliancePoint,
  type ComplianceReport,
  type ConstraintCheck,
  type InvestmentPolicy,
  type IpsConstraint,
} from "./index";

/** Find the (single) check for a constraint id + bound. */
function check(
  report: ComplianceReport,
  constraintId: string,
  bound: "min" | "max",
  subject?: string,
): ConstraintCheck {
  const found = report.checks.filter(
    (c) =>
      c.constraint.id === constraintId &&
      c.bound === bound &&
      (subject === undefined || c.subject === subject),
  );
  expect(found, `${constraintId}/${bound}/${subject ?? "*"}`).toHaveLength(1);
  return found[0];
}

describe("IPS policy validation", () => {
  it("accepts the sample policy", () => {
    expect(() => validatePolicy(sampleIps)).not.toThrow();
  });

  it("coerces weights and rejects out-of-range ones", () => {
    expect(toWeight("0.25").toString()).toBe("0.25");
    expect(() => toWeight("1.5")).toThrow(/\[0, 1\]/);
    expect(() => toWeight("-0.1")).toThrow(/\[0, 1\]/);
    expect(() => toWeight(NaN)).toThrow();
  });

  it("requires at least one bound on an asset-class band", () => {
    const bad: IpsConstraint = {
      id: "b",
      kind: "assetClassBand",
      label: "x",
      assetClass: "equity",
    };
    expect(() => validateConstraint(bad)).toThrow(/at least one of min \/ max/);
  });

  it("rejects a band whose min exceeds its max", () => {
    const bad: IpsConstraint = {
      id: "b",
      kind: "assetClassBand",
      label: "x",
      assetClass: "equity",
      min: "0.40",
      max: "0.20",
    };
    expect(() => validateConstraint(bad)).toThrow(/min .* must be <= max/);
  });

  it("rejects a currency cap with a blank code", () => {
    const bad: IpsConstraint = {
      id: "c",
      kind: "currencyCap",
      label: "x",
      currency: "  ",
      max: "0.25",
    };
    expect(() => validateConstraint(bad)).toThrow(/requires a currency code/);
  });

  it("rejects duplicate constraint ids in a policy", () => {
    const dup: InvestmentPolicy = {
      id: "p",
      name: "p",
      constraints: [
        { id: "x", kind: "positionCap", label: "a", max: "0.2" },
        { id: "x", kind: "liquidityFloor", label: "b", min: "0.3" },
      ],
    };
    expect(() => validatePolicy(dup)).toThrow(/duplicate constraint id/);
  });
});

describe("evaluatePolicy — sample book breaches", () => {
  const report = evaluatePolicy(ipsPortfolio, sampleIps, ipsRateTable);

  it("measures the book against the 287,920 USD total", () => {
    expect(report.baseCurrency).toBe("USD");
    expect(report.total.amount.toFixed(2)).toBe("287920.00");
  });

  it("flags exactly 1 critical + 2 warning breaches", () => {
    expect(report.counts).toEqual({ critical: 1, warning: 2 });
    expect(report.breaches).toHaveLength(3);
    expect(report.compliant).toBe(false);
  });

  it("orders the critical position-cap breach first", () => {
    const first = report.breaches[0];
    expect(first.severity).toBe("critical");
    expect(first.constraint.id).toBe("pos-cap-20");
    expect(first.subject).toBe("USD Cash");
  });

  it("breaches the single-position cap with USD Cash at 86.83%", () => {
    const c = check(report, "pos-cap-20", "max", "USD Cash");
    expect(c.breached).toBe(true);
    expect(formatWeight(c.weight, 2)).toBe("86.83%");
    // 250,000 - 0.20 * 287,920 = 192,416 over the ceiling.
    expect(c.exceedanceAmount.amount.toFixed(2)).toBe("192416.00");
  });

  it("does not breach the position cap for the small equity / wine holdings", () => {
    expect(check(report, "pos-cap-20", "max", "Apple Inc.").breached).toBe(false);
    expect(
      check(report, "pos-cap-20", "max", "Château Lafite Rothschild 2016 (6x75cl)")
        .breached,
    ).toBe(false);
  });

  it("breaches the equity floor (min 15%) but not the equity ceiling (max 40%)", () => {
    const min = check(report, "band-equity", "min", "Equities");
    expect(min.breached).toBe(true);
    expect(formatWeight(min.weight, 2)).toBe("10.42%");
    // 0.15 * 287,920 - 30,000 = 13,188 short of the floor.
    expect(min.exceedanceAmount.amount.toFixed(2)).toBe("13188.00");

    expect(check(report, "band-equity", "max", "Equities").breached).toBe(false);
  });

  it("breaches the cash ceiling (max 50%)", () => {
    const c = check(report, "band-cash", "max", "Cash");
    expect(c.breached).toBe(true);
    // 250,000 - 0.50 * 287,920 = 106,040 over the ceiling.
    expect(c.exceedanceAmount.amount.toFixed(2)).toBe("106040.00");
  });

  it("satisfies the crypto ceiling, liquidity floor and EUR cap", () => {
    expect(check(report, "band-crypto", "max", "Crypto").breached).toBe(false);
    const liq = check(report, "liq-floor-30", "min", "Liquid assets");
    expect(liq.breached).toBe(false);
    expect(formatWeight(liq.weight, 2)).toBe("97.25%");
    expect(check(report, "ccy-eur-25", "max", "EUR").breached).toBe(false);
  });

  it("never reports a negative exceedance amount on a satisfied check", () => {
    for (const c of report.checks) {
      if (!c.breached) {
        expect(c.exceedanceAmount.amount.isNegative()).toBe(false);
        expect(c.exceedanceAmount.amount.isZero()).toBe(true);
      }
    }
  });
});

describe("evaluatePolicy — a fully compliant book", () => {
  // A balanced book inside every band, split into small holdings so no single
  // position exceeds the 20% cap: equity 30% (2×15%), bond 45% (3×15%), cash
  // 25% (2×12.5%), crypto 0, EUR 0. Liquid 100%. Total 100,000 USD.
  const sleeve = (
    id: string,
    name: string,
    assetClass: "equity" | "bond" | "cash",
    amount: string,
  ): Portfolio["holdings"][number] => ({
    id,
    name,
    assetClass,
    currency: "USD",
    lots: [],
    valuations: [
      {
        id: `${id}-v`,
        value: { amount, currency: "USD" },
        asOf: "2026-06-30T00:00:00Z",
        source: assetClass === "cash" ? "manual" : "market",
        confidence: "high",
      },
    ],
    tags: [],
  });

  const balanced: Portfolio = {
    id: "pf-balanced",
    name: "Balanced",
    baseCurrency: "USD",
    holdings: [
      sleeve("h-eq1", "Equity A", "equity", "15000.00"),
      sleeve("h-eq2", "Equity B", "equity", "15000.00"),
      sleeve("h-bd1", "Bond A", "bond", "15000.00"),
      sleeve("h-bd2", "Bond B", "bond", "15000.00"),
      sleeve("h-bd3", "Bond C", "bond", "15000.00"),
      sleeve("h-cash1", "Cash A", "cash", "12500.00"),
      sleeve("h-cash2", "Cash B", "cash", "12500.00"),
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-30T00:00:00Z",
  };

  it("reports zero breaches and compliant === true", () => {
    const report = evaluatePolicy(balanced, sampleIps, ipsRateTable);
    expect(report.breaches).toHaveLength(0);
    expect(report.compliant).toBe(true);
    expect(report.counts).toEqual({ critical: 0, warning: 0 });
    // Every check still present (every constraint evaluated).
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it("treats a weight exactly on the limit as compliant (boundary is allowed)", () => {
    // cash sleeve is 25,000 / 100,000 = 25%; set a cap of exactly 25%.
    const onTheLine: InvestmentPolicy = {
      id: "edge",
      name: "edge",
      constraints: [
        { id: "cash-25", kind: "assetClassBand", label: "cash", assetClass: "cash", max: "0.25" },
      ],
    };
    const report = evaluatePolicy(balanced, onTheLine, ipsRateTable);
    expect(report.compliant).toBe(true);
  });
});

describe("evaluatePolicy — empty book is handled", () => {
  it("does not divide by zero and reports the liquidity floor as breached", () => {
    const empty: Portfolio = {
      id: "pf-empty",
      name: "Empty",
      baseCurrency: "USD",
      holdings: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const report = evaluatePolicy(empty, sampleIps, ipsRateTable);
    expect(report.total.amount.isZero()).toBe(true);
    // No positions → no position-cap checks.
    expect(report.checks.some((c) => c.constraint.id === "pos-cap-20")).toBe(false);
    // Liquid 0% < 30% floor → breached.
    const liq = report.checks.find((c) => c.constraint.id === "liq-floor-30");
    expect(liq?.breached).toBe(true);
  });
});

describe("formatting helpers", () => {
  it("formats weights and limits", () => {
    expect(formatWeight(new Decimal("0.8683"))).toBe("86.8%");
    expect(formatWeight(new Decimal("0.8683"), 2)).toBe("86.83%");
    expect(formatLimit("max", new Decimal("0.20"))).toBe("max 20.0%");
    expect(formatLimit("min", new Decimal("0.15"))).toBe("min 15.0%");
  });
});

describe("buildBreachHistory", () => {
  const r1 = evaluatePolicy(ipsPortfolio, sampleIps, ipsRateTable);
  const r2 = evaluatePolicy(rebalancedPortfolio, sampleIps, ipsRateTable);
  const points: CompliancePoint[] = [
    { asOf: ipsAsOf1, report: r1 },
    { asOf: ipsAsOf2, report: r2 },
  ];

  it("records one transition per point, the first with no predecessor", () => {
    const history = buildBreachHistory(points);
    expect(history.transitions).toHaveLength(2);
    expect(history.transitions[0].fromAsOf).toBeUndefined();
    expect(history.transitions[0].asOf).toBe(ipsAsOf1);
    expect(history.transitions[1].fromAsOf).toBe(ipsAsOf1);
    expect(history.transitions[1].asOf).toBe(ipsAsOf2);
  });

  it("treats every breach at the first point as newly opened", () => {
    const history = buildBreachHistory(points);
    const t0 = history.transitions[0];
    expect(t0.opened).toHaveLength(r1.breaches.length);
    expect(t0.persisting).toHaveLength(0);
    expect(t0.resolved).toHaveLength(0);
    expect(t0.active).toHaveLength(r1.breaches.length);
  });

  it("diffs the second point: resolved, persisting and opened breaches", () => {
    const history = buildBreachHistory(points);
    const t1 = history.transitions[1];

    const keys = (bs: { key: string }[]) => bs.map((b) => b.key).sort();

    // Point 1 breaches: pos-cap(USD Cash), band-equity/min(Equities),
    //   band-cash/max(Cash).
    // Point 2 breaches: pos-cap(USD Cash, EUR Cash, Apple Inc., Bitcoin),
    //   band-cash/max(Cash), band-crypto/max(Crypto), ccy-eur-25/max(EUR).
    //
    // → resolved: the equity floor cleared.
    expect(keys(t1.resolved)).toEqual(["band-equity::min::Equities"]);

    // → persisting: USD Cash position cap + the cash ceiling were breached at
    //   both points.
    expect(keys(t1.persisting)).toEqual(
      ["band-cash::max::Cash", "pos-cap-20::max::USD Cash"].sort(),
    );

    // → opened: three new position-cap breaches + crypto cap + EUR cap.
    expect(keys(t1.opened)).toEqual(
      [
        "ccy-eur-25::max::EUR",
        "band-crypto::max::Crypto",
        "pos-cap-20::max::EUR Cash",
        "pos-cap-20::max::Apple Inc.",
        "pos-cap-20::max::Bitcoin",
      ].sort(),
    );
  });

  it("surfaces outstanding breaches: still active and open since before the last point", () => {
    const history = buildBreachHistory(points);
    // USD Cash pos-cap + cash ceiling opened at point 1 and are still active.
    expect(history.outstanding.map((b) => b.key).sort()).toEqual(
      ["band-cash::max::Cash", "pos-cap-20::max::USD Cash"].sort(),
    );
  });

  it("handles a single-point history (everything outstanding-free)", () => {
    const history = buildBreachHistory([{ asOf: ipsAsOf1, report: r1 }]);
    expect(history.transitions).toHaveLength(1);
    // All breaches opened at the only point → none outstanding.
    expect(history.outstanding).toHaveLength(0);
  });

  it("returns an empty history for no points", () => {
    const history = buildBreachHistory([]);
    expect(history.transitions).toHaveLength(0);
    expect(history.outstanding).toHaveLength(0);
  });
});
