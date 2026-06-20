/**
 * m11-manager-scorecard — Manager / fund due-diligence scorecard engine.
 *
 * From a roster of external managers/funds (gross return series, fee terms —
 * management + carry over a hurdle, AUM, vintage, benchmark) this computes
 * net-of-fee vs. gross compounded return, fee drag, benchmark-relative
 * performance and a transparent composite score, then ranks the roster. Pure,
 * deterministic and offline — driven by static fixtures, never a live API.
 * Money is exact {@link Decimal}; nothing here moves money or places trades.
 */
export * from "./scorecard";
export * from "./view";
export * from "./fixtures";
