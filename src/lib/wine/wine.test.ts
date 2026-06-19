import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  BOTTLE_FORMATS,
  FORMAT_VOLUME_RATIO,
  PriceObservation,
  Provenance,
  Wine,
  WineLot,
  buildWineIndex,
  provenanceFactor,
  provenanceUncertainty,
  valueCellar,
  valueLot,
  valueLotWithIndex,
  wineKey,
} from "./index";
import {
  drcObservations,
  krugObservations,
  lafiteObservations,
  lotKrug,
  lotLafite,
  lotLafiteMagnum,
  provenancePristine,
  provenanceReference,
  provenanceWeak,
  wineDrcRomanee2015,
  wineKrugNv,
  wineLafite2010,
} from "./fixtures";

/** Assert a Decimal is within `eps` of `expected`. */
function expectClose(actual: Decimal, expected: number, eps = 1e-9): void {
  const diff = actual.minus(expected).abs().toNumber();
  expect(
    diff,
    `expected ${actual.toFixed(12)} ≈ ${expected} (|Δ|=${diff})`,
  ).toBeLessThan(eps);
}

describe("Wine schema", () => {
  it("accepts a vintage wine and a non-vintage cuvée", () => {
    expect(() => Wine.parse(wineLafite2010)).not.toThrow();
    expect(wineKrugNv.vintage).toBe(0);
  });

  it("rejects an out-of-range vintage", () => {
    expect(() =>
      Wine.parse({ ...wineLafite2010, vintage: 1700 }),
    ).toThrow();
  });

  it("rejects an unknown region", () => {
    expect(() =>
      Wine.parse({ ...wineLafite2010, region: "narnia" }),
    ).toThrow();
  });

  it("normalizes the currency code to uppercase", () => {
    const w = Wine.parse({ ...wineLafite2010, currency: "gbp" });
    expect(w.currency).toBe("GBP");
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      Wine.parse({ ...wineLafite2010, surpriseField: 1 }),
    ).toThrow();
  });
});

describe("wineKey", () => {
  it("renders vintage wines and NV wines distinctly", () => {
    expect(wineKey(wineLafite2010)).toBe("Château Lafite Rothschild 2010");
    expect(wineKey(wineKrugNv)).toBe("Krug Grande Cuvée NV");
  });
});

describe("WineLot schema", () => {
  it("defaults format to a standard bottle", () => {
    const lot = WineLot.parse({
      id: "lot-x",
      wineId: "wine-x",
      quantity: 6,
      costPerBottle: "100",
      acquiredOn: "2020-01-01",
      provenance: provenanceReference,
    });
    expect(lot.format).toBe("bottle");
  });

  it("rejects a non-positive or non-integer quantity", () => {
    const base = {
      id: "lot-x",
      wineId: "wine-x",
      costPerBottle: "100",
      acquiredOn: "2020-01-01",
      provenance: provenanceReference,
    };
    expect(() => WineLot.parse({ ...base, quantity: 0 })).toThrow();
    expect(() => WineLot.parse({ ...base, quantity: 2.5 })).toThrow();
    expect(() => WineLot.parse({ ...base, quantity: -3 })).toThrow();
  });

  it("rejects a non-positive price string", () => {
    const base = {
      id: "lot-x",
      wineId: "wine-x",
      quantity: 6,
      acquiredOn: "2020-01-01",
      provenance: provenanceReference,
    };
    expect(() => WineLot.parse({ ...base, costPerBottle: "0" })).toThrow();
    expect(() => WineLot.parse({ ...base, costPerBottle: "-5" })).toThrow();
    expect(() => WineLot.parse({ ...base, costPerBottle: "abc" })).toThrow();
  });

  it("rejects an invalid acquisition date", () => {
    expect(() =>
      WineLot.parse({
        id: "lot-x",
        wineId: "wine-x",
        quantity: 6,
        costPerBottle: "100",
        acquiredOn: "2020-02-30",
        provenance: provenanceReference,
      }),
    ).toThrow();
  });
});

