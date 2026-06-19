import { CompanyProfile } from "./company-profile";

/**
 * Deterministic, offline profile fixtures for the sample companies in
 * `fixtures.ts`. Used by tests and as sample data for the company-profile UI.
 * All money figures are EUR (the reporting currency of the Finnish entities).
 * No live API calls — every figure is hand-authored and stable.
 */

const EUR = "EUR";

function eur(amount: string) {
  return { amount, currency: EUR };
}

/** Profile for the top holding company. */
export const topcoProfile: CompanyProfile = CompanyProfile.parse({
  companyId: "co-topco",
  reportingCurrency: EUR,
  financials: [
    {
      fiscalYear: 2022,
      revenue: eur("18200000"),
      ebitda: eur("4100000"),
      netIncome: eur("2650000"),
      totalAssets: eur("52000000"),
      totalEquity: eur("31000000"),
      cash: eur("6400000"),
      debt: eur("12000000"),
      asOf: "2022-12-31",
    },
    {
      fiscalYear: 2023,
      revenue: eur("21450000"),
      ebitda: eur("4980000"),
      netIncome: eur("3120000"),
      totalAssets: eur("58500000"),
      totalEquity: eur("34800000"),
      cash: eur("7900000"),
      debt: eur("11500000"),
      asOf: "2023-12-31",
    },
    {
      fiscalYear: 2024,
      revenue: eur("24800000"),
      ebitda: eur("5820000"),
      netIncome: eur("3640000"),
      totalAssets: eur("64200000"),
      totalEquity: eur("38900000"),
      cash: eur("9300000"),
      debt: eur("10800000"),
      asOf: "2024-12-31",
    },
  ],
  holdings: [
    {
      id: "h-realestate",
      name: "Ursin Real Estate Oy",
      kind: "real_estate",
      value: eur("22000000"),
    },
    {
      id: "h-ventures",
      name: "Ursin Ventures Oy",
      kind: "private",
      value: eur("14500000"),
    },
    {
      id: "h-listed",
      name: "Global Equity Sleeve",
      kind: "equity",
      value: eur("8600000"),
      ticker: "VWRL",
    },
    {
      id: "h-bonds",
      name: "EUR Govt Bond Ladder",
      kind: "fixed_income",
      value: eur("4200000"),
    },
    {
      id: "h-cash",
      name: "Treasury / Money Market",
      kind: "cash",
      value: eur("3100000"),
    },
  ],
  people: [
    { personId: "person-touko", role: "chair", title: "Chair & Principal" },
    { personId: "person-maria", role: "director", title: "Director" },
  ],
});

/** Profile for the wholly owned real-estate subsidiary. */
export const realEstateProfile: CompanyProfile = CompanyProfile.parse({
  companyId: "co-realestate",
  reportingCurrency: EUR,
  financials: [
    {
      fiscalYear: 2023,
      revenue: eur("3200000"),
      ebitda: eur("2100000"),
      netIncome: eur("980000"),
      totalAssets: eur("41000000"),
      totalEquity: eur("18000000"),
      cash: eur("1200000"),
      debt: eur("21000000"),
      asOf: "2023-12-31",
    },
    {
      fiscalYear: 2024,
      revenue: eur("3450000"),
      ebitda: eur("2280000"),
      netIncome: eur("1110000"),
      totalAssets: eur("43500000"),
      totalEquity: eur("19400000"),
      cash: eur("1450000"),
      debt: eur("20200000"),
      asOf: "2024-12-31",
    },
  ],
  holdings: [
    {
      id: "re-helsinki",
      name: "Helsinki Office Tower",
      kind: "real_estate",
      value: eur("26000000"),
    },
    {
      id: "re-tampere",
      name: "Tampere Logistics Park",
      kind: "real_estate",
      value: eur("12500000"),
    },
    {
      id: "re-cash",
      name: "Operating Cash",
      kind: "cash",
      value: eur("1450000"),
    },
  ],
  people: [{ personId: "person-touko", role: "director", title: "Director" }],
});

/** Profile for the ventures subsidiary. */
export const venturesProfile: CompanyProfile = CompanyProfile.parse({
  companyId: "co-ventures",
  reportingCurrency: EUR,
  financials: [
    {
      fiscalYear: 2023,
      revenue: eur("1200000"),
      ebitda: eur("-450000"),
      netIncome: eur("-620000"),
      totalAssets: eur("9800000"),
      totalEquity: eur("7400000"),
      cash: eur("2600000"),
      debt: eur("0"),
      asOf: "2023-12-31",
    },
    {
      fiscalYear: 2024,
      revenue: eur("2050000"),
      ebitda: eur("120000"),
      netIncome: eur("-180000"),
      totalAssets: eur("11200000"),
      totalEquity: eur("8100000"),
      cash: eur("3050000"),
      debt: eur("500000"),
      asOf: "2024-12-31",
    },
  ],
  holdings: [
    {
      id: "vc-opco",
      name: "Acme Operating Ltd",
      kind: "private",
      value: eur("5400000"),
    },
    {
      id: "vc-seed",
      name: "Seed Fund III",
      kind: "fund",
      value: eur("2200000"),
    },
    {
      id: "vc-cash",
      name: "Dry Powder",
      kind: "cash",
      value: eur("3050000"),
    },
  ],
  people: [
    { personId: "person-touko", role: "chair", title: "Chair" },
    { personId: "person-maria", role: "advisor", title: "Investment Advisor" },
  ],
});

/** All sample profiles, keyed lookup is done in the page via this list. */
export const sampleProfiles: CompanyProfile[] = [
  topcoProfile,
  realEstateProfile,
  venturesProfile,
];

/** Look up a sample profile by company id. */
export function sampleProfileFor(
  companyId: string,
): CompanyProfile | undefined {
  return sampleProfiles.find((p) => p.companyId === companyId);
}
