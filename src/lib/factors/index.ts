/**
 * Factor & style return decomposition for a read-only family office OS.
 *
 *  - {@link regressFactors} — OLS regression of portfolio excess returns onto a
 *    fixed factor set (market, size, value, rate-duration, credit, FX). Solves
 *    the normal equations exactly in {@link Decimal}; reports betas,
 *    contributions, R² and residual diagnostics.
 *  - {@link buildFactorView} — flattens the engine result into plain numbers for
 *    charting and tables.
 *
 * Deterministic and offline; nothing here moves money or trades.
 */
export {
  regressFactors,
  FactorRegressionError,
  FACTOR_KEYS,
  FACTOR_LABELS,
  type FactorKey,
  type FactorObservation,
  type FactorRegressionInput,
  type FactorLoading,
  type FactorRegressionResult,
} from "./factors";
export {
  buildFactorView,
  type FactorRow,
  type FactorView,
} from "./view";
export {
  SYNTHETIC_FACTOR_FIXTURE,
  SYNTHETIC_TRUE_BETAS,
  SYNTHETIC_TRUE_ALPHA,
  FAMILY_OFFICE_FACTOR_FIXTURE,
  FAMILY_OFFICE_TRUE_BETAS,
  FAMILY_OFFICE_ALPHA,
} from "./fixtures";
