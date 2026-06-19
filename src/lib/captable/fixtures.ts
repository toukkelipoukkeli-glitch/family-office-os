import { CapTable, type FinancingRound } from "./captable";

/**
 * Deterministic, offline cap-table fixtures. Used by the test suite and safe to
 * import into the UI as sample data. No live API calls.
 *
 * A typical post-seed startup: two founders, an early option pool, and an angel.
 * Total fully diluted = 10,000,000 shares.
 */
export const sampleCapTable: CapTable = CapTable.parse({
  companyId: "co-acme",
  companyName: "Acme Robotics Oy",
  currency: "EUR",
  entries: [
    {
      id: "entry-founder-a",
      holder: "Touko Ursin",
      securityClass: "common",
      shares: "4500000",
      since: "2023-01-10",
      note: "Co-founder / CEO",
    },
    {
      id: "entry-founder-b",
      holder: "Maria Ursin",
      securityClass: "common",
      shares: "3500000",
      since: "2023-01-10",
      note: "Co-founder / CTO",
    },
    {
      id: "entry-seed-pool",
      holder: "Employee Option Pool",
      securityClass: "option",
      shares: "1000000",
      since: "2023-02-01",
      note: "Reserved for early hires",
    },
    {
      id: "entry-angel",
      holder: "Northern Angels",
      securityClass: "preferred",
      shares: "1000000",
      since: "2023-06-15",
      note: "Pre-seed angel round",
    },
  ],
});

/**
 * A sample Series A: raise €5,000,000 at a €15,000,000 pre-money, topping the
 * option pool up to 15% of the post-round fully diluted shares.
 */
export const sampleRound: FinancingRound = {
  name: "Series A",
  investment: "5000000",
  preMoneyValuation: "15000000",
  optionPoolPercent: 15,
};

/** A simpler round with no pool top-up, for math that should be easy to verify. */
export const simpleRound: FinancingRound = {
  name: "Bridge",
  investment: "2000000",
  preMoneyValuation: "8000000",
};
