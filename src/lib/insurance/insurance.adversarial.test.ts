import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import {
  analyzeInsurance,
  CRITICAL_COVERAGE_RATIO,
  WELL_COVERED_RATIO,
  type InsuranceBook,
  type Policy,
} from "./index";

const usd = (a: string) => Money.of(a, "USD");

function book(
  policies: Policy[],
  exposure?: Partial<InsuranceBook["exposure"]>,
): InsuranceBook {
  return {
    id: "b",
    name: "Test book",
    currency: "USD",
    policies,
    exposure: {
      netWorth: usd("10000000"),
      lifeNeed: usd("5000000"),
      propertyValue: usd("4000000"),
      liabilityExposure: usd("10000000"),
      ...exposure,
    },
  };
}

function policy(over: Partial<Policy> & Pick<Policy, "id" | "kind">): Policy {
  return {
    name: over.name ?? over.id,
    carrier: over.carrier ?? "Carrier",
    status: over.status ?? "active",
    coverage: over.coverage ?? usd("1000000"),
    annualPremium: over.annualPremium ?? usd("1000"),
    ...over,
  };
}

describe("analyzeInsurance — adversarial edge cases", () => {
  it("an empty book flags every funded exposure as critical and is tower-warned", () => {
    const a = analyzeInsurance(
      book([], {
        netWorth: usd("10000000"),
        lifeNeed: usd("5000000"),
        propertyValue: usd("4000000"),
        liabilityExposure: usd("10000000"),
      }),
    );
    expect(a.totalActiveCoverage.isZero()).toBe(true);
    expect(a.totalAnnualPremium.isZero()).toBe(true);
    expect(a.activePolicyCount).toBe(0);
    // life, property, liability each have funded exposure with zero cover.
    const criticalScopes = a.gaps
      .filter((g) => g.severity === "critical")
      .map((g) => g.scope)
      .sort();
    expect(criticalScopes).toEqual(["liability", "life", "property"]);
    // tower is zero < net worth -> warning.
    expect(a.gaps.some((g) => g.id === "gap-book-liability-tower")).toBe(true);
    expect(a.hasCriticalGap).toBe(true);
  });

  it("coverage exactly at the critical ratio is a warning, not critical", () => {
    // 0.5 exactly: lessThan(0.5) is false -> not critical; lessThan(0.9) -> warning.
    const a = analyzeInsurance(
      book([policy({ id: "life", kind: "life", coverage: usd("2500000") })], {
        lifeNeed: usd("5000000"),
      }),
    );
    const life = a.categories.find((c) => c.kind === "life")!;
    expect(life.coverageRatio!.equals(CRITICAL_COVERAGE_RATIO)).toBe(true);
    expect(a.gaps.some((g) => g.id === "gap-life-critical")).toBe(false);
    const warn = a.gaps.find((g) => g.id === "gap-life-thin");
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe("warning");
  });

  it("coverage just below the critical ratio is critical", () => {
    const a = analyzeInsurance(
      book([policy({ id: "life", kind: "life", coverage: usd("2499999") })], {
        lifeNeed: usd("5000000"),
      }),
    );
    expect(a.gaps.some((g) => g.id === "gap-life-critical")).toBe(true);
  });

  it("coverage exactly at the well-covered ratio produces no category gap", () => {
    const a = analyzeInsurance(
      book([policy({ id: "life", kind: "life", coverage: usd("4500000") })], {
        lifeNeed: usd("5000000"),
      }),
    );
    const life = a.categories.find((c) => c.kind === "life")!;
    expect(life.coverageRatio!.equals(WELL_COVERED_RATIO)).toBe(true);
    expect(a.gaps.some((g) => g.scope === "life")).toBe(false);
  });

  it("over-insured coverage (ratio > 1) produces no category gap", () => {
    const a = analyzeInsurance(
      book([policy({ id: "life", kind: "life", coverage: usd("9000000") })], {
        lifeNeed: usd("5000000"),
      }),
    );
    const life = a.categories.find((c) => c.kind === "life")!;
    expect(life.coverageRatio!.greaterThan(new Decimal(1))).toBe(true);
    expect(a.gaps.some((g) => g.scope === "life")).toBe(false);
  });

  it("zero-exposure needs raise no coverage-vs-exposure gaps", () => {
    const a = analyzeInsurance(
      book([], {
        netWorth: usd("0"),
        lifeNeed: usd("0"),
        propertyValue: usd("0"),
        liabilityExposure: usd("0"),
      }),
    );
    // no funded exposure to protect, and net worth zero -> no tower warning.
    expect(a.gaps).toEqual([]);
    expect(a.liabilityCoverageRatio).toBeUndefined();
    a.categories.forEach((c) => expect(c.coverageRatio).toBeUndefined());
  });

  it("premium exactly at the high-premium ratio is NOT flagged (strict >)", () => {
    // 50000 / 1000000 = 0.05 exactly.
    const a = analyzeInsurance(
      book([
        policy({
          id: "p",
          kind: "property",
          coverage: usd("1000000"),
          annualPremium: usd("50000"),
        }),
      ]),
    );
    expect(a.gaps.some((g) => g.id === "gap-policy-p-premium")).toBe(false);
  });

  it("premium just above the high-premium ratio is flagged info", () => {
    const a = analyzeInsurance(
      book([
        policy({
          id: "p",
          kind: "property",
          coverage: usd("1000000"),
          annualPremium: usd("50001"),
        }),
      ]),
    );
    const g = a.gaps.find((x) => x.id === "gap-policy-p-premium");
    expect(g).toBeDefined();
    expect(g!.severity).toBe("info");
  });

  it("a zero-coverage active policy does not divide-by-zero on premium check", () => {
    const a = analyzeInsurance(
      book([
        policy({
          id: "z",
          kind: "umbrella",
          coverage: usd("0"),
          annualPremium: usd("1000"),
        }),
      ]),
    );
    // no premium gap (skipped), and no crash.
    expect(a.gaps.some((g) => g.id === "gap-policy-z-premium")).toBe(false);
  });

  it("multiple inactive policies in one kind each get their own warning", () => {
    const a = analyzeInsurance(
      book([
        policy({ id: "a1", kind: "property", status: "lapsed" }),
        policy({ id: "a2", kind: "property", status: "pending" }),
        policy({ id: "a3", kind: "property", coverage: usd("4000000") }),
      ]),
    );
    expect(a.gaps.some((g) => g.id === "gap-policy-a1-lapsed")).toBe(true);
    expect(a.gaps.some((g) => g.id === "gap-policy-a2-pending")).toBe(true);
    const prop = a.categories.find((c) => c.kind === "property")!;
    expect(prop.inactiveCount).toBe(2);
    expect(prop.activeCount).toBe(1);
  });

  it("is a pure function — repeated calls return identical results", () => {
    const b = book([
      policy({ id: "p1", kind: "life", coverage: usd("3000000") }),
      policy({ id: "p2", kind: "property", status: "lapsed" }),
    ]);
    const first = analyzeInsurance(b);
    const second = analyzeInsurance(b);
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
    // input not mutated.
    expect(b.policies.length).toBe(2);
  });

  it("gaps are deterministically ordered: severity then id, with stable ties", () => {
    const a = analyzeInsurance(
      book(
        [
          policy({ id: "zzz", kind: "property", status: "lapsed" }),
          policy({ id: "aaa", kind: "property", status: "lapsed" }),
        ],
        { propertyValue: usd("0") },
      ),
    );
    const warnIds = a.gaps
      .filter((g) => g.severity === "warning" && g.id.startsWith("gap-policy-"))
      .map((g) => g.id);
    expect(warnIds).toEqual([...warnIds].sort((x, y) => x.localeCompare(y)));
  });

  it("rejects a foreign-currency deductible even when coverage matches", () => {
    const bad = book([
      policy({
        id: "x",
        kind: "property",
        coverage: usd("1000000"),
        annualPremium: usd("1000"),
        deductible: Money.of("5000", "EUR"),
      }),
    ]);
    expect(() => analyzeInsurance(bad)).toThrow(/book currency/);
  });

  it("rejects a foreign-currency exposure input", () => {
    const bad: InsuranceBook = {
      id: "b",
      name: "x",
      currency: "USD",
      policies: [],
      exposure: {
        netWorth: usd("1"),
        lifeNeed: Money.of("1", "GBP"),
        propertyValue: usd("1"),
        liabilityExposure: usd("1"),
      },
    };
    expect(() => analyzeInsurance(bad)).toThrow(/book currency/);
  });
});
