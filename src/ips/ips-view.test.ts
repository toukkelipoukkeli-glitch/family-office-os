import { describe, expect, it } from "vitest";

import {
  evaluatePolicy,
  ipsPortfolio,
  ipsRateTable,
  sampleIps,
} from "@/lib/ips";

import { buildIpsViewModel } from "./ips-view";

describe("buildIpsViewModel", () => {
  const report = evaluatePolicy(ipsPortfolio, sampleIps, ipsRateTable);
  const vm = buildIpsViewModel(report);

  it("carries the policy name, benchmark and base-currency total", () => {
    expect(vm.policyName).toBe("Ursin Family Office IPS 2026");
    expect(vm.benchmarkLabel).toBe("Balanced 60/40 policy");
    expect(vm.baseCurrency).toBe("USD");
    expect(vm.totalLabel).toBe("$287,920.00");
  });

  it("counts breaches and marks the book as non-compliant", () => {
    expect(vm.criticalCount).toBe(1);
    expect(vm.warningCount).toBe(2);
    expect(vm.totalBreaches).toBe(3);
    expect(vm.compliant).toBe(false);
    expect(vm.breaches).toHaveLength(3);
  });

  it("formats the leading critical position-cap breach", () => {
    const first = vm.breaches[0];
    expect(first.severity).toBe("critical");
    expect(first.subject).toBe("USD Cash");
    expect(first.kindLabel).toBe("Position cap");
    expect(first.weightLabel).toBe("86.8%");
    expect(first.limitLabel).toBe("max 20.0%");
    expect(first.valueLabel).toBe("$250,000.00");
    expect(first.breachDetail).toMatch(/over the 20\.0% ceiling/);
  });

  it("phrases a min-bound breach as 'short of' the floor", () => {
    const floor = vm.breaches.find((r) => r.limitLabel.startsWith("min"));
    expect(floor).toBeDefined();
    expect(floor!.breachDetail).toMatch(/short of the 15\.0% floor/);
  });

  it("clamps every bar fill into [0, 1]", () => {
    for (const row of vm.rows) {
      expect(row.fill).toBeGreaterThanOrEqual(0);
      expect(row.fill).toBeLessThanOrEqual(1);
    }
  });

  it("leaves breachDetail undefined on a satisfied check", () => {
    const ok = vm.rows.find((r) => !r.breached);
    expect(ok).toBeDefined();
    expect(ok!.breachDetail).toBeUndefined();
  });
});
