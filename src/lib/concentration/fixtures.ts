import { ConcentrationBook } from "./model";

/**
 * Deterministic, offline fixture for the concentration & single-name risk
 * monitor (unit m11-concentration-risk). No live prices, no randomness — the
 * monitor, its unit tests and the Playwright visual check all run from this.
 *
 * The book is designed to *demonstrate* the value of look-through: a single
 * mega-cap name, Apple, is held three ways — a direct line, inside a broad
 * index fund, and inside a tech-sector fund. At the position level no line
 * looks alarming, but rolled down to the single name, Apple's true share of net
 * worth is materially larger than any one position implies.
 *
 * Total net worth: $100,000,000 exactly, so weights read cleanly.
 *
 * READ-ONLY product: this fixture only describes a hypothetical book.
 */

function usd(amount: string) {
  return { amount, currency: "USD" as const };
}

export const SAMPLE_CONCENTRATION_BOOK: ConcentrationBook =
  ConcentrationBook.parse({
    id: "ursin-family-book",
    name: "Ursin Family Office",
    baseCurrency: "USD",
    positions: [
      // --- Direct single names -------------------------------------------
      {
        kind: "direct",
        id: "pos-aapl",
        name: "Apple Inc.",
        symbol: "AAPL",
        issuerId: "issuer-aapl",
        sector: "technology",
        liquidity: "liquid",
        value: usd("12000000"), // 12%
      },
      {
        kind: "direct",
        id: "pos-msft",
        name: "Microsoft Corp.",
        symbol: "MSFT",
        issuerId: "issuer-msft",
        sector: "technology",
        liquidity: "liquid",
        value: usd("8000000"), // 8%
      },
      {
        kind: "direct",
        id: "pos-jpm",
        name: "JPMorgan Chase & Co.",
        symbol: "JPM",
        issuerId: "issuer-jpm",
        sector: "financials",
        liquidity: "liquid",
        value: usd("6000000"), // 6%
      },
      {
        kind: "direct",
        id: "pos-ust",
        name: "US Treasury 10y",
        issuerId: "issuer-ust",
        sector: "government",
        liquidity: "liquid",
        value: usd("10000000"), // 10%
      },
      // --- A private holding (illiquid single name) ----------------------
      {
        kind: "direct",
        id: "pos-spv-helsinki",
        name: "Helsinki Office Tower SPV",
        issuerId: "issuer-helsinki-re",
        sector: "real_estate",
        liquidity: "illiquid",
        value: usd("15000000"), // 15%
      },
      {
        kind: "direct",
        id: "pos-pe-fund",
        name: "Nordic Growth PE Fund III",
        issuerId: "issuer-nordic-pe",
        sector: "diversified",
        liquidity: "illiquid",
        value: usd("9000000"), // 9%
      },
      // --- Funds with look-through ---------------------------------------
      {
        // Broad index fund: small per-name weights, big diversified tail.
        kind: "fund",
        id: "pos-sp500",
        name: "Vanguard S&P 500 ETF",
        symbol: "VOO",
        liquidity: "liquid",
        value: usd("25000000"), // 25%
        constituents: [
          {
            issuerId: "issuer-aapl",
            name: "Apple Inc.",
            sector: "technology",
            weight: 0.07,
          },
          {
            issuerId: "issuer-msft",
            name: "Microsoft Corp.",
            sector: "technology",
            weight: 0.06,
          },
          {
            issuerId: "issuer-jpm",
            name: "JPMorgan Chase & Co.",
            sector: "financials",
            weight: 0.013,
          },
          {
            issuerId: "issuer-xom",
            name: "Exxon Mobil Corp.",
            sector: "energy",
            weight: 0.012,
          },
          {
            issuerId: "issuer-unh",
            name: "UnitedHealth Group",
            sector: "healthcare",
            weight: 0.011,
          },
          // ~83.4% diversified tail.
        ],
      },
      {
        // Concentrated tech-sector fund.
        kind: "fund",
        id: "pos-tech-etf",
        name: "Tech Megacap Fund",
        symbol: "QTEC",
        liquidity: "liquid",
        value: usd("15000000"), // 15%
        constituents: [
          {
            issuerId: "issuer-aapl",
            name: "Apple Inc.",
            sector: "technology",
            weight: 0.2,
          },
          {
            issuerId: "issuer-msft",
            name: "Microsoft Corp.",
            sector: "technology",
            weight: 0.18,
          },
          {
            issuerId: "issuer-nvda",
            name: "NVIDIA Corp.",
            sector: "technology",
            weight: 0.16,
          },
          {
            issuerId: "issuer-googl",
            name: "Alphabet Inc.",
            sector: "communication",
            weight: 0.12,
          },
          // ~34% diversified tail.
        ],
      },
    ],
  });

/**
 * A second, deliberately *diversified* fixture used to prove the monitor reads
 * "concentration low" when the book is spread out: many small equal lines, no
 * single name dominant. Total: $50,000,000.
 */
export const DIVERSIFIED_BOOK: ConcentrationBook = ConcentrationBook.parse({
  id: "diversified-book",
  name: "Broadly Diversified Sleeve",
  baseCurrency: "USD",
  positions: [
    {
      kind: "fund",
      id: "pos-world",
      name: "Global All-Cap Index",
      symbol: "VWRL",
      liquidity: "liquid",
      value: usd("50000000"),
      constituents: [
        {
          issuerId: "issuer-aapl",
          name: "Apple Inc.",
          sector: "technology",
          weight: 0.04,
        },
        {
          issuerId: "issuer-msft",
          name: "Microsoft Corp.",
          sector: "technology",
          weight: 0.035,
        },
        {
          issuerId: "issuer-nvda",
          name: "NVIDIA Corp.",
          sector: "technology",
          weight: 0.03,
        },
        // ~89.5% diversified tail — no single name above 4%.
      ],
    },
  ],
});
