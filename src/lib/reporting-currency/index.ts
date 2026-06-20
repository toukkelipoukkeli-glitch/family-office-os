/**
 * m12-reporting-currency — global reporting-currency switcher.
 *
 * A single user-chosen reporting/base currency that re-expresses portfolio
 * values across the app using the existing FX normalization. Pure conversion
 * logic ({@link reexpressNetWorth}), a persisted preference, and the React
 * context the AppShell switcher drives.
 *
 * READ-ONLY product: switching the reporting base only changes the unit values
 * are shown in; it never moves money or trades.
 */
export * from "./reporting-currency";
export * from "./reporting-context";
export * from "./reporting-money";
export * from "./reporting-provider";
export * from "./storage";
