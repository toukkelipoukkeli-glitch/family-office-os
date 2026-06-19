import { describe, expect, it } from "vitest";

import { Money } from "../money";
import {
  ASSET_CLASSES,
  AssetClass,
  isCollectibleAssetClass,
  isLiquidAssetClass,
} from "./asset-class";
import {
  cashHolding,
  equityHolding,
  lotAaplA,
  samplePortfolio,
  valAaplMarket,
  wineHolding,
} from "./fixtures";
import { Holding } from "./holding";
import { Lot } from "./lot";
import { Portfolio } from "./portfolio";
import {
  CurrencyCode,
  DecimalString,
  IsoDate,
  IsoDateTime,
  MoneySchema,
  NonNegativeDecimalString,
} from "./primitives";
import {
  ConfidenceLevel,
  Valuation,
  ValuationSource,
  defaultConfidenceForSource,
} from "./valuation";

describe("primitives: CurrencyCode", () => {
  it("normalizes casing and whitespace", () => {
    expect(CurrencyCode.parse(" usd ")).toBe("USD");
  });
  it("rejects non 3-letter codes", () => {
    expect(CurrencyCode.safeParse("US").success).toBe(false);
    expect(CurrencyCode.safeParse("DOLLAR").success).toBe(false);
    expect(CurrencyCode.safeParse("12$").success).toBe(false);
  });
});

describe("primitives: DecimalString / NonNegativeDecimalString", () => {
  it("accepts signed and fractional decimals", () => {
    expect(DecimalString.parse("-10.25")).toBe("-10.25");
    expect(DecimalString.parse("42")).toBe("42");
  });
  it("rejects non-numeric junk", () => {
    expect(DecimalString.safeParse("1.2.3").success).toBe(false);
    expect(DecimalString.safeParse("abc").success).toBe(false);
    expect(DecimalString.safeParse("").success).toBe(false);
  });
  it("non-negative rejects a leading minus", () => {
    expect(NonNegativeDecimalString.safeParse("-1").success).toBe(false);
    expect(NonNegativeDecimalString.parse("0.5")).toBe("0.5");
  });
});

describe("primitives: IsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(IsoDate.parse("2026-02-28")).toBe("2026-02-28");
  });
  it("rejects malformed and impossible dates", () => {
    expect(IsoDate.safeParse("2026-2-1").success).toBe(false);
    expect(IsoDate.safeParse("2026-02-30").success).toBe(false);
    expect(IsoDate.safeParse("2026-13-01").success).toBe(false);
  });
});

describe("primitives: IsoDateTime", () => {
  it("accepts RFC-3339 timestamps", () => {
    expect(IsoDateTime.parse("2026-06-18T16:00:00Z")).toBe(
      "2026-06-18T16:00:00Z",
    );
  });
  it("rejects unparseable timestamps", () => {
    expect(IsoDateTime.safeParse("not-a-date").success).toBe(false);
  });
});

describe("primitives: MoneySchema round-trips with Money.toJSON", () => {
  it("parses the exact shape Money serializes to", () => {
    const json = Money.of("10.99", "usd").toJSON();
    const parsed = MoneySchema.parse(json);
    expect(parsed).toEqual({ amount: "10.99", currency: "USD" });
  });
  it("rejects unknown keys (strict)", () => {
    const res = MoneySchema.safeParse({
      amount: "1",
      currency: "USD",
      extra: true,
    });
    expect(res.success).toBe(false);
  });
  it("rejects a float amount that is not a string", () => {
    expect(
      MoneySchema.safeParse({ amount: 10.99, currency: "USD" }).success,
    ).toBe(false);
  });
});

describe("AssetClass", () => {
  it("contains all 13 family-office asset classes", () => {
    expect(ASSET_CLASSES).toHaveLength(13);
    for (const ac of [
      "equity",
      "bond",
      "etf",
      "cash",
      "crypto",
      "forest",
      "wine",
      "art",
      "lego",
      "car",
      "vineyard",
      "pe",
      "watch",
    ] as const) {
      expect(AssetClass.parse(ac)).toBe(ac);
    }
  });
  it("rejects unknown asset classes", () => {
    expect(AssetClass.safeParse("realestate").success).toBe(false);
  });
  it("classifies liquidity correctly", () => {
    expect(isLiquidAssetClass("equity")).toBe(true);
    expect(isLiquidAssetClass("crypto")).toBe(true);
    expect(isCollectibleAssetClass("wine")).toBe(true);
    expect(isCollectibleAssetClass("watch")).toBe(true);
    expect(isLiquidAssetClass("wine")).toBe(false);
  });
});

