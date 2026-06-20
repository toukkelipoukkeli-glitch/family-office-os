/**
 * m11-tax-timeline — Unified household tax timeline.
 *
 * Import {@link buildTaxTimeline} to sequence a family's tax-relevant actions
 * across one calendar year into a single ordered, deterministic timeline by
 * composing the existing harvest, tax-estimate, giving and estate engines. The
 * {@link seededTimelineInputs} fixture is deterministic sample data for tests
 * and the UI. Everything is pure, offline and Decimal-backed.
 */
export * from "./taxtimeline";
export * from "./fixtures";
