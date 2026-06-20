/**
 * m7-fees — Fee & total-cost-of-ownership (TCO) engine.
 *
 * A deterministic, offline model of every fee a family office pays
 * (management, fund expenses, performance / carry) plus the long-run fee drag
 * on compounded returns. Pure and READ-ONLY: it reports cost, never moves
 * money.
 */
export * from "./fees";
export * from "./fixtures";
export * from "./view";