describe("Valuation", () => {
  it("parses a valid market valuation fixture", () => {
    expect(Valuation.parse(valAaplMarket)).toEqual(valAaplMarket);
  });
  it("requires confidence and source", () => {
    const noConfidence: Record<string, unknown> = { ...valAaplMarket };
    delete noConfidence.confidence;
    expect(Valuation.safeParse(noConfidence).success).toBe(false);
  });
  it("rejects confidenceScore outside [0,1]", () => {
    expect(
      Valuation.safeParse({ ...valAaplMarket, confidenceScore: 1.5 }).success,
    ).toBe(false);
    expect(
      Valuation.safeParse({ ...valAaplMarket, confidenceScore: -0.1 }).success,
    ).toBe(false);
  });
  it("validates source and confidence enums", () => {
    expect(ValuationSource.safeParse("market").success).toBe(true);
    expect(ValuationSource.safeParse("guess").success).toBe(false);
    expect(ConfidenceLevel.safeParse("high").success).toBe(true);
    expect(ConfidenceLevel.safeParse("certain").success).toBe(false);
  });
  it("maps sources to default confidence", () => {
    expect(defaultConfidenceForSource("market")).toBe("high");
    expect(defaultConfidenceForSource("appraisal")).toBe("medium");
    expect(defaultConfidenceForSource("manual")).toBe("low");
    expect(defaultConfidenceForSource("model")).toBe("low");
    expect(defaultConfidenceForSource("cost")).toBe("low");
  });
});

describe("Lot", () => {
  it("parses a valid lot fixture", () => {
    expect(Lot.parse(lotAaplA)).toEqual(lotAaplA);
  });
  it("rejects a negative quantity", () => {
    expect(Lot.safeParse({ ...lotAaplA, quantity: "-1" }).success).toBe(false);
  });
  it("rejects an invalid acquisition date", () => {
    expect(
      Lot.safeParse({ ...lotAaplA, acquiredOn: "2021-13-40" }).success,
    ).toBe(false);
  });
  it("rejects fees in a different currency than unitCost", () => {
    const res = Lot.safeParse({
      ...lotAaplA,
      fees: { amount: "1.00", currency: "EUR" },
    });
    expect(res.success).toBe(false);
  });
});

describe("Holding", () => {
  it("parses valid holding fixtures across asset classes", () => {
    expect(Holding.parse(equityHolding)).toEqual(equityHolding);
    expect(Holding.parse(wineHolding)).toEqual(wineHolding);
  });
  it("defaults lots, valuations, and tags to empty arrays", () => {
    const parsed = Holding.parse({
      id: "h1",
      name: "Bare",
      assetClass: "cash",
      currency: "USD",
    });
    expect(parsed.lots).toEqual([]);
    expect(parsed.valuations).toEqual([]);
    expect(parsed.tags).toEqual([]);
  });
  it("rejects an empty name", () => {
    expect(Holding.safeParse({ ...cashHolding, name: "  " }).success).toBe(
      false,
    );
  });
  it("rejects duplicate lot ids", () => {
    const res = Holding.safeParse({
      ...equityHolding,
      lots: [lotAaplA, lotAaplA],
    });
    expect(res.success).toBe(false);
  });
  it("rejects duplicate valuation ids", () => {
    const res = Holding.safeParse({
      ...equityHolding,
      valuations: [valAaplMarket, valAaplMarket],
    });
    expect(res.success).toBe(false);
  });
  it("rejects unknown keys (strict)", () => {
    expect(
      Holding.safeParse({ ...cashHolding, mystery: 1 }).success,
    ).toBe(false);
  });
});

describe("Portfolio", () => {
  it("parses the sample portfolio fixture", () => {
    const parsed = Portfolio.parse(samplePortfolio);
    expect(parsed.holdings).toHaveLength(3);
    expect(parsed.baseCurrency).toBe("USD");
  });
  it("defaults holdings to an empty array", () => {
    const parsed = Portfolio.parse({
      id: "pf",
      name: "Empty",
      baseCurrency: "eur",
    });
    expect(parsed.holdings).toEqual([]);
    expect(parsed.baseCurrency).toBe("EUR");
  });
  it("rejects duplicate holding ids", () => {
    const res = Portfolio.safeParse({
      ...samplePortfolio,
      holdings: [equityHolding, equityHolding],
    });
    expect(res.success).toBe(false);
  });
  it("rejects an invalid base currency", () => {
    expect(
      Portfolio.safeParse({ ...samplePortfolio, baseCurrency: "US" }).success,
    ).toBe(false);
  });
  it("propagates nested holding validation errors", () => {
    const res = Portfolio.safeParse({
      ...samplePortfolio,
      holdings: [{ ...equityHolding, assetClass: "spaceship" }],
    });
    expect(res.success).toBe(false);
  });
});

