import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Typed route registry — the single source of truth for the app's routes and
 * the dashboard navigation.
 *
 * Both {@link App}'s route resolver and the {@link Dashboard} nav are generated
 * from this one array, so adding a route in one place wires up both routing and
 * navigation. Every page is loaded through `React.lazy` for route-level
 * code-splitting; `React.lazy` requires a module with a `default` export, so
 * named-export pages are adapted inline to `{ default: ... }`.
 */

/** Logical grouping for a route, used to organise the dashboard navigation. */
export type RouteGroup =
  | "overview"
  | "performance"
  | "policy"
  | "holdings"
  | "structure"
  | "risk"
  | "planning"
  | "ops";

/**
 * Props every lazily-loaded page component may receive. Most pages take no
 * props; route-aware pages (e.g. the pipeline board) receive the current hash
 * `path` so they can render sub-views without their own router.
 */
export interface RoutePageProps {
  /** The current hash path (e.g. `/pipeline/acme`). */
  path: string;
}

/**
 * A page component as stored in the registry.
 *
 * Pages are rendered either with no props or with the current `path` (for
 * prefix-matched routes). Individual pages also accept their own optional,
 * fixture-defaulted props (e.g. `{ plan?: … }`) which are never supplied here,
 * so the registry models them with permissive props and the route resolver
 * passes only `path` when needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PageComponent = ComponentType<any>;

/** One entry in the route registry. */
export interface RouteDef {
  /** Exact hash path, always starting with `/` (e.g. `/reports`). */
  path: string;
  /** Human label shown in the dashboard navigation. */
  label: string;
  /** Logical group, used to order/segment the navigation. */
  group: RouteGroup;
  /** `data-testid` for this route's nav link in the dashboard. */
  navTestId: string;
  /** Lazily-loaded page component for this route. */
  component: LazyExoticComponent<PageComponent>;
  /**
   * When true, the route also matches sub-paths (e.g. `/pipeline/<id>`) and the
   * current `path` is forwarded to the component as a prop. Defaults to false
   * (exact match only).
   */
  matchPrefix?: boolean;
  /**
   * When false, the route is omitted from the dashboard navigation (it remains
   * routable). Defaults to true.
   */
  nav?: boolean;
}

/** Adapt a named export to the `{ default }` shape `React.lazy` requires. */
function named<T extends PageComponent>(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
): LazyExoticComponent<T> {
  return lazy(() =>
    loader().then((m) => ({ default: m[exportName] as T })),
  );
}

/**
 * The route registry. Order here is the navigation order in the dashboard.
 *
 * IMPORTANT (no-regressions): paths, labels and `navTestId`s must stay exactly
 * in sync with the existing routes/URLs and the e2e selectors that depend on
 * them.
 */
