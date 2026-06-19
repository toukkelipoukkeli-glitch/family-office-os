import { describe, expect, it, vi } from "vitest";
import { Decimal } from "decimal.js";

import { Money } from "../money";
import {
  FrankfurterResponse,
  RateString,
} from "./primitives";
import { RateTable } from "./rates";
import {
  FRANKFURTER_BASE_URL,
  FetchLike,
  FxAdapter,
} from "./adapter";
import { normalizeAmounts, totalInBase } from "./normalize";
import {
  eurHistoricalResponse,
  eurLatestResponse,
  eurLatestTable,
  usdAmount100Response,
} from "./fixtures";

describe("FX primitives", () => {
  it("accepts positive rate strings and rejects zero/negative/garbage", () => {
    expect(RateString.parse("1.0837")).toBe("1.0837");
    expect(RateString.parse("168")).toBe("168");
    expect(() => RateString.parse("0")).toThrow();
    expect(() => RateString.parse("-1.2")).toThrow();
    expect(() => RateString.parse("abc")).toThrow();
  });

  it("validates a well-formed frankfurter payload", () => {
    const parsed = FrankfurterResponse.parse({
      amount: 1,
      base: "eur",
      date: "2026-06-18",
      rates: { usd: 1.08 },
    });
    // currency codes are normalized to uppercase
    expect(parsed.base).toBe("EUR");
    expect(parsed.rates.USD).toBe(1.08);
  });

  it("rejects malformed upstream payloads", () => {
    expect(() =>
      FrankfurterResponse.parse({ base: "EUR", date: "2026-06-18", rates: {} }),
    ).toThrow(); // missing amount
    expect(() =>
      FrankfurterResponse.parse({
        amount: 1,
        base: "EUR",
        date: "2026-13-99",
        rates: { USD: 1.08 },
      }),
    ).toThrow(); // impossible date
    expect(() =>
      FrankfurterResponse.parse({
        amount: 1,
        base: "EUR",
        date: "2026-06-18",
        rates: { USD: -1 },
      }),
    ).toThrow(); // negative rate
    expect(() =>
      FrankfurterResponse.parse({
        amount: 1,
        base: "EUR",
        date: "2026-06-18",
        rates: { USD: 1.08 },
        extra: true,
      }),
    ).toThrow(); // strict() rejects unknown keys
  });
});