describe("Provenance defaults", () => {
  it("defaults boolean signals to false", () => {
    const p = Provenance.parse({ condition: "good", storage: "private-cellar" });
    expect(p.originalWoodenCase).toBe(false);
    expect(p.purchasedOnRelease).toBe(false);
    expect(p.documented).toBe(false);
  });
});

describe("provenanceFactor", () => {
  it("is exactly 1.0 for reference provenance", () => {
    expectClose(provenanceFactor(provenanceReference), 1.0);
  });

  it("is a premium for a pristine, documented, OWC, on-release in-bond lot", () => {
    // 1.08 * 1.05 * 1.03 * 1.02 * 1.02
    const expected = 1.08 * 1.05 * 1.03 * 1.02 * 1.02;
    expectClose(provenanceFactor(provenancePristine), expected);
    expect(provenanceFactor(provenancePristine).greaterThan(1)).toBe(true);
  });

  it("is a discount for a weak, unknown-storage lot", () => {
    // fair (0.85) * unknown (0.9)
    expectClose(provenanceFactor(provenanceWeak), 0.85 * 0.9);
    expect(provenanceFactor(provenanceWeak).lessThan(1)).toBe(true);
  });

  it("compounds discrete premia multiplicatively", () => {
    const base = Provenance.parse({ condition: "good", storage: "private-cellar" });
    const owc = Provenance.parse({ ...base, originalWoodenCase: true });
    expectClose(provenanceFactor(owc), 1.03);
  });
});

describe("provenanceUncertainty", () => {
  it("is tighter for pristine, fully-documented provenance than for weak", () => {
    const tight = provenanceUncertainty(provenancePristine);
    const wide = provenanceUncertainty(provenanceWeak);
    expect(tight.lessThan(wide)).toBe(true);
  });

  it("stays within [0, 1]", () => {
    for (const p of [provenancePristine, provenanceReference, provenanceWeak]) {
      const u = provenanceUncertainty(p);
      expect(u.greaterThanOrEqualTo(0)).toBe(true);
      expect(u.lessThanOrEqualTo(1)).toBe(true);
    }
  });

  it("documentation reduces uncertainty (monotone)", () => {
    const undoc = Provenance.parse({ condition: "good", storage: "in-bond" });
    const doc = Provenance.parse({ ...undoc, documented: true });
    expect(provenanceUncertainty(doc).lessThan(provenanceUncertainty(undoc))).toBe(
      true,
    );
  });
});

