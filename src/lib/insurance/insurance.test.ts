import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import {
  analyzeInsurance,
  CRITICAL_COVERAGE_RATIO,
  formatRatio,
  POLICY_KINDS,
  seededInsuranceBook,
  WELL_COVERED_RATIO,
  type InsuranceBook,
  type Policy,
} from "./index";

const usd = (a: string) => Money.of(a, "USD");

/** Build a minimal book around a list of policies + exposure overrides. */
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

describe("analyzeInsurance — seeded book", () => {
  const analysis = analyzeInsurance(seededInsuranceBook);

  it("rolls up active coverage and premium across all categories", () => {
    // life 12M + property 10.25M + liability 5M + umbrella 50M = 77.25M.
    expect(analysis.totalActiveCoverage.equals(usd("77250000"))).toBe(true);
    // premiums of active policies only (lapsed jewellery & pending D&O excluded).
    // life 76000 + property 67000 + liability 6000 + umbrella 38000 = 187000.
    expect(analysis.totalAnnualPremium.equals(usd("187000"))).toBe(true);
    // 9 policies, of which the lapsed jewellery + pending D&O are inactive.
    expect(analysis.activePolicyCount).toBe(7);
  });

  it("returns one summary per kind, in canonical order", () => {
    expect(analysis.categories.map((c) => c.kind)).toEqual([...POLICY_KINDS]);
  });

  it("measures life coverage at 80% of the life need", () => {
    const life = analysis.categories.find((c) => c.kind === "life")!;
    expect(life.activeCoverage.equals(usd("12000000"))).toBe(true);
    expect(life.coverageRatio!.equals(new Decimal("0.8"))).toBe(true);
  });

  it("measures property coverage below the critical threshold", () => {
    const prop = analysis.categories.find((c) => c.kind === "property")!;
    // 10.25M of 22M = 0.4659...
    expect(prop.activeCoverage.equals(usd("10250000"))).toBe(true);
    expect(prop.coverageRatio!.lessThan(CRITICAL_COVERAGE_RATIO)).toBe(true);
    expect(prop.inactiveCount).toBe(1); // the lapsed jewellery floater
  });

  it("excludes pending liability cover from the active liability tower", () => {
    const liab = analysis.categories.find((c) => c.kind === "liability")!;
    // pending D&O (3M) is excluded; only the 5M personal liability counts.
    expect(liab.activeCoverage.equals(usd("5000000"))).toBe(true);
    expect(liab.activeCount).toBe(1);
  });

  it("combines liability + umbrella into a tower that exceeds net worth", () => {
    // 5M + 50M = 55M vs 52.5M net worth.
    expect(analysis.liabilityTowerCoverage.equals(usd("55000000"))).toBe(true);
    expect(analysis.liabilityCoverageRatio!.greaterThan(new Decimal(1))).toBe(
      true,
    );
  });

  it("umbrella has no own exposure base (no coverage ratio)", () => {
    const umb = analysis.categories.find((c) => c.kind === "umbrella")!;
    expect(umb.exposure.isZero()).toBe(true);
    expect(umb.coverageRatio).toBeUndefined();
  });

  it("flags the property category as a critical gap", () => {
    const critical = analysis.gaps.filter((g) => g.severity === "critical");
    expect(critical.map((g) => g.scope)).toContain("property");
    expect(analysis.hasCriticalGap).toBe(true);
    const propGap = critical.find((g) => g.scope === "property")!;
    expect(propGap.shortfall!.equals(usd("11750000"))).toBe(true); // 22M - 10.25M
  });

  it("flags the life category as a below-target warning", () => {
    const lifeGap = analysis.gaps.find(
      (g) => g.scope === "life" && g.severity === "warning",
    );
    expect(lifeGap).toBeDefined();
    expect(lifeGap!.shortfall!.equals(usd("3000000"))).toBe(true); // 15M - 12M
  });

  it("flags the lapsed and pending policies as warnings", () => {
    const ids = analysis.gaps.map((g) => g.id);
    expect(ids).toContain("gap-policy-pc-jewellery-floater-lapsed");
    expect(ids).toContain("gap-policy-liab-doffi-pending-pending");
  });

  it("flags the expensive fine-art rider premium as info", () => {
    const info = analysis.gaps.find(
      (g) => g.id === "gap-policy-pc-fine-art-rider-premium",
    );
    expect(info).toBeDefined();
    expect(info!.severity).toBe("info");
  });

  it("does NOT flag the liability tower (it exceeds net worth)", () => {
    expect(
      analysis.gaps.some((g) => g.id === "gap-book-liability-tower"),
    ).toBe(false);
  });

  it("sorts gaps worst-severity first", () => {
    const order = { critical: 0, warning: 1, info: 2 } as const;
    const seq = analysis.gaps.map((g) => order[g.severity]);
    const sorted = [...seq].sort((a, b) => a - b);
    expect(seq).toEqual(sorted);
  });
});

describe("analyzeInsurance — gap rules", () => {
  it("flags an entirely-uninsured exposure as critical", () => {
    const a = analyzeInsurance(
      book([policy({ id: "u", kind: "umbrella", coverage: usd("1000000") })], {
        lifeNeed: usd("5000000"),
      }),
    );
    const gap = a.gaps.find((g) => g.id === "gap-life-uncovered");
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe("critical");
    expect(gap!.shortfall!.equals(usd("5000000"))).toBe(true);
  });

  it("treats coverage at or above the well-covered ratio as no gap", () => {
    const a = analyzeInsurance(
      book(
        [
          policy({
            id: "life-ok",
            kind: "life",
            coverage: usd("4500000"),
          }),
        ],
        { lifeNeed: usd("5000000") }, // 90% exactly
      ),
    );
    expect(a.gaps.some((g) => g.scope === "life")).toBe(false);
  });

  it("warns when the liability tower is below net worth", () => {
    const a = analyzeInsurance(
      book(
        [
          policy({
            id: "liab",
            kind: "liability",
            coverage: usd("1000000"),
          }),
        ],
        { netWorth: usd("10000000"), liabilityExposure: usd("1000000") },
      ),
    );
    const towerGap = a.gaps.find((g) => g.id === "gap-book-liability-tower");
    expect(towerGap).toBeDefined();
    expect(towerGap!.severity).toBe("warning");
    expect(towerGap!.shortfall!.equals(usd("9000000"))).toBe(true);
  });

  it("never counts non-active cover toward protection", () => {
    const a = analyzeInsurance(
      book(
        [
          policy({
            id: "lapsed-life",
            kind: "life",
            status: "lapsed",
            coverage: usd("5000000"),
          }),
        ],
        { lifeNeed: usd("5000000") },
      ),
    );
    const life = a.categories.find((c) => c.kind === "life")!;
    expect(life.activeCoverage.isZero()).toBe(true);
    // lapsed cover does not protect the exposure -> uncovered critical gap.
    expect(a.gaps.some((g) => g.id === "gap-life-uncovered")).toBe(true);
  });

  it("rejects amounts in a foreign currency", () => {
    const bad = book([
      policy({ id: "x", kind: "life", coverage: Money.of("1", "EUR") }),
    ]);
    expect(() => analyzeInsurance(bad)).toThrow(/book currency/);
  });
});

describe("formatRatio", () => {
  it("formats a ratio as a rounded percentage", () => {
    expect(formatRatio(new Decimal("0.8"))).toBe("80%");
    expect(formatRatio(new Decimal("0.4659"))).toBe("47%");
    expect(formatRatio(WELL_COVERED_RATIO)).toBe("90%");
  });
});
