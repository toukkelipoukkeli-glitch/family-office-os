/**
 * Benchmark + relative performance.
 *
 * Build a custom blended policy benchmark from weighted asset-class index
 * return series, then measure a portfolio against it: excess (active) return,
 * tracking error, information ratio, beta and alpha. All pure, deterministic
 * and offline — driven by static fixtures, never a live API. Returns are
 * decimals (0.01 = +1%); annualized variants take a `periodsPerYear`. Nothing
 * here moves money or places trades.
 */
export * from "./relative";
export * from "./policy";
export * from "./view";
export * from "./fixtures";
