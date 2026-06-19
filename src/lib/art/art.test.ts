import { describe, expect, it } from "vitest";

import {
  appraise,
  DEFAULT_RECENCY_HALF_LIFE_YEARS,
  weighComparables,
} from "./appraisal";
import { Artwork, Comparable } from "./artwork";
import {
  artworkDrawing,
  artworkRothko,
  drawingComps,
  thinComps,
  tightComps,
} from "./fixtures";

describe("Artwork schema", () => {
  it("parses a full artwork and applies condition/provenance defaults", () => {
    const a = Artwork.parse({
      id: "a1",
      title: "  Sunrise  ",
      artist: "  Claude Monet ",
      medium: "painting",
      currency: "eur",
    });
    expect(a.title).toBe("Sunrise");
    expect(a.artist).toBe("Claude Monet");
    expect(a.currency).toBe("EUR");
    // Bare records are treated as pristine, not silently penalised.
    expect(a.condition).toBe("excellent");
    expect(a.provenance).toBe("documented");
  });

  it("rejects empty title/artist and bad currency", () => {
    expect(
      Artwork.safeParse({
        id: "a",
        title: "  ",
        artist: "x",
        medium: "painting",
        currency: "USD",
      }).success,
    ).toBe(false);
    expect(
      Artwork.safeParse({
        id: "a",
        title: "t",
        artist: "x",
        medium: "painting",
        currency: "US",
      }).success,
    ).toBe(false);
  });

  it("rejects non-positive dimensions and unknown enum values", () => {
    expect(
      Artwork.safeParse({
        id: "a",
        title: "t",
        artist: "x",
        medium: "painting",
        currency: "USD",
        dimensions: { heightCm: 0, widthCm: 10 },
      }).success,
    ).toBe(false);
    expect(
      Artwork.safeParse({
        id: "a",
        title: "t",
        artist: "x",
        medium: "hologram",
        currency: "USD",
      }).success,
    ).toBe(false);
  });
});

describe("Comparable schema", () => {
  it("defaults similarity to 1 and rejects out-of-range similarity", () => {
    const c = Comparable.parse({
      id: "c1",
      price: "1000",
      currency: "USD",
      soldOn: "2024-01-01",
    });
    expect(c.similarity).toBe(1);
    expect(
      Comparable.safeParse({
        id: "c2",
        price: "1000",
        currency: "USD",
        soldOn: "2024-01-01",
        similarity: 1.5,
      }).success,
    ).toBe(false);
  });

  it("rejects negative price and malformed date", () => {
    expect(
      Comparable.safeParse({
        id: "c",
        price: "-5",
        currency: "USD",
        soldOn: "2024-01-01",
      }).success,
    ).toBe(false);
    expect(
      Comparable.safeParse({
        id: "c",
        price: "5",
        currency: "USD",
        soldOn: "2024-13-40",
      }).success,
    ).toBe(false);
  });
});

describe("weighComparables", () => {
  const asOf = Date.UTC(2024, 0, 1);

  it("decays weight with age by the half-life", () => {
    const comps = [
      Comparable.parse({
        id: "now",
        price: "100",
        currency: "USD",
        soldOn: "2024-01-01",
      }),
      Comparable.parse({
        id: "halfLifeAgo",
        price: "100",
        currency: "USD",
        soldOn: "2022-01-01", // ~2 years => one half-life at default
      }),
    ];
    const [now, old] = weighComparables(comps, asOf, 2);
    expect(now.weight).toBeCloseTo(1, 5);
    // One half-life ago => roughly half the weight.
    expect(old.weight).toBeCloseTo(0.5, 1);
    expect(old.weight).toBeLessThan(now.weight);
  });

  it("scales weight by similarity", () => {
    const comps = [
      Comparable.parse({
        id: "half-sim",
        price: "100",
        currency: "USD",
        soldOn: "2024-01-01",
        similarity: 0.5,
      }),
    ];
    const [w] = weighComparables(comps, asOf, 2);
    expect(w.weight).toBeCloseTo(0.5, 6);
  });

  it("clamps future-dated comps to zero age (never up-weighted)", () => {
    const comps = [
      Comparable.parse({
        id: "future",
        price: "100",
        currency: "USD",
        soldOn: "2030-01-01",
      }),
    ];
    const [w] = weighComparables(comps, asOf, 2);
    expect(w.ageYears).toBe(0);
    expect(w.weight).toBeCloseTo(1, 6);
  });

  it("throws on non-positive half-life", () => {
    expect(() => weighComparables([], asOf, 0)).toThrow(/positive/);
    expect(() => weighComparables([], asOf, -1)).toThrow(/positive/);
  });
});