describe("buildWineIndex", () => {
  it("throws on empty observations", () => {
    expect(() => buildWineIndex([])).toThrow(/at least one/);
  });

  it("rebases to 100 at the first observation and tracks index + price", () => {
    const idx = buildWineIndex(lafiteObservations);
    expect(idx.observationCount).toBe(6);
    expectClose(idx.points[0].index, 100);
    expect(idx.points[0].price.toFixed()).toBe("750");
    expect(idx.latestPrice.toFixed()).toBe("1100");
    expect(idx.latestDate).toBe("2023-07-03");
    // 1100/750 * 100
    expectClose(idx.points[idx.points.length - 1].index, (1100 / 750) * 100);
  });

  it("computes total return from first to last", () => {
    const idx = buildWineIndex(lafiteObservations);
    expectClose(idx.totalReturn, 1100 / 750 - 1);
  });

  it("sorts unordered observations by date", () => {
    const shuffled = [
      lafiteObservations[3],
      lafiteObservations[0],
      lafiteObservations[5],
      lafiteObservations[1],
    ];
    const idx = buildWineIndex(shuffled);
    const dates = idx.points.map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
    expect(idx.points[0].price.toFixed()).toBe("750");
  });

  it("has zero dispersion and total return for a single observation", () => {
    const idx = buildWineIndex(krugObservations);
    expect(idx.dispersion.toNumber()).toBe(0);
    expect(idx.totalReturn.toNumber()).toBe(0);
    expect(idx.observationCount).toBe(1);
  });

  it("reports higher dispersion for a noisy series than a smooth one", () => {
    const smooth = buildWineIndex(lafiteObservations).dispersion;
    const noisy = buildWineIndex(drcObservations).dispersion;
    expect(noisy.greaterThan(smooth)).toBe(true);
  });

  it("computes coefficient of variation against a known window", () => {
    // Three equal prices => zero dispersion.
    const flat = buildWineIndex([
      PriceObservation.parse({ date: "2023-01-01", pricePerBottle: "100" }),
      PriceObservation.parse({ date: "2023-02-01", pricePerBottle: "100" }),
      PriceObservation.parse({ date: "2023-03-01", pricePerBottle: "100" }),
    ]);
    expect(flat.dispersion.toNumber()).toBe(0);

    // Prices 90, 100, 110: mean 100, sample sd = sqrt(((-10)^2+0+10^2)/2)=10 => CV 0.1
    const known = buildWineIndex([
      PriceObservation.parse({ date: "2023-01-01", pricePerBottle: "90" }),
      PriceObservation.parse({ date: "2023-02-01", pricePerBottle: "100" }),
      PriceObservation.parse({ date: "2023-03-01", pricePerBottle: "110" }),
    ]);
    expectClose(known.dispersion, 0.1, 1e-9);
  });

  it("limits dispersion to the most-recent window", () => {
    const obs = [
      PriceObservation.parse({ date: "2020-01-01", pricePerBottle: "10" }),
      PriceObservation.parse({ date: "2020-02-01", pricePerBottle: "1000" }),
      PriceObservation.parse({ date: "2023-01-01", pricePerBottle: "100" }),
      PriceObservation.parse({ date: "2023-02-01", pricePerBottle: "100" }),
    ];
    // Window of 2 sees only the two equal recent prices => 0 dispersion.
    expect(buildWineIndex(obs, 2).dispersion.toNumber()).toBe(0);
    // Full window sees the old wild swing => nonzero.
    expect(buildWineIndex(obs, 4).dispersion.greaterThan(0)).toBe(true);
  });
});

describe("FORMAT_VOLUME_RATIO", () => {
  it("covers every declared format with positive ratios", () => {
    for (const f of BOTTLE_FORMATS) {
      expect(FORMAT_VOLUME_RATIO[f]).toBeGreaterThan(0);
    }
    expect(FORMAT_VOLUME_RATIO.bottle).toBe(1);
    expect(FORMAT_VOLUME_RATIO.magnum).toBe(2);
  });
});

