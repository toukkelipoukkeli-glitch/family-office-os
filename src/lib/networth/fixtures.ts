import type { FxRateTable } from "@/lib/allocation";
import { seededPortfolio } from "@/fixtures";

import { buildNetWorthDashboard, type NetWorthDashboardModel } from "./networth";

/**
 * Deterministic, offline fixtures for the net-worth dashboard.
 *
 * The seeded portfolio spans every asset class and several currencies (USD, EUR,
 * CHF, GBP). The FX table below resolves every one of those into the USD base so
 * the whole book rolls up. Rates are fixed exact-decimal strings — no live feed.
 *
 * READ-ONLY product: these fixtures describe state for the dashboard and its
 * tests; nothing here moves money.
 */

/** USD-based FX table covering every currency in {@link seededPortfolio}. */
export const networthRateTable: FxRateTable = {
  base: "USD",
  rates: {
    EUR: "1.08",
    GBP: "1.27",
    CHF: "1.12",
  },
};

/** The dashboard model built from the seeded portfolio (the demo default). */
export const seededNetWorth: NetWorthDashboardModel = buildNetWorthDashboard(
  seededPortfolio,
  networthRateTable,
);