describe("appraise — core behaviour", () => {
  it("produces a centred band: low < estimate < high", () => {
    const r = appraise(artworkRothko, tightComps);
    expect(r.low.lessThan(r.estimate)).toBe(true);
    expect(r.estimate.lessThan(r.high)).toBe(true);
    expect(r.estimate.isPositive()).toBe(true);
    expect(r.compCount).toBe(tightComps.length);
    expect(r.confidence).toBe(0.8);
  });

  it("estimate of identical comps equals the comp price (geometric mean)", () => {
    const art = Artwork.parse({
      id: "a",
      title: "t",
      artist: "x",
      medium: "painting",
      condition: "mint",
      provenance: "documented",
      currency: "USD",
    });
    const comps = [10000, 10000, 10000].map((p, i) =>
      Comparable.parse({
        id: `c${i}`,
        price: String(p),
        currency: "USD",
        soldOn: "2024-01-01",
      }),
    );
    const r = appraise(art, comps);
    // All comps identical => zero dispersion in the geometric mean; mint +
    // documented => no central adjustment.
    expect(r.estimate.amount.toNumber()).toBeCloseTo(10000, 2);
  });

  it("currency of the band matches the artwork", () => {
    const r = appraise(artworkDrawing, drawingComps);
    expect(r.estimate.currency).toBe("EUR");
    expect(r.low.currency).toBe("EUR");
    expect(r.high.currency).toBe("EUR");
  });
});

describe("appraise — honest uncertainty", () => {
  it("thin/dispersed/stale comps give a wider band than tight comps", () => {
    const tight = appraise(artworkRothko, tightComps, { asOf: "2025-01-08" });
    const thin = appraise(artworkRothko, thinComps, { asOf: "2025-01-08" });
    expect(thin.relativeWidth).toBeGreaterThan(tight.relativeWidth);
    expect(tight.lowConfidence).toBe(false);
    expect(thin.lowConfidence).toBe(true);
  });

  it("flags low confidence when there are too few effective comps", () => {
    const single = [
      Comparable.parse({
        id: "only",
        price: "1000000",
        currency: "USD",
        soldOn: "2025-01-01",
      }),
    ];
    const r = appraise(artworkRothko, single);
    // A single comp can never be high-confidence, even if "on the nose".
    expect(r.lowConfidence).toBe(true);
  });

  it("higher requested confidence => wider band, same centre", () => {
    const c80 = appraise(artworkRothko, tightComps, { confidence: 0.8 });
    const c95 = appraise(artworkRothko, tightComps, { confidence: 0.95 });
    // Same point estimate regardless of confidence level.
    expect(c95.estimate.amount.toNumber()).toBeCloseTo(
      c80.estimate.amount.toNumber(),
      2,
    );
    // Wider interval at higher confidence.
    expect(c95.high.greaterThan(c80.high)).toBe(true);
    expect(c95.low.lessThan(c80.low)).toBe(true);
    expect(c95.relativeWidth).toBeGreaterThan(c80.relativeWidth);
  });

  it("staleness widens the band (older comps, same dispersion)", () => {
    const art = Artwork.parse({
      id: "a",
      title: "t",
      artist: "x",
      medium: "painting",
      currency: "USD",
    });
    const fresh = [
      ["2025-01-01", "100"],
      ["2025-01-01", "120"],
      ["2025-01-01", "90"],
      ["2025-01-01", "110"],
    ].map(([d, p], i) =>
      Comparable.parse({ id: `f${i}`, price: p, currency: "USD", soldOn: d }),
    );
    const stale = [
      ["2010-01-01", "100"],
      ["2010-01-01", "120"],
      ["2010-01-01", "90"],
      ["2010-01-01", "110"],
    ].map(([d, p], i) =>
      Comparable.parse({ id: `s${i}`, price: p, currency: "USD", soldOn: d }),
    );
    const asOf = "2025-06-01";
    const rFresh = appraise(art, fresh, { asOf });
    const rStale = appraise(art, stale, { asOf });
    expect(rStale.relativeWidth).toBeGreaterThan(rFresh.relativeWidth);
  });
});

describe("appraise — condition & provenance adjustments", () => {
  const baseComps = [10000, 10000, 10000, 10000].map((p, i) =>
    Comparable.parse({
      id: `c${i}`,
      price: String(p),
      currency: "USD",
      soldOn: "2025-01-01",
    }),
  );

  function art(
    condition: Artwork["condition"],
    provenance: Artwork["provenance"],
  ): Artwork {
    return Artwork.parse({
      id: "a",
      title: "t",
      artist: "x",
      medium: "painting",
      condition,
      provenance,
      currency: "USD",
    });
  }

  it("poorer condition discounts the estimate", () => {
    const mint = appraise(art("mint", "documented"), baseComps);
    const poor = appraise(art("poor", "documented"), baseComps);
    expect(poor.estimate.lessThan(mint.estimate)).toBe(true);
  });

  it("weaker provenance discounts the estimate", () => {
    const documented = appraise(art("mint", "documented"), baseComps);
    const disputed = appraise(art("mint", "disputed"), baseComps);
    expect(disputed.estimate.lessThan(documented.estimate)).toBe(true);
    // Disputed attribution => big discount.
    expect(disputed.estimate.amount.toNumber()).toBeLessThan(
      documented.estimate.amount.toNumber() * 0.5,
    );
  });

  it("impairment widens the band even with identical comps", () => {
    // Identical comps => zero comp dispersion; any band width for the impaired
    // work must come from the impairment uncertainty budget.
    const pristine = appraise(art("mint", "documented"), baseComps);
    const impaired = appraise(art("poor", "disputed"), baseComps);
    expect(pristine.relativeWidth).toBeLessThan(impaired.relativeWidth);
    expect(impaired.lowConfidence).toBe(true);
  });
});

