import type { Portfolio } from "../model/portfolio";
import { samplePortfolio } from "../model/fixtures";
import type { FxRateTable } from "./fx";

/**
 * Deterministic, offline fixtures for allocation tests and downstream UI.
 *
 * The {@link samplePortfolio} from the model has three holdings:
 *  - Apple Inc. (equity, USD) latest valuation 30,000 USD
 *  - Château Lafite (wine, EUR) latest valuation 7,200 EUR
 *  - USD Cash (cash, USD) latest valuation 250,000 USD
 *
 * With the rate table below (base USD, EUR = 1.10 USD) the base-currency
 * values are:
 *  - equity: 30,000 USD
 *  - wine:   7,920 USD (7,200 * 1.10)
 *  - cash:   250,000 USD
 *  - total:  287,920 USD
 */

/** Re-export the model's sample portfolio for convenience. */
export const allocationPortfolio: Portfolio = samplePortfolio;

/** Base = USD; EUR worth 1.10 USD, GBP worth 1.25 USD. */
export const usdRateTable: FxRateTable = {
  base: "USD",
  rates: {
    EUR: "1.10",
    GBP: "1.25",
  },
};
