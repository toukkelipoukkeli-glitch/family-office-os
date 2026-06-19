/**
 * Classic-car valuation: Zod input schemas + a deterministic valuation model
 * with an explicit confidence band, for the read-only family office OS.
 *
 * Import {@link ClassicCar} to validate untrusted input at boundaries and
 * {@link valueClassicCar} to produce a {@link CarValuation}.
 */
export * from "./vehicle";
export * from "./valuation";
export * from "./fixtures";
