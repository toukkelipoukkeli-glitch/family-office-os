import { lazy, Suspense } from "react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteFallback } from "@/components/RouteFallback";
import { matchRoute } from "@/lib/routes";
import { useHashRoute } from "@/lib/use-hash-route";

/**
 * Route-level code-splitting, driven by the typed route registry.
 *
 * Routes live in {@link ROUTES} (see `@/lib/routes`); both this resolver and the
 * dashboard navigation are generated from that single source of truth. Every
 * page is loaded through `React.lazy`, so each route ships as its own JS chunk
 * fetched on demand instead of being bundled into one >500 kB file. The
 * `<Suspense>` boundary renders {@link RouteFallback} while a chunk loads, and
 * the outer `<ErrorBoundary>` ensures a render error in any single page degrades
 * to an inline error card rather than blanking the whole app.
 */
const Dashboard = lazy(() => import("@/Dashboard"));

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

  const route = matchRoute(path);
  if (!route) return <Dashboard />;

  // Forward the current path to prefix-matched routes (e.g. the pipeline board
  // drilling into `/pipeline/<id>`); exact routes take no props.
  const Page = route.component;
  return route.matchPrefix ? <Page path={path} /> : <Page />;
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
