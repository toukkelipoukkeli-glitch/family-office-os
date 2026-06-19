import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  BASE_GROWTH_UNCERTAINTY,
  DROUGHT_SENSITIVITY,
  ForestStand,
  GrowingSeason,
  SPECIES,
  TimberPriceObservation,
  baseVolumePerHectare,
  buildTimberPriceIndex,
  confidenceForBand,
  growthParams,
  growthUncertaintyFor,
  seasonGrowthMultiplier,
  standingVolumePerHectare,
  valueForest,
  valueStand,
  valueStandWithIndex,
} from "./index";
import {
  oakRiverside,
  pineSouthRidge,
  spruceNorthBlock,
  timberPriceSeriesEur,
  timberPriceSeriesVolatileEur,
} from "./fixtures";

const D = (s: string | number) => new Decimal(s);

/** Exact decimal amount of a Money value (drops the currency suffix). */
const amt = (m: { toJSON(): { amount: string } }) =>
  new Decimal(m.toJSON().amount);

describe("forest schemas (stand.ts)", () => {
  it("parses a valid stand and applies defaults", () => {
    const stand = ForestStand.parse({
      id: "s1",
      name: "Block A",
      species: "spruce",
      siteClass: "good",
      areaHectares: 10,
      standAgeYears: 40,
      currency: "eur",
    });
    expect(stand.currency).toBe("EUR"); // normalized uppercase
    expect(stand.managementFactor).toBe("1"); // default
    expect(stand.seasons).toEqual([]); // default
  });

  it("rejects non-positive area and out-of-range age", () => {
    const base = {
      id: "s",
      name: "x",
      species: "pine",
      siteClass: "average",
      currency: "EUR",
      standAgeYears: 10,
    };
    expect(() => ForestStand.parse({ ...base, areaHectares: 0 })).toThrow();
    expect(() => ForestStand.parse({ ...base, areaHectares: -3 })).toThrow();
    expect(() =>
      ForestStand.parse({ ...base, areaHectares: 1, standAgeYears: 301 }),
    ).toThrow();
  });

  it("rejects an unknown species and rejects unknown keys (strict)", () => {
    expect(() =>
      ForestStand.parse({
        id: "s",
        name: "x",
        species: "redwood",
        siteClass: "good",
        areaHectares: 1,
        standAgeYears: 10,
        currency: "EUR",
      }),
    ).toThrow();
    expect(() =>
      ForestStand.parse({
        id: "s",
        name: "x",
        species: "oak",
        siteClass: "good",
        areaHectares: 1,
        standAgeYears: 10,
        currency: "EUR",
        bogusKey: 1,
      }),
    ).toThrow();
  });

  it("clamps the drought index domain to [-1, 1]", () => {
    expect(() => GrowingSeason.parse({ year: 2023, droughtIndex: 1.5 })).toThrow();
    expect(() =>
      GrowingSeason.parse({ year: 2023, droughtIndex: -1.5 }),
    ).toThrow();
    expect(GrowingSeason.parse({ year: 2023, droughtIndex: 1 }).droughtIndex).toBe(
      1,
    );
  });

  it("rejects a non-decimal or signed timber price", () => {
    expect(() =>
      TimberPriceObservation.parse({
        date: "2024-06-30",
        pricePerCubicMeter: "-5",
        currency: "EUR",
      }),
    ).toThrow();
    expect(() =>
      TimberPriceObservation.parse({
        date: "2024-13-01",
        pricePerCubicMeter: "50",
        currency: "EUR",
      }),
    ).toThrow();
  });
});

