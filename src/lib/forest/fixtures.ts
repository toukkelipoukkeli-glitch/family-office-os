import { ForestStand, type TimberPriceObservation } from "./stand";

/**
 * Deterministic, offline fixtures for the forest valuation module. Used by the
 * test suite and safe to import into the UI as sample data. No live API calls,
 * no price-feed fetches — these are hand-authored snapshots (AGENTS.md:
 * fixtures only, never live APIs in tests).
 *
 * Numbers are illustrative modeling inputs, not live market data.
 */

/**
 * A mature Norway-spruce block on a good site, with a recent drought record
 * (two stressed summers among otherwise normal years).
 */
export const spruceNorthBlock: ForestStand = ForestStand.parse({
  id: "stand-spruce-north",
  name: "North block — Norway spruce",
  species: "spruce",
  siteClass: "good",
  areaHectares: 40,
  standAgeYears: 65,
  currency: "EUR",
  managementFactor: "1.05", // good road access, thinned on schedule
  seasons: [
    { year: 2020, droughtIndex: 0.1 },
    { year: 2021, droughtIndex: -0.2 }, // a wet year
    { year: 2022, droughtIndex: 0.7 }, // severe drought
    { year: 2023, droughtIndex: 0.6 }, // drought again
    { year: 2024, droughtIndex: 0.0 },
  ],
  note: "Even-aged, single-species block established late 1950s.",
});

/** A young oak stand on an excellent site, no recorded weather stress. */
export const oakRiverside: ForestStand = ForestStand.parse({
  id: "stand-oak-riverside",
  name: "Riverside — oak",
  species: "oak",
  siteClass: "excellent",
  areaHectares: 12,
  standAgeYears: 30,
  currency: "EUR",
  seasons: [],
});

/** A pine block on an average site with a single mild drought year. */
export const pineSouthRidge: ForestStand = ForestStand.parse({
  id: "stand-pine-ridge",
  name: "South ridge — Scots pine",
  species: "pine",
  siteClass: "average",
  areaHectares: 25,
  standAgeYears: 50,
  currency: "EUR",
  managementFactor: "0.95", // steep, harder access
  seasons: [{ year: 2023, droughtIndex: 0.3 }],
});

/**
 * A rising timber price series (per m³, EUR) over four years — a steady market
 * with modest dispersion. The latest reference price is 78.
 */
export const timberPriceSeriesEur: TimberPriceObservation[] = [
  { date: "2021-06-30", pricePerCubicMeter: "62", currency: "EUR" },
  { date: "2022-06-30", pricePerCubicMeter: "70", currency: "EUR" },
  { date: "2023-06-30", pricePerCubicMeter: "74", currency: "EUR" },
  { date: "2024-06-30", pricePerCubicMeter: "78", currency: "EUR" },
];

/**
 * A volatile timber price series (per m³, EUR): a sharp spike and partial
 * retracement, producing high recent dispersion ⇒ a wider valuation band.
 */
export const timberPriceSeriesVolatileEur: TimberPriceObservation[] = [
  { date: "2021-06-30", pricePerCubicMeter: "60", currency: "EUR" },
  { date: "2022-06-30", pricePerCubicMeter: "95", currency: "EUR" },
  { date: "2023-06-30", pricePerCubicMeter: "70", currency: "EUR" },
  { date: "2024-06-30", pricePerCubicMeter: "88", currency: "EUR" },
];
