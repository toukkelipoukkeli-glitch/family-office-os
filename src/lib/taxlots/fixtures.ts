import type { Ledger } from "./taxlots";

/**
 * Deterministic sample ledger for the tax-lot explorer and tests.
 *
 * Three AAPL lots acquired at rising prices across two years, then two partial
 * sales. The spread of acquisition dates and unit costs is chosen so FIFO,
 * LIFO, and HIFO each select different lots — making the method differences
 * visible in the UI and assertable in tests. The 2022 lots are long-term as of
 * the 2024 sales; the 2024-acquired lot is short-term.
 *
 * READ-ONLY product: this is illustrative sample data, not a real position.
 */
export const sampleLedger: Ledger = {
  currency: "USD",
  acquisitions: [
    {
      id: "lot-a",
      symbol: "AAPL",
      date: "2022-01-10",
      quantity: "100",
      cost: "12000", // $120.00 / sh
      note: "Initial buy",
    },
    {
      id: "lot-b",
      symbol: "AAPL",
      date: "2022-09-15",
      quantity: "50",
      cost: "8000", // $160.00 / sh
      note: "Add on dip",
    },
    {
      id: "lot-c",
      symbol: "AAPL",
      date: "2024-03-01",
      quantity: "80",
      cost: "14400", // $180.00 / sh
      note: "Top-up",
    },
  ],
  disposals: [
    {
      id: "sell-1",
      symbol: "AAPL",
      date: "2024-06-01",
      quantity: "120",
      proceeds: "24000", // $200.00 / sh
      // For spec-id we draw from the highest-cost lots first.
      picks: [
        { lotId: "lot-c", quantity: "80" },
        { lotId: "lot-b", quantity: "40" },
      ],
    },
  ],
};

/** A per-symbol valuation price (per unit) used for unrealized gains. */
export const samplePrices: Record<string, string> = {
  AAPL: "210", // $210.00 / sh mark
};

/** The valuation date used by the explorer's unrealized column. */
export const sampleAsOf = "2024-06-15";
