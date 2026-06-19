import { Decimal } from "decimal.js";

import {
  type ConditionGrade,
  type Provenance,
  type StorageHistory,
} from "./wine";

/**
 * Provenance scoring for fine wine.
 *
 * The market price index (`index-series.ts`) estimates the value of a wine in
 * *reference* condition: a sound bottle with ordinary provenance. A specific
 * lot trades at a premium or discount to that reference depending on its
 * condition, storage history, and documentation. This module turns a
 * {@link Provenance} record into:
 *
 *  - a multiplicative {@link provenanceFactor} applied to the index price, and
 *  - a {@link provenanceUncertainty} in [0, 1] that *widens* the valuation
 *    confidence band when provenance is weak or undocumented.
 *
 * Reference provenance (`good` condition, `private-cellar` storage, no OWC, not
 * bought on release, undocumented) has factor exactly 1.0.
 *
 * READ-ONLY: this scores a holding's quality; it never changes the holding.
 */

/**
 * Multiplicative premium/discount for each condition grade, relative to a
 * `good` bottle (= 1.0). Pristine/excellent bottles fetch a premium; fair/poor
 * bottles a discount.
 */
const CONDITION_FACTOR: Record<ConditionGrade, number> = {
  pristine: 1.08,
  excellent: 1.04,
  good: 1.0,
  fair: 0.85,
  poor: 0.6,
};

/**
 * Multiplicative premium/discount for storage history, relative to a
 * `private-cellar` bottle (= 1.0). In-bond / professional storage is worth a
 * premium; unknown storage a discount.
 */
const STORAGE_FACTOR: Record<StorageHistory, number> = {
  "in-bond": 1.05,
  professional: 1.02,
  "private-cellar": 1.0,
  unknown: 0.9,
};

/** Additive (compounding) premia for discrete provenance signals. */
const OWC_PREMIUM = 1.03; // original wooden case
const ON_RELEASE_PREMIUM = 1.02; // bought ex-château / on release
const DOCUMENTED_PREMIUM = 1.02; // fully documented ownership chain

/**
 * Uncertainty contribution (added in quadrature) of each weak-provenance
 * signal. Each is a fraction of price; they combine into
 * {@link provenanceUncertainty}.
 */
const CONDITION_UNCERTAINTY: Record<ConditionGrade, number> = {
  pristine: 0.01,
  excellent: 0.02,
  good: 0.04,
  fair: 0.1,
  poor: 0.2,
};
const STORAGE_UNCERTAINTY: Record<StorageHistory, number> = {
  "in-bond": 0.01,
  professional: 0.02,
  "private-cellar": 0.04,
  unknown: 0.12,
};
/** Extra uncertainty when the ownership chain is undocumented. */
const UNDOCUMENTED_UNCERTAINTY = 0.06;

/**
 * The multiplicative provenance factor applied to a reference index price to
 * value a specific lot. A factor > 1 means the lot is worth more than the
 * reference; < 1 means less.
 *
 * The factor is the product of the condition factor, storage factor, and any
 * discrete premia (OWC, on-release, documented). Reference provenance yields
 * exactly 1.0.
 */
export function provenanceFactor(p: Provenance): Decimal {
  let factor = new Decimal(CONDITION_FACTOR[p.condition]).times(
    STORAGE_FACTOR[p.storage],
  );
  if (p.originalWoodenCase) factor = factor.times(OWC_PREMIUM);
  if (p.purchasedOnRelease) factor = factor.times(ON_RELEASE_PREMIUM);
  if (p.documented) factor = factor.times(DOCUMENTED_PREMIUM);
  return factor;
}

/**
 * A provenance uncertainty in [0, 1], expressed as a fractional standard
 * deviation of the lot's value attributable to provenance ambiguity. Combined
 * in quadrature (root-sum-of-squares) from the condition, storage, and
 * documentation signals.
 *
 * Good documentation (OWC, on-release, documented) *reduces* uncertainty; weak
 * condition/storage *increases* it.
 */
export function provenanceUncertainty(p: Provenance): Decimal {
  const parts: number[] = [
    CONDITION_UNCERTAINTY[p.condition],
    STORAGE_UNCERTAINTY[p.storage],
  ];
  if (!p.documented) parts.push(UNDOCUMENTED_UNCERTAINTY);

  let sumSq = parts.reduce((acc, x) => acc + x * x, 0);

  // Strong documentation tightens the band multiplicatively.
  let damp = 1;
  if (p.originalWoodenCase) damp *= 0.9;
  if (p.purchasedOnRelease) damp *= 0.92;
  if (p.documented) damp *= 0.9;
  sumSq *= damp * damp;

  const sd = Math.sqrt(sumSq);
  return new Decimal(Math.min(1, sd));
}
