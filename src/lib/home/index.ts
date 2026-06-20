/**
 * m10-home — Executive home overview.
 *
 * A pure, deterministic roll-up that composes the headline KPI of every other
 * module — net worth + window TWR, annualized volatility + max drawdown, IPS
 * compliance, liquidity runway, and open alerts — into a single at-a-glance
 * cockpit model with a drill-in link per tile.
 *
 * READ-ONLY product: it only reports the family's headline state; nothing here
 * moves money or places trades.
 */
export * from "./overview";