describe("biological growth model (growth.ts)", () => {
  it("starts at zero volume and is monotonically increasing in age", () => {
    const params = growthParams("spruce", "average");
    expect(baseVolumePerHectare(0, params).isZero()).toBe(true);
    let prev = D(-1);
    for (let age = 0; age <= 120; age += 10) {
      const v = baseVolumePerHectare(age, params);
      expect(v.greaterThanOrEqualTo(prev)).toBe(true);
      prev = v;
    }
  });

  it("approaches but never exceeds the asymptote", () => {
    const params = growthParams("spruce", "good");
    const old = baseVolumePerHectare(250, params);
    expect(old.lessThan(params.asymptoteVolume)).toBe(true);
    // within 5% of asymptote at a very old age
    expect(
      old.div(params.asymptoteVolume).greaterThan("0.95"),
    ).toBe(true);
  });

  it("rejects a negative age", () => {
    const params = growthParams("pine", "average");
    expect(() => baseVolumePerHectare(-1, params)).toThrow();
  });

  it("scales the asymptote by site class (excellent > average > poor)", () => {
    const exc = growthParams("spruce", "excellent").asymptoteVolume;
    const avg = growthParams("spruce", "average").asymptoteVolume;
    const poor = growthParams("spruce", "poor").asymptoteVolume;
    expect(exc.greaterThan(avg)).toBe(true);
    expect(avg.greaterThan(poor)).toBe(true);
  });

  it("defines growth params for every species", () => {
    for (const sp of SPECIES) {
      const p = growthParams(sp, "average");
      expect(p.asymptoteVolume.greaterThan(0)).toBe(true);
      expect(p.rate.greaterThan(0)).toBe(true);
      expect(p.shape.greaterThan(1)).toBe(true);
    }
  });

  it("matches a hand-computed Chapman-Richards value", () => {
    // V = A*(1-e^{-k*age})^p ; spruce/average: A=520, k=0.035, p=3, age=50
    const params = growthParams("spruce", "average");
    const expected = D(520).times(
      D(1).minus(D(-0.035 * 50).exp()).pow(3),
    );
    const got = baseVolumePerHectare(50, params);
    expect(got.minus(expected).abs().lessThan("1e-9")).toBe(true);
  });
});

describe("drought coupling (growth.ts)", () => {
  it("returns 1.0 multiplier for a normal year", () => {
    expect(seasonGrowthMultiplier(0).equals(1)).toBe(true);
  });

  it("suppresses growth in a dry year and boosts it in a wet year", () => {
    expect(seasonGrowthMultiplier(1).equals(D(1).minus(DROUGHT_SENSITIVITY))).toBe(
      true,
    );
    expect(seasonGrowthMultiplier(-1).equals(D(1).plus(DROUGHT_SENSITIVITY))).toBe(
      true,
    );
    expect(seasonGrowthMultiplier(0.5).lessThan(1)).toBe(true);
  });

  it("never lets the season multiplier go below the floor", () => {
    // even an impossible extreme can't drive the increment non-positive
    expect(seasonGrowthMultiplier(1).greaterThanOrEqualTo("0.2")).toBe(true);
  });

  it("drought lowers standing volume below the undisturbed base curve", () => {
    const params = growthParams("spruce", "good");
    const seasons: GrowingSeason[] = [
      { year: 2022, droughtIndex: 0.8 },
      { year: 2023, droughtIndex: 0.8 },
    ];
    const r = standingVolumePerHectare(65, params, seasons);
    expect(r.volumePerHectare.lessThan(r.baseVolumePerHectare)).toBe(true);
    expect(r.droughtEffect.lessThan(1)).toBe(true);
    expect(r.seasonsApplied).toBe(2);
  });

  it("a wet record raises standing volume above the base curve", () => {
    const params = growthParams("birch", "good");
    const seasons: GrowingSeason[] = [
      { year: 2023, droughtIndex: -0.5 },
      { year: 2024, droughtIndex: -0.5 },
    ];
    const r = standingVolumePerHectare(40, params, seasons);
    expect(r.volumePerHectare.greaterThan(r.baseVolumePerHectare)).toBe(true);
    expect(r.droughtEffect.greaterThan(1)).toBe(true);
  });

  it("a record of only normal years leaves the base curve unchanged", () => {
    const params = growthParams("pine", "average");
    const seasons: GrowingSeason[] = [
      { year: 2022, droughtIndex: 0 },
      { year: 2023, droughtIndex: 0 },
    ];
    const r = standingVolumePerHectare(50, params, seasons);
    expect(
      r.volumePerHectare.minus(r.baseVolumePerHectare).abs().lessThan("1e-9"),
    ).toBe(true);
    expect(r.droughtEffect.minus(1).abs().lessThan("1e-9")).toBe(true);
  });

  it("no seasons => exactly the base curve", () => {
    const params = growthParams("oak", "excellent");
    const r = standingVolumePerHectare(30, params, []);
    expect(r.volumePerHectare.equals(r.baseVolumePerHectare)).toBe(true);
    expect(r.seasonsApplied).toBe(0);
  });

  it("only modulates years inside the recorded window, not older wood", () => {
    // A single drought year on a 65-yo stand should remove only a sliver:
    // far less than 2% of total volume, since one annual increment is tiny vs
    // the standing total.
    const params = growthParams("spruce", "good");
    const one: GrowingSeason[] = [{ year: 2024, droughtIndex: 1 }];
    const r = standingVolumePerHectare(65, params, one);
    const lost = r.baseVolumePerHectare.minus(r.volumePerHectare);
    expect(lost.greaterThan(0)).toBe(true);
    expect(lost.div(r.baseVolumePerHectare).lessThan("0.02")).toBe(true);
  });

  it("is deterministic — identical inputs give identical output", () => {
    const params = growthParams("spruce", "good");
    const seasons: GrowingSeason[] = [{ year: 2023, droughtIndex: 0.5 }];
    const a = standingVolumePerHectare(60, params, seasons);
    const b = standingVolumePerHectare(60, params, seasons);
    expect(a.volumePerHectare.equals(b.volumePerHectare)).toBe(true);
  });
});