describe("appraise — determinism & errors", () => {
  it("is deterministic and clock-independent (defaults asOf to latest comp)", () => {
    const a = appraise(artworkRothko, tightComps);
    const b = appraise(artworkRothko, tightComps);
    expect(a.estimate.equals(b.estimate)).toBe(true);
    expect(a.low.equals(b.low)).toBe(true);
    expect(a.high.equals(b.high)).toBe(true);
  });

  it("throws with no comparables", () => {
    expect(() => appraise(artworkRothko, [])).toThrow(/at least one/);
  });

  it("throws on currency mismatch between artwork and comp", () => {
    const badComp = Comparable.parse({
      id: "x",
      price: "1000",
      currency: "EUR",
      soldOn: "2025-01-01",
    });
    expect(() => appraise(artworkRothko, [badComp])).toThrow(/currency/);
  });

  it("throws when every comp has zero weight", () => {
    const zeroSim = Comparable.parse({
      id: "z",
      price: "1000",
      currency: "USD",
      soldOn: "2025-01-01",
      similarity: 0,
    });
    expect(() => appraise(artworkRothko, [zeroSim])).toThrow(/zero weight/);
  });

  it("rejects an unsupported confidence level", () => {
    expect(() =>
      appraise(artworkRothko, tightComps, { confidence: 0.123 }),
    ).toThrow(/Unsupported confidence/);
  });

  it("throws on a zero-priced comparable (cannot take log)", () => {
    // "0" is a valid NonNegativeDecimalString, so the appraisal math must
    // guard against log(0) rather than emit NaN/-Infinity.
    const zeroPrice = Comparable.parse({
      id: "zero",
      price: "0",
      currency: "USD",
      soldOn: "2025-01-01",
    });
    expect(() => appraise(artworkRothko, [zeroPrice])).toThrow(
      /non-positive price/,
    );
  });

  it("propagates the recencyHalfLifeYears option into the appraisal", () => {
    // The half-life option must actually flow through to the weighting (a
    // regression guard against it being silently dropped). With comps sold at
    // different dates, changing the half-life re-weights them and shifts the
    // band width away from the default.
    const dflt = appraise(artworkRothko, tightComps, { asOf: "2025-01-08" });
    const shortHalfLife = appraise(artworkRothko, tightComps, {
      asOf: "2025-01-08",
      recencyHalfLifeYears: 0.25,
    });
    expect(shortHalfLife.relativeWidth).not.toBeCloseTo(dflt.relativeWidth, 4);
  });

  it("rejects a non-positive recencyHalfLifeYears option", () => {
    expect(() =>
      appraise(artworkRothko, tightComps, { recencyHalfLifeYears: 0 }),
    ).toThrow(/positive/);
  });

  it("supports the 0.5 confidence boundary (narrowest supported band)", () => {
    const c50 = appraise(artworkRothko, tightComps, { confidence: 0.5 });
    const c95 = appraise(artworkRothko, tightComps, { confidence: 0.95 });
    expect(c50.confidence).toBe(0.5);
    // Lower confidence => narrower band, same centre.
    expect(c50.relativeWidth).toBeLessThan(c95.relativeWidth);
    expect(c50.estimate.amount.toNumber()).toBeCloseTo(
      c95.estimate.amount.toNumber(),
      2,
    );
  });

  it("exposes a sane default half-life", () => {
    expect(DEFAULT_RECENCY_HALF_LIFE_YEARS).toBeGreaterThan(0);
  });
});

describe("appraise — known-value sanity check", () => {
  it("matches a hand-computed weighted geometric mean", () => {
    // Two equally-weighted comps (same date, same similarity) at 100 and 400.
    // Geometric mean = sqrt(100 * 400) = 200, mint + documented => no adjust.
    const art = Artwork.parse({
      id: "a",
      title: "t",
      artist: "x",
      medium: "painting",
      condition: "mint",
      provenance: "documented",
      currency: "USD",
    });
    const comps = [100, 400].map((p, i) =>
      Comparable.parse({
        id: `c${i}`,
        price: String(p),
        currency: "USD",
        soldOn: "2025-01-01",
      }),
    );
    const r = appraise(art, comps, { asOf: "2025-01-01" });
    expect(r.estimate.amount.toNumber()).toBeCloseTo(200, 6);
  });
});
