/**
 * m11-goal-funding — Goal & liability funding engine: an asset-liability-matching
 * (dedicated-portfolio) model over dated family goals/liabilities for the
 * read-only family office OS.
 *
 * Import {@link analyzeFundingPlan} to derive, per goal, the future value of its
 * dedicated assets at the due date, the funded ratio, the funding gap and any
 * surplus, plus a portfolio-level dedicated-vs-shortfall roll-up. The
 * {@link seededFundingPlan} fixture is deterministic sample data for tests and
 * the UI. Everything is pure, offline and Decimal-backed.
 */
export * from "./goals";
export * from "./fixtures";
