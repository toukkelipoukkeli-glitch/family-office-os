import { Decimal } from "decimal.js";

import type { GrowingSeason, SiteClass, Species } from "./stand";

/**
 * Biological growth model for standing merchantable timber volume.
 *
 * Standing volume per hectare follows a **Chapman-Richards** growth curve, the
 * standard sigmoid used in forest mensuration:
 *
 *   V(age) = A · (1 − e^(−k·age))^p
 *
 * where:
 *   - `A` is the asymptotic (maximum) merchantable volume per hectare a site
 *     can sustain — set by `species` × `siteClass`;
 *   - `k` is the growth rate (how fast the stand approaches `A`) — set by
 *     species;
 *   - `p` is a shape exponent (> 1 gives the slow-start S-curve of a young
 *     stand) — set by species.
 *
 * On top of the deterministic curve, the most-recent seasons' growth is
 * modulated by a **drought coupling**: a positive normalized drought index
 * suppresses that year's increment, a negative one (a wet year) modestly boosts
 * it. The coupling acts on the *increment* between consecutive ages, never on
 * already-standing wood — a drought slows new growth, it doesn't vaporize the
 * existing forest.
 *
 * Everything is exact-decimal where it touches value, and fully deterministic:
 * no randomness, no clock, no network (AGENTS.md). `e^x` uses
 * `Decimal.exp`, so results are reproducible to the configured precision.
 *
 * READ-ONLY: this estimates how much wood is standing; it never proposes a
 * harvest or a sale.
 */

/** Chapman-Richards parameters for one species/site combination. */
export interface GrowthParams {
  /** Asymptotic merchantable volume, m³ per hectare. */
  asymptoteVolume: Decimal;
  /** Growth rate constant k (per year). */
  rate: Decimal;
  /** Shape exponent p (dimensionless, > 1 for an S-curve). */
  shape: Decimal;
}

/**
 * Asymptotic merchantable volume (m³/ha) by species at an `average` site.
 * Softwoods (spruce, pine, fir) carry more merchantable volume than slow
 * hardwoods. Documented modeling assumptions, not site-survey truth.
 */
const SPECIES_ASYMPTOTE: Record<Species, string> = {
  spruce: "520",
  pine: "440",
  fir: "480",
  birch: "300",
  oak: "360",
  beech: "340",
};

/** Chapman-Richards growth rate k (per year) by species. */
const SPECIES_RATE: Record<Species, string> = {
  spruce: "0.035",
  pine: "0.030",
  fir: "0.028",
  birch: "0.045",
  oak: "0.020",
  beech: "0.022",
};

/** Chapman-Richards shape exponent p by species. */
const SPECIES_SHAPE: Record<Species, string> = {
  spruce: "3",
  pine: "3",
  fir: "3.2",
  birch: "2.6",
  oak: "3.5",
  beech: "3.4",
};

/**
 * Site-class multiplier on the asymptotic volume. A richer site sustains a
 * larger maximum standing volume; a poor site caps out lower.
 */
export const SITE_ASYMPTOTE_MULTIPLIER: Record<SiteClass, string> = {
  excellent: "1.3",
  good: "1.15",
  average: "1.0",
  poor: "0.7",
};

/**
 * How strongly a season's drought index bends that year's growth increment.
 * At `drought = +1` (extreme drought) the increment is reduced by
 * `DROUGHT_SENSITIVITY`; at `drought = -1` (very wet) it is boosted by the
 * same fraction. A documented sensitivity, not a calibrated field value.
 */
export const DROUGHT_SENSITIVITY = new Decimal("0.6");

/** Lower clamp on the per-season growth multiplier (never below this). */
const MIN_SEASON_MULTIPLIER = new Decimal("0.2");

/** Resolve the Chapman-Richards parameters for a species/site combination. */
export function growthParams(species: Species, site: SiteClass): GrowthParams {
  const asymptote = new Decimal(SPECIES_ASYMPTOTE[species]).times(
    SITE_ASYMPTOTE_MULTIPLIER[site],
  );
  return {
    asymptoteVolume: asymptote,
    rate: new Decimal(SPECIES_RATE[species]),
    shape: new Decimal(SPECIES_SHAPE[species]),
  };
}

/**
 * Base (undisturbed) Chapman-Richards standing volume per hectare at a given
 * age, before any drought coupling. Returns 0 at age 0 and approaches the
 * asymptote as age grows.
 *
 * @throws if `ageYears` is negative.
 */
