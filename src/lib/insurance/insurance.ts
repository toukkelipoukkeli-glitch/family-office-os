import { Decimal } from "decimal.js";

import { Money, sumMoney } from "@/lib/money";

/**
 * m10-insurance — Insurance coverage tracker.
 *
 * A read-only model that tracks a family's insurance policies (life, property &
 * casualty, liability, umbrella) and derives, deterministically and offline:
 *
 *   - per-category coverage totals and annual premium;
 *   - coverage measured against the household's **net-worth exposure** (the
 *     value at risk that each category is meant to protect);
 *   - **coverage-gap flags** that surface where protection is thin, missing,
 *     lapsed, or where premiums look out of line.
 *
 * Everything is pure, Decimal-backed and driven by fixtures — this product
 * never buys, binds, cancels or pays for a policy; it only reports on them.
 */

/** The kinds of cover a family-office insurance book tracks. */
export type PolicyKind = "life" | "property" | "liability" | "umbrella";

/** Stable display order for the policy kinds. */
export const POLICY_KINDS: readonly PolicyKind[] = [
  "life",
  "property",
  "liability",
  "umbrella",
] as const;

/** Human labels for each policy kind. */
export const POLICY_KIND_LABELS: Record<PolicyKind, string> = {
  life: "Life",
  property: "Property & casualty",
  liability: "Liability",
  umbrella: "Umbrella",
};

/** Lifecycle status of a policy. Only `active` cover counts toward protection. */
export type PolicyStatus = "active" | "lapsed" | "pending";

/** A single insurance policy held by the household. */
export interface Policy {
  /** Stable identifier. */
  id: string;
  /** Display name, e.g. "Term life — Touko". */
  name: string;
  /** Carrier / insurer. */
  carrier: string;
  /** The kind of cover. */
  kind: PolicyKind;
  /** Lifecycle status; only `active` policies provide protection. */
  status: PolicyStatus;
  /** Coverage limit (the sum insured / death benefit / aggregate limit). */
  coverage: Money;
  /** Annual premium. */
  annualPremium: Money;
  /** Per-claim deductible / retention, where applicable. */
  deductible?: Money;
  /** Renewal date label, `YYYY-MM-DD`, for display only. */
  renewalDate?: string;
  /** Free-text note (e.g. what asset / person the policy protects). */
  note?: string;
}

/**
 * The household's value-at-risk per protection need, in the book currency.
 *
 * These are the exposures the insurance book exists to protect, expressed
 * against net worth: the income/estate value a life policy backstops, the
 * insurable property value, and the total net worth a liability judgment could
 * reach. They are deterministic fixture inputs, not derived from a live feed.
 */
export interface ExposureProfile {
  /** Net worth of the household (the pool a liability claim can reach). */
  netWorth: Money;
  /** Economic value a life policy is meant to replace (income + estate need). */
  lifeNeed: Money;
  /** Insurable replacement value of real property & contents. */
  propertyValue: Money;
  /** Liability exposure floor (e.g. net worth at risk to a lawsuit). */
  liabilityExposure: Money;
}

/** A full insurance book: the policies plus the exposures they protect. */
export interface InsuranceBook {
  id: string;
  name: string;
  currency: string;
  policies: Policy[];
  exposure: ExposureProfile;
}

/** Severity of a coverage-gap flag, worst first. */
export type GapSeverity = "critical" | "warning" | "info";

/** A single coverage-gap finding. */
export interface CoverageGap {
  /** Stable identifier for the finding (test/UI key). */
  id: string;
  /** Which category the finding concerns, or `book` for book-wide findings. */
  scope: PolicyKind | "book";
  severity: GapSeverity;
  /** Short human-readable title. */
  title: string;
  /** One-line detail explaining the gap. */
  detail: string;
  /** Shortfall amount, when the gap is a quantified coverage shortfall. */
  shortfall?: Money;
}

/** Rolled-up figures for one policy category. */
export interface CategorySummary {
  kind: PolicyKind;
  label: string;
  /** Total active coverage in this category. */
  activeCoverage: Money;
  /** Total annual premium across active policies in this category. */
  annualPremium: Money;
  /** Number of active policies in the category. */
  activeCount: number;
  /** Number of non-active (lapsed/pending) policies in the category. */
  inactiveCount: number;
  /** Exposure this category is measured against (0 when not applicable). */
  exposure: Money;
  /**
   * Coverage as a fraction of the exposure, in [0, ∞). `undefined` when there
   * is no exposure to measure against (e.g. umbrella, which has no own base).
   */
  coverageRatio?: Decimal;
}