describe("timber price index (price-index.ts)", () => {
  it("rebases to 100 at the first observation and tracks the latest price", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur);
    expect(idx.points[0].index.equals(100)).toBe(true);
    expect(idx.latestPrice.equals(78)).toBe(true);
    expect(idx.latestDate).toBe("2024-06-30");
    expect(idx.observationCount).toBe(4);
    expect(idx.currency).toBe("EUR");
    // total return = 78/62 - 1
    expect(idx.totalReturn.minus(D(78).div(62).minus(1)).abs().lessThan("1e-9")).toBe(
      true,
    );
  });

  it("sorts unordered observations ascending by date", () => {
    const idx = buildTimberPriceIndex([
      timberPriceSeriesEur[2],
      timberPriceSeriesEur[0],
      timberPriceSeriesEur[3],
      timberPriceSeriesEur[1],
    ]);
    expect(idx.points.map((p) => p.date)).toEqual([
      "2021-06-30",
      "2022-06-30",
      "2023-06-30",
      "2024-06-30",
    ]);
  });

  it("a volatile series has higher dispersion than a steady one", () => {
    const steady = buildTimberPriceIndex(timberPriceSeriesEur);
    const volatile = buildTimberPriceIndex(timberPriceSeriesVolatileEur);
    expect(volatile.dispersion.greaterThan(steady.dispersion)).toBe(true);
  });

  it("dispersion is zero for a single observation", () => {
    const idx = buildTimberPriceIndex([timberPriceSeriesEur[0]]);
    expect(idx.dispersion.isZero()).toBe(true);
    expect(idx.totalReturn.isZero()).toBe(true);
  });

  it("throws on empty input and on mixed currencies", () => {
    expect(() => buildTimberPriceIndex([])).toThrow();
    expect(() =>
      buildTimberPriceIndex([
        { date: "2023-01-01", pricePerCubicMeter: "50", currency: "EUR" },
        { date: "2023-02-01", pricePerCubicMeter: "55", currency: "USD" },
      ]),
    ).toThrow(/mixed currencies/);
  });

  it("throws when the base (first) price is zero (cannot rebase)", () => {
    expect(() =>
      buildTimberPriceIndex([
        { date: "2023-01-01", pricePerCubicMeter: "0", currency: "EUR" },
        { date: "2023-02-01", pricePerCubicMeter: "55", currency: "EUR" },
      ]),
    ).toThrow();
  });
});