describe("RateTable", () => {
  it("includes the base at rate 1 and lists currencies sorted", () => {
    const t = RateTable.of("EUR", { USD: "1.08", GBP: "0.85" }, "2026-06-18");
    expect(t.base).toBe("EUR");
    expect(t.date).toBe("2026-06-18");
    expect(t.rateFor("EUR").toString()).toBe("1");
    expect(t.currencies()).toEqual(["EUR", "GBP", "USD"]);
    expect(t.has("USD")).toBe(true);
    expect(t.has("AUD")).toBe(false);
  });

  it("normalizes a base code and lowercase quote codes", () => {
    const t = RateTable.of("eur", { usd: 1.08 });
    expect(t.base).toBe("EUR");
    expect(t.rateFor("usd").toString()).toBe("1.08");
  });

  it("rejects non-positive or non-finite rates", () => {
    expect(() => RateTable.of("EUR", { USD: 0 })).toThrow();
    expect(() => RateTable.of("EUR", { USD: -1 })).toThrow();
    expect(() => RateTable.of("EUR", { USD: Infinity })).toThrow();
    expect(() => RateTable.of("EUR", { USD: NaN })).toThrow();
  });

  it("rejects an explicit base rate that is not exactly 1", () => {
    expect(() => RateTable.of("EUR", { EUR: 1.01 })).toThrow();
    // an explicit base rate of exactly 1 is allowed
    expect(() => RateTable.of("EUR", { EUR: 1, USD: 1.08 })).not.toThrow();
  });

  it("throws when converting an unknown currency", () => {
    const t = RateTable.of("EUR", { USD: 1.08 });
    expect(() => t.rateFor("AUD")).toThrow(/No FX rate for AUD/);
    expect(() => t.crossRate("USD", "AUD")).toThrow();
  });

  it("converts base -> quote exactly", () => {
    const t = eurLatestTable;
    const eur = Money.of("100", "EUR");
    const usd = t.convert(eur, "USD");
    expect(usd.currency).toBe("USD");
    expect(usd.amount.toString()).toBe("108"); // 100 * 1.08
  });

  it("converts quote -> base by dividing through the base rate", () => {
    const t = eurLatestTable;
    const usd = Money.of("108", "USD");
    const eur = t.convert(usd, "EUR");
    // 108 USD / 1.08 = 100 EUR exactly
    expect(eur.amount.toString()).toBe("100");
  });

  it("cross-converts quote -> quote via triangulation", () => {
    const t = eurLatestTable; // USD 1.08, GBP 0.85 per EUR
    const usd = Money.of("100", "USD");
    const gbp = t.convert(usd, "GBP");
    // 100 USD -> GBP computed as 100 * 0.85 / 1.08 (division deferred to end)
    const expected = new Decimal(100).times("0.85").div("1.08");
    expect(gbp.amount.equals(expected)).toBe(true);
    expect(gbp.currency).toBe("GBP");
  });

  it("returns the same amount when converting to its own currency", () => {
    const t = eurLatestTable;
    const eur = Money.of("42.5", "EUR");
    expect(t.convert(eur, "EUR")).toBe(eur);
    const usd = Money.of("42.5", "USD");
    expect(t.convert(usd, "USD")).toBe(usd);
  });

  it("crossRate is the multiplicative inverse round-trip", () => {
    const t = eurLatestTable;
    const forward = t.crossRate("USD", "GBP");
    const back = t.crossRate("GBP", "USD");
    expect(forward.times(back).toDecimalPlaces(20).toNumber()).toBeCloseTo(1, 18);
  });

  it("preserves precision with no floating-point drift", () => {
    const t = RateTable.of("EUR", { JPY: "168.0" });
    const eur = Money.of("0.1", "EUR").plus(Money.of("0.2", "EUR"));
    // 0.1 + 0.2 is exactly 0.3 in Decimal, then * 168 = 50.4
    expect(t.convert(eur, "JPY").amount.toString()).toBe("50.4");
  });

  it("builds from a frankfurter response and normalizes by amount", () => {
    // amount: 100, 100 USD -> 92 EUR => 0.92 EUR per USD
    const t = RateTable.fromFrankfurter(usdAmount100Response);
    expect(t.base).toBe("USD");
    expect(t.rateFor("EUR").toString()).toBe("0.92");
    expect(t.rateFor("GBP").toString()).toBe("0.78");
    const usd = Money.of("100", "USD");
    expect(t.convert(usd, "EUR").amount.toString()).toBe("92");
  });

  it("exposes the observation date from a frankfurter response", () => {
    const t = RateTable.fromFrankfurter(eurHistoricalResponse);
    expect(t.date).toBe("2026-01-02");
    expect(t.rateFor("USD").toString()).toBe("1.04");
  });

  it("is frozen / immutable", () => {
    const t = RateTable.of("EUR", { USD: 1.08 });
    expect(Object.isFrozen(t)).toBe(true);
  });

  it("converts to its own currency even when that currency is absent from the table", () => {
    // The same-currency fast path must not require a rate lookup.
    const t = RateTable.of("EUR", { USD: 1.08 });
    const aud = Money.of("123.45", "AUD");
    const out = t.convert(aud, "AUD");
    expect(out).toBe(aud);
    expect(t.has("AUD")).toBe(false);
  });

  it("crossRate of a currency with itself is exactly 1", () => {
    const t = eurLatestTable;
    expect(t.crossRate("USD", "USD").toString()).toBe("1");
    expect(t.crossRate("EUR", "EUR").toString()).toBe("1");
  });

  it("converts negative amounts (liabilities) preserving sign and precision", () => {
    const t = eurLatestTable;
    const debt = Money.of("-100", "EUR");
    const usd = t.convert(debt, "USD");
    expect(usd.amount.toString()).toBe("-108");
    expect(usd.isNegative()).toBe(true);
  });

  it("round-trips an amount through a non-terminating cross rate exactly", () => {
    // 850 GBP -> EUR -> back to GBP must be exactly 850 thanks to deferred division.
    const t = eurLatestTable; // GBP 0.85 per EUR
    const gbp = Money.of("850", "GBP");
    const viaEur = t.convert(gbp, "EUR");
    expect(viaEur.amount.toString()).toBe("1000"); // 850 / 0.85
    const back = t.convert(viaEur, "GBP");
    expect(back.amount.toString()).toBe("850");
  });

  it("normalizes a frankfurter amount that yields a repeating decimal without throwing", () => {
    // amount 3, rate 1 => 1/3 EUR per unit: must build a finite Decimal (capped precision).
    const t = RateTable.fromFrankfurter(
      FrankfurterResponse.parse({
        amount: 3,
        base: "USD",
        date: "2026-06-18",
        rates: { EUR: 1 },
      }),
    );
    const r = t.rateFor("EUR");
    expect(r.isFinite()).toBe(true);
    // 1/3 is non-terminating, so it is captured at Decimal's configured
    // precision rather than blowing up; round-tripping is within tolerance.
    expect(r.times(3).toDecimalPlaces(10).toNumber()).toBeCloseTo(1, 9);
  });

  it("zero is rejected by RateTable.of with a descriptive error", () => {
    expect(() => RateTable.of("EUR", { USD: "0" })).toThrow(
      /must be a finite positive number/,
    );
  });

  it("rejects an invalid base currency code", () => {
    expect(() => RateTable.of("EURO", { USD: 1.08 })).toThrow();
    expect(() => RateTable.of("E", { USD: 1.08 })).toThrow();
  });

  it("rejects an invalid quote currency code", () => {
    expect(() => RateTable.of("EUR", { USDD: 1.08 })).toThrow();
  });

  it("currencies() returns a fresh array that cannot mutate internal state", () => {
    const t = RateTable.of("EUR", { USD: 1.08 });
    const first = t.currencies();
    first.push("ZZZ");
    expect(t.currencies()).toEqual(["EUR", "USD"]);
  });
});

