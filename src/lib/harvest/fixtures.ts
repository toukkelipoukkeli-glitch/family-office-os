import type { Ledger } from "../taxlots";

/**
 * Deterministic sample ledger for the tax-loss-harvesting finder and its tests.
 *
 * Four symbols, chosen so the harvest scan exercises every branch:
 *
 * - **NVDA** — one big winner lot (up vs. basis): NOT a harvest candidate.
 * - **TSLA** — bought high, now underwater: a clean harvestable loss with NO
 *   purchases inside the wash-sale window.
 * - **BABA** — also underwater, BUT a small "add" lot was bought 12 days before
 *   the harvest date `asOf`, so harvesting it now would trip the wash-sale rule:
 *   a FLAGGED candidate.
 * - **META** — underwater, with a replacement buy 20 days *after* `asOf` (the
 *   wash-sale window is symmetric, ±30 days), so it is ALSO flagged.
 *
 * READ-ONLY product: illustrative sample data, not a real position.
 */
export const sampleLedger: Ledger = {
  currency: "USD",
  acquisitions: [
    // NVDA: a winner — market value will exceed basis, so not harvestable.
    {
      id: "nvda-1",
      symbol: "NVDA",
      date: "2023-02-10",
      quantity: "100",
      cost: "25000", // $250.00 / sh
      note: "NVDA core",
    },
    // TSLA: underwater, no nearby purchase -> clean harvest.
    {
      id: "tsla-1",
      symbol: "TSLA",
      date: "2024-01-05",
      quantity: "200",
      cost: "56000", // $280.00 / sh
      note: "TSLA buy at the top",
    },
    // BABA: underwater core lot...
    {
      id: "baba-1",
      symbol: "BABA",
      date: "2023-08-01",
      quantity: "300",
      cost: "33000", // $110.00 / sh
      note: "BABA core",
    },
    // ...plus a small add 12 days before asOf -> wash-sale conflict.
    {
      id: "baba-2",
      symbol: "BABA",
      date: "2024-05-22", // asOf is 2024-06-03 -> 12 days before
      quantity: "20",
      cost: "1600", // $80.00 / sh
      note: "BABA dip add (triggers wash sale)",
    },
    // META: underwater, with a replacement buy AFTER asOf.
    {
      id: "meta-1",
      symbol: "META",
      date: "2024-02-15",
      quantity: "50",
      cost: "26000", // $520.00 / sh
      note: "META buy",
    },
    {
      id: "meta-2",
      symbol: "META",
      date: "2024-06-23", // 20 days after asOf -> wash-sale conflict
      quantity: "10",
      cost: "4500", // $450.00 / sh
      note: "META replacement buy (triggers wash sale)",
    },
  ],
  disposals: [],
};

/**
 * Per-symbol valuation prices (per unit). Chosen so NVDA is up and the other
 * three are down vs. their cost basis.
 */
export const samplePrices: Record<string, string> = {
  NVDA: "900", // up from $250
  TSLA: "175", // down from $280  -> loss of ($280-$175)*200 = $21,000
  BABA: "72", // down from $110   -> core loss of ($110-$72)*300 = $11,400
  META: "470", // down from $520  -> loss of ($520-$470)*50 = $2,500
};

/** The hypothetical harvest (valuation) date the finder runs for. */
export const sampleAsOf = "2024-06-03";
