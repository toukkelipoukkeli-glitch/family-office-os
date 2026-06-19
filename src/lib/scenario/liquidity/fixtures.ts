import type { FxRateTable } from "@/lib/allocation";
import type { Portfolio } from "@/lib/model/portfolio";
import { seededPortfolio } from "@/fixtures/portfolio";

/**
 * Deterministic, offline fixtures for liquidity / capital-call tests and
 * downstream UI. Everything here is a fixed literal — no live FX, no wall
 * clock. READ-ONLY product: these only describe a book and a hypothetical call.
 *
 * The {@link seededPortfolio} (base USD) spans all 13 asset classes. With the
 * FX table below the base-currency liquidity rolls up, per tier, to:
 *
 *   cash       (cash USD 250k + cash CHF 85k @ 1.10)        = 343,500 USD
 *   near-cash  (bond EUR 201,400 @ 1.08)                    = 217,512 USD
 *   marketable (equity 108,625 + etf 189,000 + crypto 303,750) = 601,375 USD
 *   illiquid   (forest, wine, art, lego, car, vineyard, pe, watch)
 *
 * Numbers are pinned by the fixed-seed snapshot test, so a fixture change is a
 * visible, intentional diff.
 */

/** The seeded family-office book, reported in USD. */
export const liquidityPortfolio: Portfolio = seededPortfolio;

/**
 * Base = USD. Rates are exact decimal strings (units of USD per 1 unit of the
 * quoted currency). Covers every non-USD currency the seeded book uses.
 */
export const liquidityFxTable: FxRateTable = {
  base: "USD",
  rates: {
    EUR: "1.08",
    GBP: "1.27",
    CHF: "1.10",
  },
};
