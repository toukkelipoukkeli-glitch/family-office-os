/**
 * Named scenario builder: documented, reusable stress scenarios (rate shock,
 * FX move, drought, market correction) that shock a base set of simulation
 * assets before they are run through the Monte Carlo engine, plus helpers to
 * run a scenario against its baseline and report the impact.
 *
 * Pure, deterministic, offline. READ-ONLY product: scenarios project
 * hypothetical outcomes for planning and reporting; nothing here moves money.
 */
export * from "./scenarios";
export * from "./catalog";
export * from "./run";