describe("forest valuation (valuation.ts)", () => {
  it("values a stand: point = volume × area × price × management", () => {
    const v = valueStand(spruceNorthBlock, timberPriceSeriesEur);
    expect(v.standId).toBe("stand-spruce-north");
    expect(v.referencePricePerCubicMeter.toJSON().amount).toBe("78");
    // recompute the expected point from the model pieces
    const expected = v.totalVolume
      .times(78)
      .times(v.managementFactor);
    expect(
      amt(v.pointEstimate).minus(expected).abs().lessThan(1), // rounded to whole units
    ).toBe(true);
    expect(v.pointEstimate.currency).toBe("EUR");
  });

  it("orders the band low < point < high and keeps low non-negative", () => {
    const v = valueStand(spruceNorthBlock, timberPriceSeriesEur);
    const low = amt(v.low);
    const point = amt(v.pointEstimate);
    const high = amt(v.high);
    expect(low.lessThan(point)).toBe(true);
    expect(point.lessThan(high)).toBe(true);
    expect(low.greaterThanOrEqualTo(0)).toBe(true);
    expect(v.bandFraction.greaterThan(0)).toBe(true);
  });

  it("a volatile price market widens the band vs a steady one", () => {
    const steady = valueStand(spruceNorthBlock, timberPriceSeriesEur);
    const volatile = valueStand(
      spruceNorthBlock,
      timberPriceSeriesVolatileEur,
    );
    expect(volatile.bandFraction.greaterThan(steady.bandFraction)).toBe(true);
    expect(
      volatile.marketUncertainty.greaterThan(steady.marketUncertainty),
    ).toBe(true);
  });

  it("a drought-stressed stand carries more growth uncertainty than an undisturbed one", () => {
    // oak has no seasons (undisturbed); spruce has a heavy drought record.
    const undisturbed = valueStand(oakRiverside, timberPriceSeriesEur);
    const stressed = valueStand(spruceNorthBlock, timberPriceSeriesEur);
    expect(
      undisturbed.growthUncertainty.equals(BASE_GROWTH_UNCERTAINTY),
    ).toBe(true);
    expect(
      stressed.growthUncertainty.greaterThan(BASE_GROWTH_UNCERTAINTY),
    ).toBe(true);
  });

  it("a wider z-score produces a wider band, same point", () => {
    const narrow = valueStand(pineSouthRidge, timberPriceSeriesEur, { z: 1 });
    const wide = valueStand(pineSouthRidge, timberPriceSeriesEur, { z: 1.96 });
    expect(narrow.pointEstimate.equals(wide.pointEstimate)).toBe(true);
    expect(wide.bandFraction.greaterThan(narrow.bandFraction)).toBe(true);
  });

  it("management factor scales the point estimate proportionally", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur);
    const neutral = valueStandWithIndex(
      { ...pineSouthRidge, managementFactor: "1" },
      idx,
    );
    const discounted = valueStandWithIndex(
      { ...pineSouthRidge, managementFactor: "0.5" },
      idx,
    );
    const ratio = amt(discounted.pointEstimate).div(amt(neutral.pointEstimate));
    expect(ratio.minus("0.5").abs().lessThan("0.001")).toBe(true);
  });

  it("rejects a stand whose currency differs from the price index", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur); // EUR
    expect(() =>
      valueStandWithIndex({ ...oakRiverside, currency: "USD" }, idx),
    ).toThrow(/does not match/);
  });

  it("rejects invalid options", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur);
    expect(() => valueStandWithIndex(oakRiverside, idx, { z: 0 })).toThrow();
    expect(() => valueStandWithIndex(oakRiverside, idx, { z: -1 })).toThrow();
    expect(() =>
      valueStandWithIndex(oakRiverside, idx, { modelUncertainty: -0.1 }),
    ).toThrow();
  });

  it("an added flat model uncertainty widens the band", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur);
    const without = valueStandWithIndex(oakRiverside, idx);
    const withU = valueStandWithIndex(oakRiverside, idx, {
      modelUncertainty: 0.2,
    });
    expect(withU.bandFraction.greaterThan(without.bandFraction)).toBe(true);
  });

  it("validates raw stand input through the schema", () => {
    expect(() =>
      valueStand(
        { id: "x", name: "y", species: "spruce" },
        timberPriceSeriesEur,
      ),
    ).toThrow();
  });

  it("is fully deterministic across repeated calls", () => {
    const a = valueStand(spruceNorthBlock, timberPriceSeriesEur);
    const b = valueStand(spruceNorthBlock, timberPriceSeriesEur);
    expect(a.pointEstimate.equals(b.pointEstimate)).toBe(true);
    expect(a.low.equals(b.low)).toBe(true);
    expect(a.high.equals(b.high)).toBe(true);
    expect(a.bandFraction.equals(b.bandFraction)).toBe(true);
  });
});