describe("FX primitives — RateString strictness", () => {
  it("rejects exponential, whitespace-internal, and signed-positive forms", () => {
    expect(() => RateString.parse("1e3")).toThrow();
    expect(() => RateString.parse("1 .08")).toThrow();
    expect(() => RateString.parse("+1.08")).toThrow();
    expect(() => RateString.parse("")).toThrow();
    expect(() => RateString.parse(".5")).toThrow();
  });

  it("trims surrounding whitespace before validating", () => {
    expect(RateString.parse("  1.08  ")).toBe("1.08");
  });
});

/** Build a fixture-backed FetchLike that asserts the requested URL. */
function fixtureFetch(
  payload: unknown,
  opts: { ok?: boolean; status?: number; capture?: (url: string) => void } = {},
): FetchLike {
  return async (url: string) => {
    opts.capture?.(url);
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => payload,
    };
  };
}

describe("FxAdapter (offline, fixture-driven)", () => {
  it("fetches latest rates and returns a RateTable", async () => {
    let requested = "";
    const adapter = new FxAdapter({
      fetchImpl: fixtureFetch(eurLatestResponse, {
        capture: (u) => (requested = u),
      }),
    });
    const table = await adapter.fetchRates({ base: "EUR" });
    expect(requested).toBe(`${FRANKFURTER_BASE_URL}/latest?base=EUR`);
    expect(table.base).toBe("EUR");
    expect(table.rateFor("USD").toString()).toBe("1.08");
  });

  it("requests a dated endpoint and symbol filter", async () => {
    let requested = "";
    const adapter = new FxAdapter({
      baseUrl: "https://example.test/v1",
      fetchImpl: fixtureFetch(eurHistoricalResponse, {
        capture: (u) => (requested = u),
      }),
    });
    await adapter.fetchRates({
      base: "eur",
      date: "2026-01-02",
      symbols: ["usd", "gbp"],
    });
    expect(requested).toBe(
      "https://example.test/v1/2026-01-02?base=EUR&symbols=USD%2CGBP",
    );
  });

  it("throws on a non-ok HTTP response", async () => {
    const adapter = new FxAdapter({
      fetchImpl: fixtureFetch({}, { ok: false, status: 503 }),
    });
    await expect(adapter.fetchRates({ base: "EUR" })).rejects.toThrow(
      /FX request failed: 503/,
    );
  });

  it("rejects a malformed upstream payload via schema validation", async () => {
    const adapter = new FxAdapter({
      fetchImpl: fixtureFetch({ base: "EUR", rates: {} }),
    });
    await expect(adapter.fetchRates({ base: "EUR" })).rejects.toThrow();
  });

  it("validates the date param before building the URL", async () => {
    const spy = vi.fn();
    const adapter = new FxAdapter({ fetchImpl: fixtureFetch({}, { capture: spy }) });
    await expect(
      adapter.fetchRates({ base: "EUR", date: "2026-13-99" }),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("validates the base param before building the URL", async () => {
    const spy = vi.fn();
    const adapter = new FxAdapter({ fetchImpl: fixtureFetch({}, { capture: spy }) });
    await expect(
      adapter.fetchRates({ base: "EURO" }),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("uses the default frankfurter base url", () => {
    expect(FRANKFURTER_BASE_URL).toBe("https://api.frankfurter.dev/v1");
  });
});

describe("multi-currency normalization", () => {
  const table = eurLatestTable;
  const holdings = [
    Money.of("1000", "EUR"),
    Money.of("1080", "USD"), // -> 1000 EUR
    Money.of("850", "GBP"), // -> 1000 EUR
  ];

  it("normalizes each amount and keeps the original", () => {
    const rows = normalizeAmounts(holdings, table, "EUR");
    expect(rows).toHaveLength(3);
    expect(rows[0].converted.amount.toString()).toBe("1000");
    expect(rows[1].original.currency).toBe("USD");
    expect(rows[1].converted.currency).toBe("EUR");
    expect(rows[1].converted.amount.toString()).toBe("1000");
    expect(rows[2].converted.amount.toString()).toBe("1000");
  });

  it("totals a multi-currency list into the base currency", () => {
    const total = totalInBase(holdings, table, "EUR");
    expect(total.currency).toBe("EUR");
    expect(total.amount.toString()).toBe("3000");
  });

  it("totals into a non-base reporting currency", () => {
    // 3000 EUR worth -> USD at 1.08 = 3240 USD
    const total = totalInBase(holdings, table, "USD");
    expect(total.currency).toBe("USD");
    expect(total.amount.toString()).toBe("3240");
  });

  it("returns zero in the base for an empty list", () => {
    const total = totalInBase([], table, "EUR");
    expect(total.isZero()).toBe(true);
    expect(total.currency).toBe("EUR");
  });

  it("throws when a needed rate is missing", () => {
    const usdOnly = RateTable.of("EUR", { USD: 1.08 });
    expect(() =>
      totalInBase([Money.of("10", "AUD")], usdOnly, "EUR"),
    ).toThrow(/No FX rate for AUD/);
  });

  it("nets positive assets against negative liabilities across currencies", () => {
    // 1000 EUR asset minus a 1080 USD (=1000 EUR) liability nets to zero EUR.
    const total = totalInBase(
      [Money.of("1000", "EUR"), Money.of("-1080", "USD")],
      table,
      "EUR",
    );
    expect(total.isZero()).toBe(true);
    expect(total.currency).toBe("EUR");
  });

  it("normalizeAmounts accepts a lowercase base currency code", () => {
    const rows = normalizeAmounts([Money.of("1080", "USD")], table, "eur");
    expect(rows[0].converted.currency).toBe("EUR");
    expect(rows[0].converted.amount.toString()).toBe("1000");
  });

  it("totalInBase rejects an invalid base currency code", () => {
    expect(() => totalInBase(holdings, table, "EURO")).toThrow();
  });
});
