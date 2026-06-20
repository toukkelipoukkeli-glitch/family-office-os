/**
 * m10-philanthropy — Charitable giving planner: a deterministic, offline,
 * Decimal-backed model of the tax economics of strategic giving for the
 * read-only family office OS.
 *
 * Import {@link analyzeGivingPlan} to derive per-gift economics (capital-gains
 * avoided + deduction value), per-year deduction usage under AGI ceilings with
 * carryforward, and the after-tax net cost of a multi-year giving program.
 * {@link compareInKindVsCash} quantifies the "gift stock, don't sell it"
 * advantage for a single asset. The {@link seededGivingPlan} fixture is
 * deterministic sample data for tests and the UI.
 */
export * from "./giving";
export * from "./fixtures";