describe("confidence band helpers (valuation.ts)", () => {
  it("maps band fraction to a coarse confidence level", () => {
    expect(confidenceForBand(D("0.1"))).toBe("high");
    expect(confidenceForBand(D("0.2"))).toBe("high");
    expect(confidenceForBand(D("0.3"))).toBe("medium");
    expect(confidenceForBand(D("0.4"))).toBe("medium");
    expect(confidenceForBand(D("0.5"))).toBe("low");
  });

  it("growthUncertaintyFor grows with the drought pull", () => {
    expect(growthUncertaintyFor(D(1)).equals(BASE_GROWTH_UNCERTAINTY)).toBe(true);
    expect(growthUncertaintyFor(D("0.8")).greaterThan(BASE_GROWTH_UNCERTAINTY)).toBe(
      true,
    );
    // symmetric: equally far above or below 1 gives the same widening
    expect(
      growthUncertaintyFor(D("1.2")).equals(growthUncertaintyFor(D("0.8"))),
    ).toBe(true);
  });

  it("the steady-market undisturbed stand earns at least medium confidence", () => {
    const v = valueStand(oakRiverside, timberPriceSeriesEur);
    expect(["high", "medium"]).toContain(v.confidence);
  });
});

describe("forest portfolio aggregation (valuation.ts)", () => {
  it("sums point/low/high and total volume across stands", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur);
    const a = valueStandWithIndex(spruceNorthBlock, idx);
    const b = valueStandWithIndex(oakRiverside, idx);
    const c = valueStandWithIndex(pineSouthRidge, idx);
    const total = valueForest([a, b, c]);

    expect(total.currency).toBe("EUR");
    expect(total.stands).toHaveLength(3);
    expect(
      total.pointEstimate.equals(a.pointEstimate.plus(b.pointEstimate).plus(c.pointEstimate)),
    ).toBe(true);
    expect(total.low.equals(a.low.plus(b.low).plus(c.low))).toBe(true);
    expect(total.high.equals(a.high.plus(b.high).plus(c.high))).toBe(true);
    expect(
      total.totalVolume
        .minus(a.totalVolume.plus(b.totalVolume).plus(c.totalVolume))
        .abs()
        .lessThan("1e-9"),
    ).toBe(true);
    // band brackets the point
    expect(total.low.lessThan(total.pointEstimate)).toBe(true);
    expect(total.pointEstimate.lessThan(total.high)).toBe(true);
  });

  it("throws on empty aggregation and on mixed currencies", () => {
    expect(() => valueForest([])).toThrow();
    const eur = valueStand(oakRiverside, timberPriceSeriesEur);
    const usd = valueStand(
      { ...oakRiverside, currency: "USD" },
      timberPriceSeriesEur.map((o) => ({ ...o, currency: "USD" })),
    );
    expect(() => valueForest([eur, usd])).toThrow(/mixed currencies/);
  });
});

