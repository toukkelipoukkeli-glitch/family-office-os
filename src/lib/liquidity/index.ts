/**
 * m11-liquidity-coverage — Liquidity & capital-call coverage cockpit.
 *
 * A deterministic, offline engine answering one question: *can the family fund
 * its committed-but-uncalled PE capital calls AND its household burn over the
 * horizon — without being forced to sell illiquids?* It folds dated PE calls
 * (m9-pe-lifecycle) and household net burn (m9-cashflow) into one obligation
 * grid, draws them down against haircut-adjusted liquid reserve tiers, and
 * reports a coverage ratio, a shortfall timeline, and the worst-case month.
 *
 *  - {@link projectLiquidityCoverage} — the core month-by-month coverage engine.
 *  - {@link callObligations} / {@link householdBurnObligations} — engine bridges.
 *  - {@link buildLiquidityModel}      — plain-number view model for the page.
 *
 * Pure and READ-ONLY: it *measures* coverage, it never moves money.
 */
export * from "./engine";
export * from "./schedule";
export * from "./fixtures";
export * from "./view";
