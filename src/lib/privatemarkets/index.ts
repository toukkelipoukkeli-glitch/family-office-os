/**
 * m9-pe-lifecycle — Private-markets commitment lifecycle engine.
 *
 * A deterministic, offline model of a closed-end private-markets commitment
 * (PE / VC / real assets): a `committed` amount drawn down by dated capital
 * calls and returned by dated distributions, with a reported residual NAV.
 *
 *  - {@link commitmentMetrics} — TVPI / DPI / RVPI / MOIC, unfunded, PE IRR.
 *  - {@link buildJCurve}       — cumulative net-cashflow / NAV pacing series.
 *  - {@link portfolioMetrics}  — sleeve roll-up with a pooled IRR.
 *  - {@link buildPrivateMarketsModel} — plain-number view model for the page.
 *
 * Pure and READ-ONLY: it reports on commitments, it never moves money.
 */
export * from "./commitment";
export * from "./jcurve";
export * from "./portfolio";
export * from "./fixtures";
export * from "./view";
