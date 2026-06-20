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
