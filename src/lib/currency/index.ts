/**
 * m10-currency — Currency exposure & hedging.
 *
 * A deterministic, offline analysis of a multi-currency portfolio's foreign-
 * exchange exposure and what hedging it would cost:
 *
 *  - {@link buildExposure} — roll positions up by currency and convert into a
 *    single reporting base currency with exact {@link import("decimal.js").Decimal}
 *    arithmetic.
 *  - {@link applyHedge}    — apply a hedge-ratio policy and compute, per
 *    currency, the hedged / residual notional and the indicative annual cost.
 *  - {@link buildCurrencyModel} — the plain-number view model the page renders.
 *
 * Pure and READ-ONLY: it reports FX exposure and the indicative cost of a hedge;
 * it never places an FX forward, moves money, or trades.
 */
export * from "./engine";
export * from "./fixtures";
export * from "./view";