describe("adversarial edge cases", () => {
  it("DecimalString rejects internal whitespace and stray signs", () => {
    expect(DecimalString.safeParse("1 0").success).toBe(false);
    expect(DecimalString.safeParse("+5").success).toBe(false);
    expect(DecimalString.safeParse("--5").success).toBe(false);
    expect(DecimalString.safeParse("5.").success).toBe(false);
    expect(DecimalString.safeParse(".5").success).toBe(false);
    expect(DecimalString.safeParse("1e3").success).toBe(false);
  });
  it("DecimalString trims surrounding whitespace before validating", () => {
    expect(DecimalString.parse("  -3.50  ")).toBe("-3.50");
  });
  it("NonNegativeDecimalString rejects negative zero but accepts zero", () => {
    expect(NonNegativeDecimalString.parse("0")).toBe("0");
    expect(NonNegativeDecimalString.parse("0.00")).toBe("0.00");
    expect(NonNegativeDecimalString.safeParse("-0").success).toBe(false);
  });
  it("IsoDate handles leap years correctly", () => {
    expect(IsoDate.parse("2024-02-29")).toBe("2024-02-29");
    expect(IsoDate.safeParse("2025-02-29").success).toBe(false);
    expect(IsoDate.safeParse("2100-02-29").success).toBe(false); // not a leap year
    expect(IsoDate.parse("2000-02-29")).toBe("2000-02-29"); // is a leap year
  });
  it("IsoDate rejects out-of-range month and day zero", () => {
    expect(IsoDate.safeParse("2026-00-10").success).toBe(false);
    expect(IsoDate.safeParse("2026-06-00").success).toBe(false);
  });
  it("IsoDateTime rejects an empty string", () => {
    expect(IsoDateTime.safeParse("").success).toBe(false);
    expect(IsoDateTime.safeParse("   ").success).toBe(false);
  });
  it("CurrencyCode rejects numeric and mixed-length inputs after trim", () => {
    expect(CurrencyCode.safeParse(" usdt ").success).toBe(false); // 4 letters
    expect(CurrencyCode.safeParse("us d").success).toBe(false);
  });
  it("MoneySchema rejects a missing currency and a NaN-shaped amount", () => {
    expect(MoneySchema.safeParse({ amount: "1" }).success).toBe(false);
    expect(MoneySchema.safeParse({ amount: "NaN", currency: "USD" }).success).toBe(
      false,
    );
  });
  it("Valuation rejects NaN confidenceScore and accepts the [0,1] bounds", () => {
    expect(
      Valuation.safeParse({ ...valAaplMarket, confidenceScore: Number.NaN })
        .success,
    ).toBe(false);
    expect(
      Valuation.safeParse({ ...valAaplMarket, confidenceScore: 0 }).success,
    ).toBe(true);
    expect(
      Valuation.safeParse({ ...valAaplMarket, confidenceScore: 1 }).success,
    ).toBe(true);
  });
  it("Lot accepts matching fees currency and a zero quantity", () => {
    expect(
      Lot.safeParse({
        ...lotAaplA,
        quantity: "0",
        fees: { amount: "0", currency: "USD" },
      }).success,
    ).toBe(true);
  });
  it("Holding rejects an empty-string tag", () => {
    expect(
      Holding.safeParse({ ...cashHolding, tags: ["ok", "  "] }).success,
    ).toBe(false);
  });
  it("Holding allows a holding whose lots are denominated in another currency (multi-currency by design)", () => {
    // Holdings may hold lots in a different currency than the holding's
    // reporting currency; the model intentionally does not force a match.
    const res = Holding.safeParse({
      ...cashHolding,
      lots: [
        {
          id: "lot-x",
          quantity: "1",
          unitCost: { amount: "1.00", currency: "EUR" },
          acquiredOn: "2024-01-01",
        },
      ],
    });
    expect(res.success).toBe(true);
  });
  it("Lot rejects a negative unitCost and negative fees", () => {
    expect(
      Lot.safeParse({
        ...lotAaplA,
        unitCost: { amount: "-1.00", currency: "USD" },
      }).success,
    ).toBe(false);
    expect(
      Lot.safeParse({
        ...lotAaplA,
        fees: { amount: "-0.01", currency: "USD" },
      }).success,
    ).toBe(false);
  });
  it("Valuation rejects a negative value amount", () => {
    expect(
      Valuation.safeParse({
        ...valAaplMarket,
        value: { amount: "-100.00", currency: "USD" },
      }).success,
    ).toBe(false);
  });
  it("IsoDateTime rejects loose non-ISO formats but accepts Z and offset", () => {
    expect(IsoDateTime.safeParse("6/15/2019").success).toBe(false);
    expect(IsoDateTime.safeParse("2019-06-15 12:00:00").success).toBe(false);
    expect(IsoDateTime.parse("2026-06-18T16:00:00Z")).toBe(
      "2026-06-18T16:00:00Z",
    );
    expect(IsoDateTime.parse("2026-06-18T16:00:00+02:00")).toBe(
      "2026-06-18T16:00:00+02:00",
    );
  });
  it("Portfolio reports the index of the first duplicate holding id", () => {
    const res = Portfolio.safeParse({
      ...samplePortfolio,
      holdings: [equityHolding, wineHolding, equityHolding],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const dup = res.error.issues.find((i) =>
        i.message.includes("duplicate holding id"),
      );
      expect(dup?.path).toEqual(["holdings", 2, "id"]);
    }
  });
});

describe("end-to-end: fixtures are internally consistent", () => {
  it("every holding currency is a valid code and every valuation has a confidence", () => {
    for (const h of samplePortfolio.holdings) {
      expect(CurrencyCode.safeParse(h.currency).success).toBe(true);
      for (const v of h.valuations) {
        expect(ConfidenceLevel.safeParse(v.confidence).success).toBe(true);
      }
    }
  });
});
