/**
 * m10-insurance — Insurance coverage tracker for the read-only family office OS.
 *
 * Import {@link analyzeInsurance} to roll an {@link InsuranceBook} up by category
 * (life, property & casualty, liability, umbrella), measure each category's
 * active coverage against the household's net-worth {@link ExposureProfile}, and
 * derive the {@link CoverageGap} flags. The {@link seededInsuranceBook} fixture
 * is deterministic sample data for tests and the UI. Everything is pure, offline
 * and Decimal-backed — nothing here binds, cancels or pays for a policy.
 */
export * from "./insurance";
export * from "./fixtures";
