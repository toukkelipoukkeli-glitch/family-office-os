// Ops cockpit data model.
//
// This is a *deterministic snapshot* of the autonomous-build harness state
// (backlog units + their lifecycle status). It is bundled at build time so the
// /ops page renders offline with no live file reads or network calls, which
// keeps the page testable and screenshot-stable. When the harness advances a
// unit, this snapshot is regenerated from `harness/state/*.json`.

/** Lifecycle status of a single build unit. */
export type UnitStatus = "backlog" | "active" | "merged" | "blocked";

/** A single buildable unit of work, mirroring `harness/state/backlog.json`. */
export interface OpsUnit {
  id: string;
  title: string;
  /** What kind of machine check gates this unit (oracle rule). */
  oracle: string;
  /** Unit ids this unit depends on. */
  deps: string[];
  status: UnitStatus;
  /** Optional PR reference, e.g. "#12", once a PR is opened. */
  pr?: string;
  /** Optional human-readable note (e.g. why it is blocked). */
  note?: string;
}

/** A milestone groups related units. */
export interface OpsMilestone {
  id: string;
  title: string;
  units: OpsUnit[];
}

/** The full harness snapshot rendered by the /ops page. */
export interface OpsSnapshot {
  /** Build generation counter from `tasks.json`. */
  generation: number;
  /** ISO-ish date the snapshot was last updated. */
  updatedAt: string;
  /** Current harness phase, e.g. "feature-build". */
  phase: string;
  /** Last heartbeat timestamp (when the loop last ran). */
  heartbeat: string;
  milestones: OpsMilestone[];
}

/**
 * Bundled snapshot of harness state. Kept in sync (by hand or tooling) with
 * `harness/state/backlog.json` + `tasks.json`. Statuses reflect the build loop.
 */
export const opsSnapshot: OpsSnapshot = {
  generation: 1,
  updatedAt: "2026-06-19",
  phase: "feature-build",
  heartbeat: "2026-06-19T22:35:00Z",
  milestones: [
    {
      id: "m0",
      title: "Spine on fixtures",
      units: [
        { id: "m0-money", title: "Decimal money type + currency utils", oracle: "unit", deps: [], status: "merged", pr: "#3" },
        { id: "m0-model", title: "Holding / asset-class / lot data model + Zod", oracle: "unit", deps: ["m0-money"], status: "merged", pr: "#4" },
        { id: "m0-fixtures", title: "Seed a diverse fixture portfolio", oracle: "unit", deps: ["m0-model"], status: "merged", pr: "#5" },
        { id: "m0-returns", title: "Returns engine: TWR, MWR, XIRR", oracle: "unit", deps: ["m0-model"], status: "active" },
        { id: "m0-alloc", title: "Allocation + rebalancing-drift engine", oracle: "unit", deps: ["m0-model"], status: "active" },
        { id: "m0-risk", title: "Risk metrics: vol, drawdown, Sharpe", oracle: "unit", deps: ["m0-returns"], status: "backlog" },
        { id: "m0-app", title: "Vite+React+TS+Tailwind+shadcn app shell", oracle: "e2e", deps: [], status: "merged", pr: "#2" },
        { id: "m0-charts", title: "Reusable charting kit", oracle: "e2e+screenshot", deps: ["m0-app"], status: "backlog" },
        { id: "m0-networth", title: "Net-worth-over-time visualization", oracle: "e2e+screenshot", deps: ["m0-returns", "m0-charts", "m0-fixtures"], status: "backlog" },
      ],
    },
    {
      id: "m1",
      title: "Backend + live data",
      units: [
        { id: "m1-convex", title: "Convex schema + queries", oracle: "unit", deps: ["m0-model"], status: "blocked", note: "needs Convex project provisioning (human)" },
        { id: "m1-equities", title: "Equities/ETF price adapter (Alpha Vantage)", oracle: "unit", deps: ["m1-convex"], status: "backlog" },
        { id: "m1-fx", title: "FX adapter (frankfurter.dev)", oracle: "unit", deps: ["m1-convex"], status: "backlog" },
        { id: "m1-crypto", title: "Crypto adapter (CoinGecko)", oracle: "unit", deps: ["m1-convex"], status: "backlog" },
        { id: "m1-macro", title: "Macro adapter (FRED): rates, CPI", oracle: "unit", deps: ["m1-convex"], status: "backlog" },
        { id: "m1-weather", title: "Weather/world adapter (Open-Meteo, World Bank)", oracle: "unit", deps: ["m1-convex"], status: "backlog" },
      ],
    },
    {
      id: "m4",
      title: "Ops cockpit",
      units: [
        { id: "m4-ops", title: "/ops page rendering harness state", oracle: "e2e", deps: ["m0-app"], status: "active", pr: "#m4-ops" },
      ],
    },
  ],
};
