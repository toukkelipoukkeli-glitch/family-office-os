import { Comparable } from "./comparable";
import { LegoSet } from "./set";

/**
 * Deterministic, offline fixtures for the LEGO price-guide model. Used by the
 * test suite and safe to import into UI as sample data. No live API calls — the
 * prices are illustrative, not scraped.
 */

/** The 7,541-piece UCS Millennium Falcon (75192), retired-grade flagship. */
export const millenniumFalcon: LegoSet = LegoSet.parse({
  id: "lego-75192",
  setNumber: "75192",
  name: "Millennium Falcon",
  theme: "Star Wars",
  year: 2017,
  pieceCount: 7541,
  minifigCount: 8,
  retailPrice: "799.99",
  currency: "USD",
  tags: ["ucs", "grail"],
});

/** The 5,923-piece Taj Mahal re-release (10256). */
export const tajMahal: LegoSet = LegoSet.parse({
  id: "lego-10256",
  setNumber: "10256",
  name: "Taj Mahal",
  theme: "Creator Expert",
  year: 2017,
  pieceCount: 5923,
  retailPrice: "369.99",
  currency: "USD",
  retiredOn: "2019-12-31",
  tags: ["icons"],
});

/**
 * A spread of comparable sales for the Millennium Falcon as of mid-2024,
 * deliberately heterogeneous (different conditions, completeness, sources,
 * dates) plus one obvious outlier the Hampel filter should drop.
 */
export const falconComps: Comparable[] = [
  Comparable.parse({
    id: "comp-mf-1",
    price: "1100.00",
    currency: "USD",
    condition: "sealed",
    soldOn: "2024-05-01",
    source: "auction",
  }),
  Comparable.parse({
    id: "comp-mf-2",
    price: "1150.00",
    currency: "USD",
    condition: "sealed",
    soldOn: "2024-04-10",
    source: "marketplace",
  }),
  Comparable.parse({
    id: "comp-mf-3",
    price: "820.00", // complete (CIB) ~= 0.72 of sealed -> ~1139 sealed-equiv
    currency: "USD",
    condition: "complete",
    soldOn: "2024-03-15",
    source: "marketplace",
  }),
  Comparable.parse({
    id: "comp-mf-4",
    price: "640.00", // used ~= 0.55 of sealed -> ~1164 sealed-equiv
    currency: "USD",
    condition: "used",
    soldOn: "2024-02-20",
    source: "auction",
  }),
  Comparable.parse({
    id: "comp-mf-5",
    price: "3200.00", // outlier (mis-listed / signed) -> should be filtered
    currency: "USD",
    condition: "sealed",
    soldOn: "2024-01-05",
    source: "private",
  }),
  Comparable.parse({
    id: "comp-mf-6",
    price: "1080.00",
    currency: "USD",
    condition: "sealed",
    soldOn: "2023-11-01",
    source: "dealer",
  }),
];

/** A tiny set of two clean sealed comps for the Taj Mahal. */
export const tajComps: Comparable[] = [
  Comparable.parse({
    id: "comp-taj-1",
    price: "520.00",
    currency: "USD",
    condition: "sealed",
    soldOn: "2024-05-20",
    source: "marketplace",
  }),
  Comparable.parse({
    id: "comp-taj-2",
    price: "560.00",
    currency: "USD",
    condition: "sealed",
    soldOn: "2024-04-22",
    source: "auction",
  }),
];

/** The valuation date the fixtures are tuned around. */
export const FIXTURE_AS_OF = "2024-06-01";
