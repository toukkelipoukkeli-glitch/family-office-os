import type { FundPosition } from "./privatemarkets";

/**
 * Deterministic sample fund position for the lifecycle explorer and tests.
 *
 * A 2019-vintage USD buyout fund with a $10,000,000 commitment. Capital is
 * called in three drawdowns and returned in two distributions, with a residual
 * NAV still held. The numbers are chosen to be hand-computable:
 *
 *   committed     = 10,000,000
 *   calls         = 4,000,000 + 3,000,000 + 1,000,000 = 8,000,000 (paid-in)
 *   distributions = 2,000,000 + 7,000,000           = 9,000,000
 *   nav           = 5,000,000
 *   unfunded      = 10,000,000 − 8,000,000          = 2,000,000
 *   DPI  = 9,000,000 / 8,000,000  = 1.125
 *   RVPI = 5,000,000 / 8,000,000  = 0.625
 *   TVPI = 14,000,000 / 8,000,000 = 1.75  (== MOIC)
 *   called% = 8,000,000 / 10,000,000 = 0.80
 *
 * READ-ONLY product: illustrative sample data, not a real position.
 */
export const sampleFund: FundPosition = {
  commitment: {
    fundName: "Evergreen Buyout Fund IV",
    committed: "10000000",
    vintageYear: 2019,
    currency: "USD",
  },
  cashflows: [
    { date: "2019-03-15", kind: "call", amount: "4000000", note: "Drawdown 1" },
    { date: "2020-06-01", kind: "call", amount: "3000000", note: "Drawdown 2" },
    { date: "2021-02-10", kind: "distribution", amount: "2000000", note: "Recap dividend" },
    { date: "2021-09-30", kind: "call", amount: "1000000", note: "Drawdown 3 (follow-on)" },
    { date: "2023-05-20", kind: "distribution", amount: "7000000", note: "Exit: Portco A" },
  ],
  nav: "5000000",
  asOf: "2024-12-31",
};

/**
 * A second, contrasting fund: a fully-realized 2015 venture fund with no
 * residual NAV. DPI == TVPI here because RVPI is zero.
 *
 *   paid-in       = 5,000,000
 *   distributions = 12,500,000
 *   nav           = 0
 *   DPI = TVPI = 12,500,000 / 5,000,000 = 2.5, RVPI = 0
 */
export const realizedVentureFund: FundPosition = {
  commitment: {
    fundName: "Northstar Ventures II",
    committed: "5000000",
    vintageYear: 2015,
    currency: "USD",
  },
  cashflows: [
    { date: "2015-04-01", kind: "call", amount: "5000000", note: "Single drawdown" },
    { date: "2019-08-15", kind: "distribution", amount: "4500000", note: "Partial exit" },
    { date: "2022-11-30", kind: "distribution", amount: "8000000", note: "Final liquidation" },
  ],
  nav: "0",
  asOf: "2022-11-30",
};
