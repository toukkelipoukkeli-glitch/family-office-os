/**
 * Forest / timber valuation for the read-only family office OS.
 *
 * Combines a biological growth model (Chapman-Richards standing-volume curve
 * with drought/weather coupling), a timber price index built from market
 * observations, and a documented confidence band into a single stand
 * valuation — and rolls stands up into a forest-portfolio total.
 *
 * - Import {@link ForestStand} / {@link TimberPriceObservation} to validate
 *   untrusted input at boundaries.
 * - Import {@link valueStand} (or {@link valueStandWithIndex} to reuse one
 *   price index across stands) to produce a {@link ForestValuation}.
 * - Import {@link valueForest} to aggregate stand valuations.
 *
 * READ-ONLY: every export reports an estimate; none moves money or proposes a
 * trade/harvest. Everything is exact-decimal and deterministic (no clock, no
 * network) so tests run offline against fixtures.
 */
export * from "./stand";
export * from "./growth";
export * from "./price-index";
export * from "./valuation";
export * from "./fixtures";