export const ROUTES: readonly RouteDef[] = [
  {
    path: "/home",
    label: "Overview",
    group: "overview",
    navTestId: "nav-home",
    component: lazy(() => import("@/home/HomePage")),
  },
  {
    path: "/reports",
    label: "Reports",
    group: "overview",
    navTestId: "nav-reports",
    component: lazy(() => import("@/reports/ReportsPage")),
  },
  {
    path: "/insights",
    label: "AI insights",
    group: "overview",
    navTestId: "nav-insights",
    component: lazy(() => import("@/insights/InsightsPage")),
  },
  {
    path: "/charts",
    label: "Charts",
    group: "overview",
    navTestId: "nav-charts",
    component: named(
      () => import("@/components/charts/charts-gallery"),
      "ChartsGalleryPage",
    ),
  },
  {
    path: "/scenarios",
    label: "Scenarios",
    group: "performance",
    navTestId: "nav-scenarios",
    component: named(() => import("@/scenario/ScenarioCockpitPage"), "ScenarioCockpit"),
  },
  {
    path: "/stress",
    label: "Stress tests",
    group: "performance",
    navTestId: "nav-stress",
    component: named(() => import("@/stress/StressTestPage"), "StressTestPage"),
  },
  {
    path: "/attribution",
    label: "Attribution",
    group: "performance",
    navTestId: "nav-attribution",
    component: named(() => import("@/attribution/AttributionPage"), "AttributionPage"),
  },
  {
    path: "/factors",
    label: "Factors",
    group: "performance",
    navTestId: "nav-factors",
    component: named(
      () => import("@/factors/FactorAttributionPage"),
      "FactorAttributionPage",
    ),
  },
  {
    path: "/benchmark",
    label: "Benchmark",
    group: "performance",
    navTestId: "nav-benchmark",
    component: named(() => import("@/benchmark/BenchmarkPage"), "BenchmarkPage"),
  },
  {
    path: "/managers",
    label: "Managers",
    group: "performance",
    navTestId: "nav-managers",
    component: named(
      () => import("@/managers/ManagerScorecardPage"),
      "ManagerScorecardPage",
    ),
  },
  {
    path: "/alerts",
    label: "Alerts",
    group: "policy",
    navTestId: "nav-alerts",
    component: named(() => import("@/alerts/AlertsPage"), "AlertsPage"),
  },
  {
    path: "/ips",
    label: "IPS",
    group: "policy",
    navTestId: "nav-ips",
    component: named(() => import("@/ips/IpsPage"), "IpsPage"),
  },
  {
    path: "/rebalance",
    label: "Rebalance",
    group: "policy",
    navTestId: "nav-rebalance",
    component: named(() => import("@/rebalance/RebalancePage"), "RebalancePage"),
  },
  {
    path: "/fees",
    label: "Fees",
    group: "policy",
    navTestId: "nav-fees",
    component: lazy(() => import("@/fees/FeesPage")),
  },
  {
    path: "/captable",
    label: "Cap table",
    group: "holdings",
    navTestId: "nav-captable",
    component: lazy(() => import("@/captable/CapTablePage")),
  },
  {
    path: "/taxlots",
    label: "Tax lots",
    group: "holdings",
    navTestId: "nav-taxlots",
    component: lazy(() => import("@/taxlots/TaxLotsPage")),
  },
  {
    path: "/harvest",
    label: "Harvest",
    group: "holdings",
    navTestId: "nav-harvest",
    component: lazy(() => import("@/harvest/HarvestPage")),
  },
  {
    path: "/ownership",
    label: "Ownership",
    group: "structure",
    navTestId: "nav-ownership",
    component: named(
      () => import("@/components/ownership/ownership-graph-page"),
      "OwnershipGraphPage",
    ),
  },
  {
    path: "/pipeline",
    label: "Pipeline",
    group: "holdings",
    navTestId: "nav-pipeline",
    component: lazy(() => import("@/pipeline/PipelinePage")),
    matchPrefix: true,
  },
  {
    path: "/companies",
    label: "Companies",
    group: "holdings",
    navTestId: "nav-companies",
    component: lazy(() => import("@/company/CompanyProfilePage")),
  },
  {
    path: "/lookthrough",
    label: "Look-through",
    group: "structure",
    navTestId: "nav-lookthrough",
    component: lazy(() => import("@/lookthrough/LookThroughPage")),
  },
  {
    path: "/consolidation",
    label: "Consolidation",
    group: "structure",
    navTestId: "nav-consolidation",
    component: lazy(() => import("@/consolidation/ConsolidationPage")),
  },
  {
    path: "/risk",
    label: "Risk",
    group: "risk",
    navTestId: "nav-risk",
    component: lazy(() => import("@/risk/RiskCockpitPage")),
  },
  {
    path: "/concentration",
    label: "Concentration",
    group: "risk",
    navTestId: "nav-concentration",
    component: lazy(() => import("@/concentration/ConcentrationPage")),
  },
  {
    path: "/privatemarkets",
    label: "Private markets",
    group: "holdings",
    navTestId: "nav-privatemarkets",
    component: lazy(() => import("@/privatemarkets/PrivateMarketsPage")),
  },
  {
    path: "/cashflow",
    label: "Cashflow",
    group: "risk",
    navTestId: "nav-cashflow",
    component: lazy(() => import("@/cashflow/CashflowPage")),
  },
  {
    path: "/liquidity",
    label: "Liquidity",
    group: "risk",
    navTestId: "nav-liquidity",
    component: lazy(() => import("@/liquidity/LiquidityPage")),
  },
  {
    path: "/currency",
    label: "Currency",
    group: "risk",
    navTestId: "nav-currency",
    component: lazy(() => import("@/currency/CurrencyPage")),
  },
  {
    path: "/data-quality",
    label: "Data quality",
    group: "ops",
    navTestId: "nav-data-quality",
    component: lazy(() => import("@/dataquality/DataQualityPage")),
  },
  {
    path: "/org",
    label: "Org chart",
    group: "structure",
    navTestId: "nav-org",
    component: lazy(() => import("@/org/OrgChartPage")),
  },
  {
    path: "/relationships",
    label: "Relationships",
    group: "structure",
    navTestId: "nav-relationships",
    component: named(
      () => import("@/relationship/RelationshipGraphPage"),
      "RelationshipGraphPage",
    ),
  },
  {
    path: "/estate",
    label: "Estate",
    group: "planning",
    navTestId: "nav-estate",
    component: lazy(() => import("@/estate/EstatePlannerPage")),
  },
  {
    path: "/giving",
    label: "Giving",
    group: "planning",
    navTestId: "nav-giving",
    component: lazy(() => import("@/giving/GivingPage")),
  },
  {
    path: "/goals",
    label: "Goals",
    group: "planning",
    navTestId: "nav-goals",
    component: lazy(() => import("@/goals/GoalFundingPage")),
  },
  {
    path: "/tax-timeline",
    label: "Tax timeline",
    group: "planning",
    navTestId: "nav-tax-timeline",
    component: lazy(() => import("@/taxtimeline/TaxTimelinePage")),
  },
  {
    path: "/insurance",
    label: "Insurance",
    group: "planning",
    navTestId: "nav-insurance",
    component: lazy(() => import("@/insurance/InsurancePage")),
  },
  {
    path: "/vault",
    label: "Vault",
    group: "planning",
    navTestId: "nav-vault",
    component: lazy(() => import("@/vault/VaultPage")),
  },
  {
    path: "/ops",
    label: "Ops cockpit",
    group: "ops",
    navTestId: "nav-ops",
    component: lazy(() => import("@/ops/OpsPage")),
  },
];

/**
 * Resolve a hash path to its route definition, honouring `matchPrefix`. Returns
 * `undefined` when no route matches (callers fall back to the dashboard).
 *
 * Exact routes require an exact string match, so a query suffix such as
 * `/ops?tab=x` does NOT match `/ops` — preserving the existing behaviour.
 */
export function matchRoute(path: string): RouteDef | undefined {
  return ROUTES.find((r) =>
    r.matchPrefix
      ? path === r.path || path.startsWith(`${r.path}/`)
      : path === r.path,
  );
}