export function baseVolumePerHectare(
  ageYears: number,
  params: GrowthParams,
): Decimal {
  if (ageYears < 0) {
    throw new Error("baseVolumePerHectare: ageYears must be >= 0");
  }
  if (ageYears === 0) return new Decimal(0);
  // 1 - e^(-k * age)
  const inner = new Decimal(1).minus(
    params.rate.times(ageYears).negated().exp(),
  );
  // A * inner^p
  return params.asymptoteVolume.times(inner.pow(params.shape));
}

/**
 * Per-season growth multiplier from a normalized drought index. A normal year
 * (`0`) returns 1; drier years (`> 0`) return < 1, wetter years (`< 0`) return
 * > 1. Clamped at {@link MIN_SEASON_MULTIPLIER} so an extreme value can never
 * make an increment non-positive.
 */
export function seasonGrowthMultiplier(droughtIndex: number): Decimal {
  const m = new Decimal(1).minus(DROUGHT_SENSITIVITY.times(droughtIndex));
  return Decimal.max(m, MIN_SEASON_MULTIPLIER);
}

export interface StandingVolumeResult {
  /** Drought-adjusted standing merchantable volume, m³ per hectare. */
  volumePerHectare: Decimal;
  /** The undisturbed base-curve volume per hectare, for comparison. */
  baseVolumePerHectare: Decimal;
  /**
   * Net multiplicative effect of the drought record on the recent increments
   * (1.0 = no net effect, < 1 = drought-suppressed, > 1 = wet-boosted).
   */
  droughtEffect: Decimal;
  /** Number of recent seasons that actually modulated growth. */
  seasonsApplied: number;
}

/**
 * Drought-coupled standing volume per hectare for a stand of `ageYears`.
 *
 * The base curve gives the undisturbed volume. We then re-derive the volume by
 * walking the last `min(ageYears, seasons)` annual increments and scaling each
 * by its season's growth multiplier. Older, pre-record growth is taken at the
 * base curve; only the recent, weather-recorded increments are modulated. This
 * keeps the coupling local to the years we actually have weather for.
 *
 * Seasons are matched to stand-age years by recency: the most recent
 * `standEndYear` aligns to the current age. Seasons whose year is older than
 * the window (or in the future relative to the record) are ignored. Volume can
 * never go below the volume the stand had *before* the recorded window.
 */
export function standingVolumePerHectare(
  ageYears: number,
  params: GrowthParams,
  seasons: GrowingSeason[],
): StandingVolumeResult {
  const base = baseVolumePerHectare(ageYears, params);

  if (ageYears === 0 || seasons.length === 0) {
    return {
      volumePerHectare: base,
      baseVolumePerHectare: base,
      droughtEffect: new Decimal(1),
      seasonsApplied: 0,
    };
  }

  // Sort seasons most-recent first; align the most recent to the current age.
  const sorted = [...seasons].sort((a, b) => b.year - a.year);
  const latestYear = sorted[0].year;

  // The recorded window covers at most the integer years of stand age.
  const wholeAge = Math.floor(ageYears);
  // Volume standing just before the recorded window began (the floor).
  const windowStartAge = Math.max(0, wholeAge - sorted.length);
  const volumeBeforeWindow = baseVolumePerHectare(windowStartAge, params);

  // Walk year-by-year through the recorded window, scaling each base increment
  // by the matching season's multiplier (1.0 where no season is recorded).
  const byYear = new Map<number, number>();
  for (const s of sorted) byYear.set(s.year, s.droughtIndex);

  let volume = volumeBeforeWindow;
  let seasonsApplied = 0;
  for (let i = windowStartAge; i < wholeAge; i++) {
    const ageAtStartOfYear = i;
    const ageAtEndOfYear = i + 1;
    const increment = baseVolumePerHectare(ageAtEndOfYear, params).minus(
      baseVolumePerHectare(ageAtStartOfYear, params),
    );
    // Map this stand-age year to a calendar year: the final year (i = wholeAge-1)
    // is the latest recorded year.
    const calendarYear = latestYear - (wholeAge - 1 - i);
    const drought = byYear.get(calendarYear);
    if (drought === undefined) {
      volume = volume.plus(increment);
    } else {
      volume = volume.plus(increment.times(seasonGrowthMultiplier(drought)));
      seasonsApplied += 1;
    }
  }

  // Add any fractional-age remainder at the base rate (no season modulation).
  if (wholeAge < ageYears) {
    const remainder = base.minus(baseVolumePerHectare(wholeAge, params));
    volume = volume.plus(remainder);
  }

  const droughtEffect = base.isZero() ? new Decimal(1) : volume.div(base);

  return {
    volumePerHectare: volume,
    baseVolumePerHectare: base,
    droughtEffect,
    seasonsApplied,
  };
}