describe("valueLot", () => {
  it("rejects a lot whose wineId does not match the wine", () => {
    expect(() =>
      valueLot(wineLafite2010, lotKrug, lafiteObservations),
    ).toThrow(/does not match/);
  });

  it("rejects a non-positive z", () => {
    expect(() =>
      valueLot(wineLafite2010, lotLafite, lafiteObservations, { z: 0 }),
    ).toThrow(/z must be/);
    expect(() =>
      valueLot(wineLafite2010, lotLafite, lafiteObservations, { z: -1 }),
    ).toThrow(/z must be/);
  });

  it("rejects negative model uncertainty", () => {
    expect(() =>
      valueLot(wineLafite2010, lotLafite, lafiteObservations, {
        modelUncertainty: -0.1,
      }),
    ).toThrow(/modelUncertainty/);
  });

  it("prices a reference-provenance standard bottle at index × quantity", () => {
    const refLot = WineLot.parse({
      ...lotLafite,
      provenance: provenanceReference,
      format: "bottle",
      quantity: 10,
    });
    const v = valueLot(wineLafite2010, refLot, lafiteObservations);
    // reference price 1100, factor 1, ratio 1, qty 10 => 11000
    expect(v.referencePricePerBottle.amount.toFixed()).toBe("1100");
    expectClose(v.provenanceFactor, 1);
    expect(v.valuePerBottle.amount.toFixed()).toBe("1100");
    expect(v.pointEstimate.amount.toFixed()).toBe("11000");
    expect(v.pointEstimate.currency).toBe("GBP");
  });

  it("applies the provenance premium to the point estimate", () => {
    const v = valueLot(wineLafite2010, lotLafite, lafiteObservations);
    const factor = provenanceFactor(provenancePristine);
    const expectedPerBottle = new Decimal(1100).times(factor);
    expectClose(v.valuePerBottle.amount, expectedPerBottle.toNumber(), 1e-6);
    expect(v.valuePerBottle.amount.greaterThan(1100)).toBe(true);
  });

  it("applies the format volume ratio for large formats", () => {
    const v = valueLot(wineLafite2010, lotLafiteMagnum, lafiteObservations);
    // magnum ratio 2, reference provenance, reference 1100 => 2200/bottle
    expect(v.formatRatio.toNumber()).toBe(2);
    expect(v.valuePerBottle.amount.toFixed()).toBe("2200");
    // qty 3 => 6600
    expect(v.pointEstimate.amount.toFixed()).toBe("6600");
  });

  it("produces a band that brackets the point estimate", () => {
    const v = valueLot(wineLafite2010, lotLafite, lafiteObservations);
    expect(v.low.amount.lessThan(v.pointEstimate.amount)).toBe(true);
    expect(v.high.amount.greaterThan(v.pointEstimate.amount)).toBe(true);
  });

  it("band half-width equals relativeUncertainty × z about the point", () => {
    const v = valueLot(wineLafite2010, lotLafite, lafiteObservations, { z: 2 });
    const half = v.relativeUncertainty.times(2);
    expectClose(v.bandFraction, half.toNumber());
    const expectedHigh = v.pointEstimate.amount.times(half.plus(1));
    const expectedLow = v.pointEstimate.amount.times(new Decimal(1).minus(half));
    expectClose(v.high.amount, expectedHigh.toNumber(), 1e-6);
    expectClose(v.low.amount, expectedLow.toNumber(), 1e-6);
  });

  it("widens the band for weak provenance, all else equal", () => {
    const strong = WineLot.parse({ ...lotLafite, provenance: provenancePristine });
    const weak = WineLot.parse({ ...lotLafite, provenance: provenanceWeak });
    const vStrong = valueLot(wineLafite2010, strong, lafiteObservations);
    const vWeak = valueLot(wineLafite2010, weak, lafiteObservations);
    expect(vWeak.bandFraction.greaterThan(vStrong.bandFraction)).toBe(true);
  });

  it("widens the band for a noisy market, all else equal", () => {
    const lot = WineLot.parse({
      id: "lot-drc",
      wineId: "wine-drc-romanee-2015",
      quantity: 1,
      costPerBottle: "10000",
      acquiredOn: "2020-01-01",
      provenance: provenanceReference,
    });
    const vNoisy = valueLot(wineDrcRomanee2015, lot, drcObservations);
    const refLafite = WineLot.parse({
      ...lotLafite,
      provenance: provenanceReference,
    });
    const vCalm = valueLot(wineLafite2010, refLafite, lafiteObservations);
    expect(vNoisy.bandFraction.greaterThan(vCalm.bandFraction)).toBe(true);
  });

  it("never lets the lower bound go negative", () => {
    // Huge z forces band fraction > 1; low must floor at 0.
    const v = valueLot(wineLafite2010, lotLafite, lafiteObservations, { z: 100 });
    expect(v.low.amount.greaterThanOrEqualTo(0)).toBe(true);
    expect(v.low.amount.toNumber()).toBe(0);
  });

  it("applies a volatility floor so a single-quote, clean lot still has a band", () => {
    const v = valueLot(wineKrugNv, lotKrug, krugObservations);
    // dispersion 0, but floor keeps a nonzero band
    expect(v.bandFraction.greaterThan(0)).toBe(true);
    expect(v.relativeUncertainty.greaterThanOrEqualTo(0.02)).toBe(true);
  });

  it("computes unrealized gain vs. cost basis", () => {
    const v = valueLot(wineLafite2010, lotLafite, lafiteObservations);
    const costBasis = new Decimal(lotLafite.costPerBottle).times(lotLafite.quantity);
    const expected = v.pointEstimate.amount.minus(costBasis);
    expectClose(v.unrealizedGain.amount, expected.toNumber(), 1e-6);
    expect(v.unrealizedGain.amount.greaterThan(0)).toBe(true);
  });

  it("model uncertainty widens the band monotonically", () => {
    const base = valueLot(wineLafite2010, lotLafite, lafiteObservations);
    const withModel = valueLot(wineLafite2010, lotLafite, lafiteObservations, {
      modelUncertainty: 0.1,
    });
    expect(withModel.bandFraction.greaterThan(base.bandFraction)).toBe(true);
  });
});

