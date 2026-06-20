/**
 * Historical stress-test library: documented re-plays of real market
 * dislocations (2008 GFC, 2020 COVID crash, 2022 rate shock) as auditable
 * parameter sets applied to the existing scenario engine, plus a deterministic
 * view model that reports each episode's before/after net-worth impact.
 *
 * Pure, deterministic, offline. READ-ONLY product: scenarios project
 * hypothetical outcomes for planning and reporting; nothing here moves money.
 */
export * from "./scenarios";
export * from "./fixtures";
export * from "./model";
