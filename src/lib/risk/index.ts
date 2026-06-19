/**
 * Risk metrics: volatility, max drawdown, Sharpe, Sortino, and correlation /
 * covariance matrices computed from periodic simple-return series.
 *
 * All functions are pure, deterministic, and offline — safe to use anywhere in
 * the read-only family-office OS. Returns are decimals (0.01 = +1%); annualized
 * variants take a `periodsPerYear` (252 daily, 52 weekly, 12 monthly, 4
 * quarterly). Nothing here moves money or places trades.
 */
export * from "./returns";
export * from "./metrics";
export * from "./correlation";
