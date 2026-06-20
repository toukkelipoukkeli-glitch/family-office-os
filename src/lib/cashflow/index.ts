/**
 * m9-cashflow — Household / entity cashflow projection.
 *
 * A deterministic, offline projection of a household's (or any entity's) cash
 * position over a monthly horizon, folding recurring inflows (dividends,
 * coupons, rent, salary) and outflows (living expenses, taxes, fees) together
 * with a one-off dated private-markets capital-call / distribution schedule
 * (from m9-pe-lifecycle) into a projected monthly balance series.
 *
 *  - {@link projectCashflow}   — the core month-by-month projection engine.
 *  - {@link peScheduleFlows}   — map a PE commitment ledger onto the month grid.
 *  - {@link buildCashflowModel} — plain-number view model for the page.
 *
 * Pure and READ-ONLY: it projects cash, it never moves money or places trades.
 */
export * from "./engine";
export * from "./pe-schedule";
export * from "./fixtures";
export * from "./view";
