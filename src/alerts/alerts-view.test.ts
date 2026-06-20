import { describe, expect, it } from "vitest";

import {
  alertsPortfolio,
  alertsRateTable,
  defaultAlertRules,
  evaluateAlerts,
} from "@/lib/alerts";

import { buildAlertsViewModel } from "./alerts-view";

describe("buildAlertsViewModel", () => {
  const report = evaluateAlerts(
    alertsPortfolio,
    defaultAlertRules,
    alertsRateTable,
  );
  const vm = buildAlertsViewModel(report);

  it("formats the monitored book total in the base currency", () => {
    expect(vm.baseCurrency).toBe("USD");
    expect(vm.totalLabel).toBe("$287,920.00");
  });

  it("carries the breach counts and is not all-clear for the sample book", () => {
    expect(vm.criticalCount).toBe(1);
    expect(vm.warningCount).toBe(2);
    expect(vm.totalBreaches).toBe(3);
    expect(vm.allClear).toBe(false);
  });

  it("builds one row per evaluation and a breaches subset", () => {
    expect(vm.rows.length).toBe(report.evaluations.length);
    expect(vm.breaches.length).toBe(3);
    expect(vm.breaches.every((r) => r.breached)).toBe(true);
  });

  it("phrases a max breach as 'over the ceiling' with money", () => {
    const cash = vm.breaches.find((r) => r.subject === "USD Cash")!;
    expect(cash.weightLabel).toBe("86.8%");
    expect(cash.limitLabel).toBe("max 20.0%");
    expect(cash.breachDetail).toMatch(/over the 20\.0% ceiling/);
    expect(cash.breachDetail).toMatch(/192,416/);
    expect(cash.fill).toBe(1); // 86.8% / 20% clamps to full bar.
  });

  it("phrases a min breach as 'short of the floor'", () => {
    const equity = vm.breaches.find((r) => r.ruleLabel === "Equity floor")!;
    expect(equity.limitLabel).toBe("min 15.0%");
    expect(equity.breachDetail).toMatch(/short of the 15\.0% floor/);
    // 10.42% / 15% ~ 0.69.
    expect(equity.fill).toBeGreaterThan(0.6);
    expect(equity.fill).toBeLessThan(0.8);
  });

  it("leaves satisfied rows without a breach detail", () => {
    const crypto = vm.rows.find((r) => r.ruleLabel === "Crypto exposure")!;
    expect(crypto.breached).toBe(false);
    expect(crypto.breachDetail).toBeUndefined();
    expect(crypto.fill).toBe(0);
  });

  it("fills a zero-threshold ceiling bar fully when any weight is present", () => {
    // A max rule at threshold 0 means "hold none of this". Any non-zero weight
    // is a breach; the bar should saturate (fill 1) rather than divide by zero.
    const zeroCeiling = buildAlertsViewModel(
      evaluateAlerts(
        alertsPortfolio,
        [
          {
            id: "no-cash",
            label: "No cash allowed",
            scope: "assetClass",
            direction: "max",
            threshold: "0",
            target: { assetClass: "cash" },
          },
        ],
        alertsRateTable,
      ),
    );
    const row = zeroCeiling.rows.find((r) => r.subject === "Cash")!;
    expect(row.breached).toBe(true);
    expect(row.fill).toBe(1);
  });

  it("keeps a zero-threshold bar empty when the subject weight is also zero", () => {
    // Crypto is absent from the sample book (0%). A 0-ceiling rule on it is
    // satisfied (0 is not > 0) and the bar stays empty rather than NaN.
    const zeroOnAbsent = buildAlertsViewModel(
      evaluateAlerts(
        alertsPortfolio,
        [
          {
            id: "no-crypto",
            label: "No crypto allowed",
            scope: "assetClass",
            direction: "max",
            threshold: "0",
            target: { assetClass: "crypto" },
          },
        ],
        alertsRateTable,
      ),
    );
    const row = zeroOnAbsent.rows.find((r) => r.subject === "Crypto")!;
    expect(row.breached).toBe(false);
    expect(row.fill).toBe(0);
    expect(Number.isNaN(row.fill)).toBe(false);
  });

  it("reports all-clear when no rule is breached", () => {
    const clean = buildAlertsViewModel(
      evaluateAlerts(
        alertsPortfolio,
        [
          {
            id: "loose",
            label: "Loose ceiling",
            scope: "position",
            direction: "max",
            threshold: "1",
          },
        ],
        alertsRateTable,
      ),
    );
    expect(clean.allClear).toBe(true);
    expect(clean.totalBreaches).toBe(0);
  });
});