describe("forest adversarial edge cases", () => {
  it("floors the lower band at zero under an extreme z (never negative)", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesVolatileEur);
    const v = valueStandWithIndex(spruceNorthBlock, idx, { z: 100 });
    // band fraction blows past 1, so a naive (1 - z*sigma) would go negative
    expect(v.bandFraction.greaterThan(1)).toBe(true);
    expect(amt(v.low).equals(0)).toBe(true);
    expect(amt(v.low).greaterThanOrEqualTo(0)).toBe(true);
    expect(v.high.greaterThan(v.pointEstimate)).toBe(true);
    expect(v.confidence).toBe("low");
  });

  it("dedups duplicate season years deterministically (last entry wins)", () => {
    const params = growthParams("spruce", "good");
    // same calendar year recorded twice: a drought row and a wet row
    const wetWins = standingVolumePerHectare(50, params, [
      { year: 2024, droughtIndex: 0.9 },
      { year: 2024, droughtIndex: -0.5 },
    ]);
    const droughtWins = standingVolumePerHectare(50, params, [
      { year: 2024, droughtIndex: -0.5 },
      { year: 2024, droughtIndex: 0.9 },
    ]);
    // exactly one season modulates regardless of how many dup rows are passed
    expect(wetWins.seasonsApplied).toBe(1);
    expect(droughtWins.seasonsApplied).toBe(1);
    // the surviving (last-by-year-sort) entry decides the direction:
    // wet => above base, drought => below base
    expect(wetWins.volumePerHectare.greaterThan(wetWins.baseVolumePerHectare)).toBe(
      true,
    );
    expect(
      droughtWins.volumePerHectare.lessThan(droughtWins.baseVolumePerHectare),
    ).toBe(true);
    // fully deterministic: rerunning gives an identical result
    const repeat = standingVolumePerHectare(50, params, [
      { year: 2024, droughtIndex: 0.9 },
      { year: 2024, droughtIndex: -0.5 },
    ]);
    expect(repeat.volumePerHectare.equals(wetWins.volumePerHectare)).toBe(true);
  });

  it("only modulates the recent window, leaving older standing wood at base", () => {
    const params = growthParams("pine", "average");
    // a single severe-drought season on a much older stand: by recency it maps
    // to the most-recent year, so only that one annual increment is modulated;
    // all the wood grown before the window stays on the base curve.
    const r = standingVolumePerHectare(80, params, [
      { year: 2024, droughtIndex: 0.9 },
    ]);
    expect(r.seasonsApplied).toBe(1);
    // a single suppressed increment near the asymptote barely moves the total
    expect(r.volumePerHectare.lessThan(r.baseVolumePerHectare)).toBe(true);
    const pull = r.baseVolumePerHectare
      .minus(r.volumePerHectare)
      .div(r.baseVolumePerHectare);
    expect(pull.lessThan("0.02")).toBe(true);
  });

  it("aligns the latest season to the current age regardless of calendar year", () => {
    const params = growthParams("spruce", "good");
    // identical drought signal at two different calendar years => same effect,
    // because the model aligns the most-recent season to the current age.
    const a = standingVolumePerHectare(40, params, [
      { year: 2024, droughtIndex: 0.8 },
    ]);
    const b = standingVolumePerHectare(40, params, [
      { year: 1990, droughtIndex: 0.8 },
    ]);
    expect(a.volumePerHectare.equals(b.volumePerHectare)).toBe(true);
    expect(a.seasonsApplied).toBe(1);
    expect(b.seasonsApplied).toBe(1);
  });

  it("handles a fractional stand age without breaking the band ordering", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur);
    const stand = ForestStand.parse({
      id: "frac",
      name: "fractional",
      species: "fir",
      siteClass: "average",
      areaHectares: 8.5,
      standAgeYears: 42.5,
      currency: "EUR",
      seasons: [{ year: 2024, droughtIndex: 0.4 }],
    });
    const v = valueStandWithIndex(stand, idx);
    expect(v.volumePerHectare.greaterThan(0)).toBe(true);
    expect(amt(v.low).lessThan(amt(v.pointEstimate))).toBe(true);
    expect(amt(v.pointEstimate).lessThan(amt(v.high))).toBe(true);
  });

  it("rejects a zero z and a negative modelUncertainty", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur);
    expect(() => valueStandWithIndex(spruceNorthBlock, idx, { z: 0 })).toThrow();
    expect(() =>
      valueStandWithIndex(spruceNorthBlock, idx, { z: Number.NaN }),
    ).toThrow();
    expect(() =>
      valueStandWithIndex(spruceNorthBlock, idx, { modelUncertainty: -0.1 }),
    ).toThrow();
  });

  it("rejects an invalid dispersionWindow (0, negative, NaN, non-integer)", () => {
    expect(() => buildTimberPriceIndex(timberPriceSeriesEur, 0)).toThrow(
      /dispersionWindow/,
    );
    expect(() => buildTimberPriceIndex(timberPriceSeriesEur, -3)).toThrow(
      /dispersionWindow/,
    );
    expect(() => buildTimberPriceIndex(timberPriceSeriesEur, Number.NaN)).toThrow(
      /dispersionWindow/,
    );
    expect(() => buildTimberPriceIndex(timberPriceSeriesEur, 2.5)).toThrow(
      /dispersionWindow/,
    );
    // a valid window still works
    expect(() => buildTimberPriceIndex(timberPriceSeriesEur, 2)).not.toThrow();
  });

  it("widens the band monotonically as model uncertainty rises", () => {
    const idx = buildTimberPriceIndex(timberPriceSeriesEur);
    const lo = valueStandWithIndex(oakRiverside, idx, { modelUncertainty: 0 });
    const mid = valueStandWithIndex(oakRiverside, idx, { modelUncertainty: 0.1 });
    const hi = valueStandWithIndex(oakRiverside, idx, { modelUncertainty: 0.5 });
    expect(mid.bandFraction.greaterThan(lo.bandFraction)).toBe(true);
    expect(hi.bandFraction.greaterThan(mid.bandFraction)).toBe(true);
    // a wider band can only push low down and high up
    expect(amt(hi.low).lessThanOrEqualTo(amt(lo.low))).toBe(true);
    expect(amt(hi.high).greaterThanOrEqualTo(amt(lo.high))).toBe(true);
  });
});
