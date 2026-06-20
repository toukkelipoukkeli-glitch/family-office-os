import { Decimal } from "decimal.js";

import { Money } from "../money";
import { eurLatestTable } from "../fx/fixtures";
import type {
  ExposureInput,
  HedgeAssumption,
  Position,
} from "./engine";

/**
 * Deterministic, offline fixtures for the currency exposure & hedging unit.
 *
 * A plausible EUR-based family-office portfolio spread across six currencies,
 * priced with the shared EUR-anchored FX fixture ({@link eurLatestTable}) so the
 * whole unit runs without any network call. All values are illustrative, not
 * live market data. READ-ONLY: used to *report* exposure, never to trade.
 */

/** The reporting base currency for the seeded portfolio. */
export const SEEDED_BASE = "EUR";

/** A multi-currency portfolio, each position valued in its local currency. */
export const seededPositions: readonly Position[] = [
  {
    id: "eu-equity",
    label: "European equity",
    assetClass: "Public equity",
    currency: "EUR",
    value: Money.of("4200000", "EUR"),
  },
  {
    id: "eu-bonds",
    label: "Euro government bonds",
    assetClass: "Fixed income",
    currency: "EUR",
    value: Money.of("1800000", "EUR"),
  },
  {
    id: "us-equity",
    label: "US large-cap equity",
    assetClass: "Public equity",
    currency: "USD",
    value: Money.of("5400000", "USD"),
  },
  {
    id: "us-credit",
    label: "US corporate credit",
    assetClass: "Fixed income",
    currency: "USD",
    value: Money.of("1620000", "USD"),
  },
  {
    id: "uk-equity",
    label: "UK equity",
    assetClass: "Public equity",
    currency: "GBP",
    value: Money.of("1530000", "GBP"),
  },
  {
    id: "ch-private",
    label: "Swiss private holding",
    assetClass: "Private equity",
    currency: "CHF",
    value: Money.of("1200000", "CHF"),
  },
  {
    id: "jp-equity",
    label: "Japan equity",
    assetClass: "Public equity",
    currency: "JPY",
    value: Money.of("210000000", "JPY"),
  },
  {
    id: "se-realestate",
    label: "Nordic real estate",
    assetClass: "Real assets",
    currency: "SEK",
    value: Money.of("11250000", "SEK"),
  },
];

/**
 * Per-currency indicative annualised hedge-cost rates (forward points + roll),
 * as decimal fractions of the hedged base notional. Illustrative values: a
 * positive rate costs carry; USD here *earns* carry for an EUR-based hedger
 * (negative), reflecting a positive rate differential.
 */
export const seededHedgeAssumptions: readonly HedgeAssumption[] = [
  { currency: "USD", annualCostRate: new Decimal("-0.0125") },
  { currency: "GBP", annualCostRate: new Decimal("0.0045") },
  { currency: "CHF", annualCostRate: new Decimal("0.0185") },
  { currency: "JPY", annualCostRate: new Decimal("0.0260") },
  { currency: "SEK", annualCostRate: new Decimal("0.0075") },
];

/** A ready-to-use {@link ExposureInput} for the seeded portfolio. */
export const seededExposureInput: ExposureInput = {
  base: SEEDED_BASE,
  rates: eurLatestTable,
  positions: seededPositions,
  hedgeAssumptions: seededHedgeAssumptions,
};
