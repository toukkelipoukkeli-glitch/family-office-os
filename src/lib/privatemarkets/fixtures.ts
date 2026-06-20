/**
 * Deterministic, offline private-markets commitment fixtures for m9-pe-lifecycle.
 *
 * A realistic family-office private-markets sleeve: a maturing buyout fund well
 * into its harvest period, a young venture fund still deep in its J-curve, and a
 * core real-assets fund throwing off steady distributions. Amounts are exact
 * literals (USD) chosen so the headline metrics are hand-computable in the tests.
 * Fixed literals only — no live API. READ-ONLY: describes positions, moves
 * nothing.
 */

import type { Commitment } from "./commitment";

/**
 * Mature buyout fund (vintage 2017), well into harvest.
 * Paid-in 9,000,000; distributed 11,500,000; NAV 4,000,000.
 *   DPI  = 11.5M / 9M  = 1.2777…
 *   RVPI = 4M   / 9M   = 0.4444…
 *   TVPI = 1.7222…
 *   Unfunded = 10M − 9M = 1,000,000
 */
export const buyoutFund: Commitment = {
  id: "pe-buyout-2017",
  name: "Evergreen Buyout Fund IV",
  strategy: "Buyout",
  committed: "10000000",
  vintageYear: 2017,
  currency: "USD",
  nav: "4000000",
  navDate: "2024-06-30",
  ledger: [
    { date: "2017-09-15", kind: "call", amount: "2500000", label: "Call #1" },
    { date: "2018-04-10", kind: "call", amount: "3000000", label: "Call #2" },
    { date: "2019-03-20", kind: "call", amount: "2000000", label: "Call #3" },
    { date: "2020-06-15", kind: "call", amount: "1500000", label: "Call #4" },
    {
      date: "2021-05-01",
      kind: "distribution",
      amount: "1500000",
      label: "Realization: Portco A",
    },
    {
      date: "2022-08-12",
      kind: "distribution",
      amount: "4000000",
      label: "Realization: Portco B",
    },
    {
      date: "2023-11-30",
      kind: "distribution",
      amount: "6000000",
      label: "Recap dividend",
    },
  ],
};

/**
 * Young venture fund (vintage 2022), still deep in its J-curve.
 * Paid-in 3,500,000; distributed 0; NAV 4,200,000.
 *   DPI  = 0
 *   RVPI = 4.2M / 3.5M = 1.2
 *   TVPI = 1.2
 *   Unfunded = 8M − 3.5M = 4,500,000
 */
export const ventureFund: Commitment = {
  id: "vc-growth-2022",
  name: "Northbridge Venture Growth III",
  strategy: "Venture",
  committed: "8000000",
  vintageYear: 2022,
  currency: "USD",
  nav: "4200000",
  navDate: "2024-06-30",
  ledger: [
    { date: "2022-07-01", kind: "call", amount: "1200000", label: "Call #1" },
    { date: "2023-02-15", kind: "call", amount: "1300000", label: "Call #2" },
    { date: "2024-01-20", kind: "call", amount: "1000000", label: "Call #3" },
  ],
};

/**
 * Core real-assets fund (vintage 2015), fully drawn, steady cash yield.
 * Paid-in 6,000,000; distributed 7,800,000; NAV 1,500,000.
 *   DPI  = 7.8M / 6M = 1.3
 *   RVPI = 1.5M / 6M = 0.25
 *   TVPI = 1.55
 *   Unfunded = 6M − 6M = 0
 */
export const realAssetsFund: Commitment = {
  id: "ra-infra-2015",
  name: "Harborline Core Infrastructure",
  strategy: "Real assets",
  committed: "6000000",
  vintageYear: 2015,
  currency: "USD",
  nav: "1500000",
  navDate: "2024-06-30",
  ledger: [
    { date: "2015-10-01", kind: "call", amount: "3000000", label: "Call #1" },
    { date: "2016-05-15", kind: "call", amount: "3000000", label: "Call #2" },
    { date: "2017-06-30", kind: "distribution", amount: "900000" },
    { date: "2018-06-30", kind: "distribution", amount: "1000000" },
    { date: "2019-06-30", kind: "distribution", amount: "1100000" },
    { date: "2020-06-30", kind: "distribution", amount: "1200000" },
    { date: "2021-06-30", kind: "distribution", amount: "1300000" },
    { date: "2022-06-30", kind: "distribution", amount: "1300000" },
    { date: "2023-06-30", kind: "distribution", amount: "1000000" },
  ],
};

/** The seeded private-markets sleeve used by the page and its tests. */
export const seededCommitments: readonly Commitment[] = [
  buyoutFund,
  ventureFund,
  realAssetsFund,
];