describe("valueLotWithIndex reuse", () => {
  it("matches valueLot when given the same index", () => {
    const index = buildWineIndex(lafiteObservations);
    const a = valueLotWithIndex(wineLafite2010, lotLafite, index);
    const b = valueLot(wineLafite2010, lotLafite, lafiteObservations);
    expect(a.pointEstimate.amount.equals(b.pointEstimate.amount)).toBe(true);
    expect(a.bandFraction.equals(b.bandFraction)).toBe(true);
  });
});

describe("valueCellar", () => {
  it("throws on an empty list", () => {
    expect(() => valueCellar([])).toThrow(/at least one/);
  });

  it("sums point estimates, bounds, and gains across lots", () => {
    const v1 = valueLot(wineLafite2010, lotLafite, lafiteObservations);
    const v2 = valueLot(wineLafite2010, lotLafiteMagnum, lafiteObservations);
    const cellar = valueCellar([v1, v2]);
    expect(cellar.currency).toBe("GBP");
    expectClose(
      cellar.pointEstimate.amount,
      v1.pointEstimate.amount.plus(v2.pointEstimate.amount).toNumber(),
      1e-6,
    );
    expectClose(
      cellar.low.amount,
      v1.low.amount.plus(v2.low.amount).toNumber(),
      1e-6,
    );
    expectClose(
      cellar.high.amount,
      v1.high.amount.plus(v2.high.amount).toNumber(),
      1e-6,
    );
    expectClose(
      cellar.unrealizedGain.amount,
      v1.unrealizedGain.amount.plus(v2.unrealizedGain.amount).toNumber(),
      1e-6,
    );
    // Conservative aggregation: cellar band brackets the total point estimate.
    expect(cellar.low.amount.lessThan(cellar.pointEstimate.amount)).toBe(true);
    expect(cellar.high.amount.greaterThan(cellar.pointEstimate.amount)).toBe(true);
  });

  it("rejects mixed currencies", () => {
    const wineUsd = Wine.parse({ ...wineLafite2010, id: "wine-usd", currency: "USD" });
    const lotUsd = WineLot.parse({ ...lotLafite, id: "lot-usd", wineId: "wine-usd" });
    const vGbp = valueLot(wineLafite2010, lotLafite, lafiteObservations);
    const vUsd = valueLot(wineUsd, lotUsd, lafiteObservations);
    expect(() => valueCellar([vGbp, vUsd])).toThrow(/mixed currencies/);
  });
});