/** The complete derived analysis of an insurance book. */
export interface InsuranceAnalysis {
  currency: string;
  /** Per-category roll-ups, in {@link POLICY_KINDS} order. */
  categories: CategorySummary[];
  /** Total active coverage across every category. */
  totalActiveCoverage: Money;
  /** Total annual premium across every active policy. */
  totalAnnualPremium: Money;
  /** Total number of active policies. */
  activePolicyCount: number;
  /**
   * Liability + umbrella coverage combined, measured against net worth — the
   * "can a judgment wipe us out?" headline ratio. `undefined` only when net
   * worth is zero.
   */
  liabilityCoverageRatio?: Decimal;
  /** Combined liability + umbrella active coverage. */
  liabilityTowerCoverage: Money;
  /** Coverage-gap findings, sorted worst-severity first. */
  gaps: CoverageGap[];
  /** True when there is at least one `critical` gap. */
  hasCriticalGap: boolean;
}

/** A category is "well covered" at or above this fraction of its exposure. */
export const WELL_COVERED_RATIO = new Decimal("0.9");
/** Below this fraction of exposure a category is flagged `critical`. */
export const CRITICAL_COVERAGE_RATIO = new Decimal("0.5");
/**
 * Premiums above this fraction of coverage look unusually expensive for the
 * cover bought and earn an `info` flag (e.g. > 5% of the sum insured per year).
 */
export const HIGH_PREMIUM_RATIO = new Decimal("0.05");

function assertCurrency(book: InsuranceBook): void {
  const all: Money[] = [
    book.exposure.netWorth,
    book.exposure.lifeNeed,
    book.exposure.propertyValue,
    book.exposure.liabilityExposure,
    ...book.policies.flatMap((p) =>
      p.deductible ? [p.coverage, p.annualPremium, p.deductible] : [p.coverage, p.annualPremium],
    ),
  ];
  for (const m of all) {
    if (m.currency !== book.currency) {
      throw new Error(
        `insurance: every amount must be in the book currency ${book.currency}; got ${m.currency}`,
      );
    }
  }
}

/** The exposure a given category is measured against. */
function exposureFor(kind: PolicyKind, exposure: ExposureProfile): Money {
  switch (kind) {
    case "life":
      return exposure.lifeNeed;
    case "property":
      return exposure.propertyValue;
    case "liability":
      return exposure.liabilityExposure;
    case "umbrella":
      // Umbrella sits on top of the primary towers; it has no base exposure of
      // its own and is judged as part of the liability tower instead.
      return Money.zero(exposure.netWorth.currency);
  }
}

/** Coverage ratio = coverage / exposure, or `undefined` when exposure is zero. */
function ratio(coverage: Money, exposure: Money): Decimal | undefined {
  if (exposure.isZero()) return undefined;
  return coverage.amount.div(exposure.amount);
}

/**
 * Summarize one category: total active coverage & premium, counts, and the
 * coverage ratio against the category's exposure.
 */
function summarizeCategory(
  kind: PolicyKind,
  policies: Policy[],
  exposure: ExposureProfile,
  currency: string,
): CategorySummary {
  const inKind = policies.filter((p) => p.kind === kind);
  const active = inKind.filter((p) => p.status === "active");
  const activeCoverage = sumMoney(
    active.map((p) => p.coverage),
    currency,
  );
  const annualPremium = sumMoney(
    active.map((p) => p.annualPremium),
    currency,
  );
  const exp = exposureFor(kind, exposure);
  return {
    kind,
    label: POLICY_KIND_LABELS[kind],
    activeCoverage,
    annualPremium,
    activeCount: active.length,
    inactiveCount: inKind.length - active.length,
    exposure: exp,
    coverageRatio: ratio(activeCoverage, exp),
  };
}

const SEVERITY_ORDER: Record<GapSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Derive the coverage-gap flags for a book from its category summaries.
 *
 * The rules are deterministic and ordered worst-first:
 *  - a protection need with **no active cover at all** → `critical`;
 *  - cover below {@link CRITICAL_COVERAGE_RATIO} of its exposure → `critical`;
 *  - cover below {@link WELL_COVERED_RATIO} of its exposure → `warning`;
 *  - any `lapsed`/`pending` policy → `warning`;
 *  - the liability tower below net worth → `warning`;
 *  - a premium above {@link HIGH_PREMIUM_RATIO} of its coverage → `info`.
 */
