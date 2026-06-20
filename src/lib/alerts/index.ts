/**
 * Concentration & limit-breach alerts.
 *
 * A declarative rule set ({@link ./rule}) of per asset-class / position /
 * currency thresholds, evaluated against a portfolio's allocation breakdowns by
 * a pure, deterministic engine ({@link ./engine}). Breaches are surfaced on the
 * dashboard.
 *
 * READ-ONLY product: rules describe prudential limits and the engine reports
 * breaches for a human to review; nothing here moves money or places trades.
 */
export * from "./rule";
export * from "./engine";
export * from "./format";
export {
  alertsPortfolio,
  alertsRateTable,
  defaultAlertRules,
} from "./fixtures";
