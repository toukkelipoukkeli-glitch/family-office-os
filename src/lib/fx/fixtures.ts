import { FrankfurterResponse } from "./primitives";
import { RateTable } from "./rates";

/**
 * Deterministic, offline FX fixtures. These mirror the exact wire shape of the
 * frankfurter.dev API so the adapter can be exercised without any network call,
 * and they are parsed through {@link FrankfurterResponse} in tests so the
 * fixtures themselves stay valid.
 *
 * All rates are fictional-but-plausible illustrative values, not live market
 * data. READ-ONLY: used to report converted values, never to trade.
 */

/** Latest-rates response anchored to EUR (the default reporting base). */
export const eurLatestResponse: FrankfurterResponse = FrankfurterResponse.parse({
  amount: 1,
  base: "EUR",
  date: "2026-06-18",
  rates: {
    USD: 1.08,
    GBP: 0.85,
    CHF: 0.96,
    JPY: 168.0,
    SEK: 11.25,
    NOK: 11.6,
  },
});

/** Historical EUR rates for an earlier date, to exercise the dated endpoint. */
export const eurHistoricalResponse: FrankfurterResponse =
  FrankfurterResponse.parse({
    amount: 1,
    base: "EUR",
    date: "2026-01-02",
    rates: {
      USD: 1.04,
      GBP: 0.83,
      CHF: 0.94,
      JPY: 162.0,
    },
  });

/**
 * A response where `amount` is not 1, exercising normalization back to a
 * per-unit-of-base rate in {@link RateTable.fromFrankfurter}.
 */
export const usdAmount100Response: FrankfurterResponse =
  FrankfurterResponse.parse({
    amount: 100,
    base: "USD",
    date: "2026-06-18",
    rates: {
      EUR: 92.0, // 100 USD -> 92 EUR, i.e. 0.92 EUR per USD
      GBP: 78.0,
    },
  });

/** A ready-to-use {@link RateTable} built from {@link eurLatestResponse}. */
export const eurLatestTable: RateTable =
  RateTable.fromFrankfurter(eurLatestResponse);