function deriveGaps(
  book: InsuranceBook,
  categories: CategorySummary[],
  liabilityTowerCoverage: Money,
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const fmt = (m: Money) => m.format({ fractionDigits: 0 });

  for (const cat of categories) {
    // Umbrella has no own exposure base — skip the coverage-vs-exposure rules.
    if (cat.kind !== "umbrella" && !cat.exposure.isZero()) {
      if (cat.activeCoverage.isZero()) {
        gaps.push({
          id: `gap-${cat.kind}-uncovered`,
          scope: cat.kind,
          severity: "critical",
          title: `No active ${cat.label.toLowerCase()} cover`,
          detail: `${fmt(cat.exposure)} of ${cat.label.toLowerCase()} exposure is entirely uninsured.`,
          shortfall: cat.exposure,
        });
      } else {
        const r = cat.coverageRatio;
        if (r && r.lessThan(CRITICAL_COVERAGE_RATIO)) {
          gaps.push({
            id: `gap-${cat.kind}-critical`,
            scope: cat.kind,
            severity: "critical",
            title: `${cat.label} cover critically low`,
            detail: `Only ${formatRatio(r)} of ${fmt(cat.exposure)} exposure is insured.`,
            shortfall: cat.exposure.minus(cat.activeCoverage),
          });
        } else if (r && r.lessThan(WELL_COVERED_RATIO)) {
          gaps.push({
            id: `gap-${cat.kind}-thin`,
            scope: cat.kind,
            severity: "warning",
            title: `${cat.label} cover below target`,
            detail: `${formatRatio(r)} of ${fmt(cat.exposure)} exposure insured; target is ${formatRatio(WELL_COVERED_RATIO)}.`,
            shortfall: cat.exposure.minus(cat.activeCoverage),
          });
        }
      }
    }
  }

  // Lapsed / pending policies: one warning per affected policy.
  for (const p of book.policies) {
    if (p.status === "active") continue;
    gaps.push({
      id: `gap-policy-${p.id}-${p.status}`,
      scope: p.kind,
      severity: "warning",
      title: `${p.name} is ${p.status}`,
      detail: `${fmt(p.coverage)} of ${POLICY_KIND_LABELS[p.kind].toLowerCase()} cover is ${p.status} (${p.carrier}).`,
    });
  }

  // Liability tower (liability + umbrella) vs net worth.
  const nw = book.exposure.netWorth;
  if (!nw.isZero() && liabilityTowerCoverage.lessThan(nw)) {
    gaps.push({
      id: "gap-book-liability-tower",
      scope: "book",
      severity: "warning",
      title: "Liability tower below net worth",
      detail: `${fmt(liabilityTowerCoverage)} of liability + umbrella cover vs ${fmt(nw)} net worth at risk.`,
      shortfall: nw.minus(liabilityTowerCoverage),
    });
  }

  // Expensive premiums relative to cover bought.
  for (const p of book.policies) {
    if (p.status !== "active" || p.coverage.isZero()) continue;
    const premiumRatio = p.annualPremium.amount.div(p.coverage.amount);
    if (premiumRatio.greaterThan(HIGH_PREMIUM_RATIO)) {
      gaps.push({
        id: `gap-policy-${p.id}-premium`,
        scope: p.kind,
        severity: "info",
        title: `${p.name} premium looks high`,
        detail: `Annual premium is ${formatRatio(premiumRatio)} of the ${fmt(p.coverage)} sum insured.`,
      });
    }
  }

  gaps.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return a.id.localeCompare(b.id);
  });
  return gaps;
}

/** Format a ratio as a rounded percentage, e.g. `0.42` → `42%`. */
export function formatRatio(r: Decimal): string {
  return `${r.times(100).toDecimalPlaces(0).toFixed()}%`;
}

/**
 * Analyze an insurance book: roll up coverage and premium by category, measure
 * each category against its net-worth exposure, and derive the coverage-gap
 * flags. Pure and deterministic.
 */
export function analyzeInsurance(book: InsuranceBook): InsuranceAnalysis {
  assertCurrency(book);
  const { currency } = book;

  const categories = POLICY_KINDS.map((kind) =>
    summarizeCategory(kind, book.policies, book.exposure, currency),
  );

  const totalActiveCoverage = sumMoney(
    categories.map((c) => c.activeCoverage),
    currency,
  );
  const totalAnnualPremium = sumMoney(
    categories.map((c) => c.annualPremium),
    currency,
  );
  const activePolicyCount = categories.reduce((n, c) => n + c.activeCount, 0);

  const liabilityCat = categories.find((c) => c.kind === "liability");
  const umbrellaCat = categories.find((c) => c.kind === "umbrella");
  const liabilityTowerCoverage = sumMoney(
    [
      liabilityCat?.activeCoverage ?? Money.zero(currency),
      umbrellaCat?.activeCoverage ?? Money.zero(currency),
    ],
    currency,
  );
  const liabilityCoverageRatio = ratio(
    liabilityTowerCoverage,
    book.exposure.netWorth,
  );

  const gaps = deriveGaps(book, categories, liabilityTowerCoverage);

  return {
    currency,
    categories,
    totalActiveCoverage,
    totalAnnualPremium,
    activePolicyCount,
    liabilityCoverageRatio,
    liabilityTowerCoverage,
    gaps,
    hasCriticalGap: gaps.some((g) => g.severity === "critical"),
  };
}
