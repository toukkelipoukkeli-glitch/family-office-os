import { lazy, Suspense } from "react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteFallback } from "@/components/RouteFallback";
import { useHashRoute } from "@/lib/use-hash-route";

/**
 * Route-level code-splitting.
 *
 * Every page is loaded through `React.lazy`, so each route ships as its own JS
 * chunk fetched on demand instead of being bundled into one >500 kB file. The
 * `<Suspense>` boundary renders {@link RouteFallback} while a chunk loads, and
 * the outer `<ErrorBoundary>` ensures a render error in any single page degrades
 * to an inline error card rather than blanking the whole app.
 *
 * `React.lazy` requires a module with a `default` export, so named-export pages
 * are adapted inline to `{ default: ... }`.
 */
const Dashboard = lazy(() => import("@/Dashboard"));
const OpsPage = lazy(() => import("@/ops/OpsPage"));
const CapTablePage = lazy(() => import("@/captable/CapTablePage"));
const TaxLotsPage = lazy(() => import("@/taxlots/TaxLotsPage"));
const HarvestPage = lazy(() => import("@/harvest/HarvestPage"));
const OrgChartPage = lazy(() => import("@/org/OrgChartPage"));
const FeesPage = lazy(() => import("@/fees/FeesPage"));
const LookThroughPage = lazy(() => import("@/lookthrough/LookThroughPage"));
const EstatePlannerPage = lazy(() => import("@/estate/EstatePlannerPage"));
const CompanyProfilePage = lazy(() => import("@/company/CompanyProfilePage"));
const PipelinePage = lazy(() => import("@/pipeline/PipelinePage"));
const PrivateMarketsPage = lazy(
  () => import("@/privatemarkets/PrivateMarketsPage"),
);

const AlertsPage = lazy(() =>
  import("@/alerts/AlertsPage").then((m) => ({ default: m.AlertsPage })),
);
const AttributionPage = lazy(() =>
  import("@/attribution/AttributionPage").then((m) => ({
    default: m.AttributionPage,
  })),
);
const BenchmarkPage = lazy(() =>
  import("@/benchmark/BenchmarkPage").then((m) => ({
    default: m.BenchmarkPage,
  })),
);
const ChartsGalleryPage = lazy(() =>
  import("@/components/charts/charts-gallery").then((m) => ({
    default: m.ChartsGalleryPage,
  })),
);
const OwnershipGraphPage = lazy(() =>
  import("@/components/ownership/ownership-graph-page").then((m) => ({
    default: m.OwnershipGraphPage,
  })),
);
const ScenarioCockpit = lazy(() =>
  import("@/scenario/ScenarioCockpitPage").then((m) => ({
    default: m.ScenarioCockpit,
  })),
);
const RelationshipGraphPage = lazy(() =>
  import("@/relationship/RelationshipGraphPage").then((m) => ({
    default: m.RelationshipGraphPage,
  })),
);

/**
 * A route that always throws on render. It exists only to prove the app-level
 * error boundary catches a page crash without blanking the shell — the e2e
 * boundary test navigates here. It renders nothing user-facing in normal use
 * because no navigation links to it.
 */
function CrashTestRoute(): never {
  throw new Error("Intentional crash to exercise the error boundary");
}

/** Resolve the current hash path to a page element. */
function routeElement(path: string) {
  if (path === "/crash-test") return <CrashTestRoute />;
  if (path === "/ops") return <OpsPage />;
  if (path === "/captable") return <CapTablePage />;
  if (path === "/taxlots") return <TaxLotsPage />;
  if (path === "/harvest") return <HarvestPage />;
  if (path === "/alerts") return <AlertsPage />;
  if (path === "/org") return <OrgChartPage />;
  if (path === "/charts") return <ChartsGalleryPage />;
  if (path === "/scenarios") return <ScenarioCockpit />;
  if (path === "/attribution") return <AttributionPage />;
  if (path === "/benchmark") return <BenchmarkPage />;
  if (path === "/fees") return <FeesPage />;
  if (path === "/ownership") return <OwnershipGraphPage />;
  if (path === "/lookthrough") return <LookThroughPage />;
  if (path === "/privatemarkets") return <PrivateMarketsPage />;
  if (path === "/estate") return <EstatePlannerPage />;
  if (path === "/pipeline" || path.startsWith("/pipeline/")) {
    return <PipelinePage path={path} />;
  }
  if (path === "/companies") return <CompanyProfilePage />;
  if (path === "/relationships") return <RelationshipGraphPage />;
  return <Dashboard />;
}

function App() {
  const path = useHashRoute();

  return (
    <ErrorBoundary
      // Reset the boundary's error state whenever the route changes so a user
      // can navigate away from a crashed page without a full reload.
      key={path}
    >
      <Suspense fallback={<RouteFallback />}>{routeElement(path)}</Suspense>
    </ErrorBoundary>
  );
}

export default App;
