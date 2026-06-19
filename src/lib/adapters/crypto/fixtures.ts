import type { SimplePriceResponse } from "./schema";

/**
 * Offline fixtures captured from CoinGecko's keyless `/simple/price` endpoint.
 *
 * These are static snapshots used to test the adapter deterministically without
 * hitting the live API (see AGENTS.md: data adapters are tested against
 * fixtures). Values are representative, not live.
 */

/**
 * `/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,eur`
 * `&include_market_cap=true&include_24hr_change=true&include_last_updated_at=true`
 */
export const simplePriceFixture: SimplePriceResponse = {
  bitcoin: {
    usd: 64231.42,
    usd_market_cap: 1267000000000,
    usd_24h_change: -1.2345,
    eur: 59012.1,
    eur_market_cap: 1164000000000,
    eur_24h_change: -1.05,
    last_updated_at: 1718800000,
  },
  ethereum: {
    usd: 3421.07,
    usd_market_cap: 411000000000,
    usd_24h_change: 2.5,
    eur: 3143.0,
    eur_market_cap: 377000000000,
    eur_24h_change: 2.31,
    last_updated_at: 1718800000,
  },
};

/** A minimal price-only response (no market cap / change / timestamp). */
export const priceOnlyFixture: SimplePriceResponse = {
  bitcoin: { usd: 64231.42 },
};

/**
 * A response where the price is a value that loses precision as a binary
 * float (`0.1`). Used to prove the parser produces the exact decimal `0.1`.
 */
export const lowPricePennyFixture: SimplePriceResponse = {
  // A fictional sub-cent token priced at exactly 0.1 USD.
  "penny-token": { usd: 0.1 },
};