describe("adversarial edge cases", () => {
  it("buildWineIndex is order-independent for equal-date observations (deterministic tie-break)", () => {
    const a = buildWineIndex([
      PriceObservation.parse({ date: "2023-01-01", pricePerBottle: "120" }),
      PriceObservation.parse({ date: "2023-01-01", pricePerBottle: "100" }),
    ]);
    const b = buildWineIndex([
      PriceObservation.parse({ date: "2023-01-01", pricePerBottle: "100" }),
      PriceObservation.parse({ date: "2023-01-01", pricePerBottle: "120" }),
    ]);
    // Same-date inputs sort by price ascending regardless of input order:
    // base is the lower price (100), latest the higher (120).
    expect(a.points.map((p) => p.price.toFixed())).toEqual(["100", "120"]);
    expect(b.points.map((p) => p.price.toFixed())).toEqual(["100", "120"]);
    expect(a.latestPrice.toFixed()).toBe(b.latestPrice.toFixed());
    expectClose(a.totalReturn, b.totalReturn.toNumber());
  });

  it("keeps full Decimal precision in the point estimate (no float drift)", () => {
    // price 1/3-style: 100/3 reference via three thirds is exact in Decimal.
    const obs = [
      PriceObservation.parse({ date: "2023-01-01", pricePerBottle: "0.1" }),
      PriceObservation.parse({ date: "2023-02-01", pricePerBottle: "0.2" }),
      PriceObservation.parse({ date: "2023-03-01", pricePerBottle: "0.3" }),
    ];
    const wine = Wine.parse({ ...wineLafite2010, id: "wine-prec" });
    const lot = WineLot.parse({
      id: "lot-prec",
      wineId: "wine-prec",
      quantity: 3,
      costPerBottle: "0.1",
      acquiredOn: "2023-01-01",
      provenance: provenanceReference,
    });
    const v = valueLot(wine, lot, obs);
    // reference 0.3, factor 1, ratio 1, qty 3 => exactly 0.9, not 0.8999999…
    expect(v.pointEstimate.amount.toFixed()).toBe("0.9");
  });

  it("valueLotWithIndex lets one index serve many lots identically", () => {
    const index = buildWineIndex(lafiteObservations);
    const v1 = valueLotWithIndex(wineLafite2010, lotLafite, index);
    const v2 = valueLotWithIndex(wineLafite2010, lotLafite, index);
    expect(v1.pointEstimate.amount.equals(v2.pointEstimate.amount)).toBe(true);
    expect(v1.high.amount.equals(v2.high.amount)).toBe(true);
    expect(v1.low.amount.equals(v2.low.amount)).toBe(true);
  });

  it("rejects a non-finite z and non-finite model uncertainty", () => {
    expect(() =>
      valueLot(wineLafite2010, lotLafite, lafiteObservations, {
        z: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/z must be/);
    expect(() =>
      valueLot(wineLafite2010, lotLafite, lafiteObservations, {
        modelUncertainty: Number.NaN,
      }),
    ).toThrow(/modelUncertainty/);
  });

  it("a single-lot cellar equals that lot's own valuation", () => {
    const v = valueLot(wineLafite2010, lotLafite, lafiteObservations);
    const cellar = valueCellar([v]);
    expect(cellar.pointEstimate.amount.equals(v.pointEstimate.amount)).toBe(true);
    expect(cellar.low.amount.equals(v.low.amount)).toBe(true);
    expect(cellar.high.amount.equals(v.high.amount)).toBe(true);
    expect(cellar.unrealizedGain.amount.equals(v.unrealizedGain.amount)).toBe(true);
  });

  it("unrealized gain can be negative when the market falls below cost", () => {
    const expensiveLot = WineLot.parse({
      ...lotLafite,
      id: "lot-overpaid",
      provenance: provenanceReference,
      costPerBottle: "5000",
    });
    const v = valueLot(wineLafite2010, expensiveLot, lafiteObservations);
    expect(v.unrealizedGain.amount.lessThan(0)).toBe(true);
  });
});

describe("determinism", () => {
  it("produces identical output across repeated runs (offline, no clock)", () => {
    const a = JSON.stringify(
      valueLot(wineLafite2010, lotLafite, lafiteObservations).pointEstimate,
    );
    const b = JSON.stringify(
      valueLot(wineLafite2010, lotLafite, lafiteObservations).pointEstimate,
    );
    expect(a).toBe(b);
  });
});
