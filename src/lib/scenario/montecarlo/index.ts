/**
 * Monte Carlo net-worth simulator: simulate total net worth across correlated
 * assets with a deterministic, seeded generator, and summarize the resulting
 * distribution (mean, percentiles, probability of loss, VaR / CVaR).
 *
 * Pure, deterministic, offline. READ-ONLY product: this projects hypothetical
 * scenarios for planning and reporting; it never moves money or places trades.
 */
export * from "./rng";
export * from "./montecarlo";
