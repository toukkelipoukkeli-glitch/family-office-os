import { describe, expect, it } from "vitest";

import {
  ROUTES,
  filterScopeForPath,
  matchRoute,
  type RouteDef,
} from "./routes";

describe("route registry", () => {
  it("has unique paths", () => {
    const paths = ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("has unique nav test ids", () => {
    const ids = ROUTES.map((r) => r.navTestId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every route path starts with a slash and has a non-empty label", () => {
    for (const r of ROUTES) {
      expect(r.path.startsWith("/")).toBe(true);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.navTestId).toMatch(/^nav-/);
    }
  });

  it("every route has a lazily-loaded component", () => {
    for (const r of ROUTES) {
      // React.lazy components are exotic objects with a $$typeof tag and a
      // payload — assert they are truthy callables/objects, not undefined.
      expect(r.component).toBeTruthy();
      expect(typeof r.component).toBe("object");
    }
  });

  it("matchRoute resolves every registered path to its own definition", () => {
    for (const r of ROUTES) {
      const match = matchRoute(r.path);
      expect(match, `path ${r.path} should resolve`).toBe(r);
    }
  });

  it("matchRoute returns undefined for unknown paths (dashboard fallback)", () => {
    expect(matchRoute("/")).toBeUndefined();
    expect(matchRoute("/does-not-exist")).toBeUndefined();
    expect(matchRoute("")).toBeUndefined();
  });

  it("exact routes do not match a query suffix", () => {
    // Preserves the original behaviour: `/ops?tab=x` must NOT resolve to /ops.
    expect(matchRoute("/ops?tab=blocked")).toBeUndefined();
    expect(matchRoute("/reports?foo")).toBeUndefined();
  });

  it("prefix routes match sub-paths but exact routes do not", () => {
    const pipeline = ROUTES.find((r) => r.path === "/pipeline") as RouteDef;
    expect(pipeline.matchPrefix).toBe(true);
    expect(matchRoute("/pipeline")).toBe(pipeline);
    expect(matchRoute("/pipeline/acme-corp")).toBe(pipeline);

    // An exact route must NOT swallow sub-paths.
    expect(matchRoute("/reports/extra")).toBeUndefined();
  });

  it("includes all 38 expected dashboard routes in order", () => {
    const navPaths = ROUTES.filter((r) => r.nav !== false).map((r) => r.path);
    expect(navPaths).toEqual([
      "/home",
      "/reports",
      "/insights",
      "/charts",
      "/scenarios",
      "/stress",
      "/attribution",
      "/factors",
      "/benchmark",
      "/managers",
      "/alerts",
      "/ips",
      "/rebalance",
      "/fees",
      "/captable",
      "/taxlots",
      "/harvest",
      "/ownership",
      "/pipeline",
      "/companies",
      "/lookthrough",
      "/consolidation",
      "/risk",
      "/concentration",
      "/privatemarkets",
      "/cashflow",
      "/liquidity",
      "/currency",
      "/data-quality",
      "/org",
      "/relationships",
      "/estate",
      "/giving",
      "/goals",
      "/tax-timeline",
      "/insurance",
      "/vault",
      "/ops",
    ]);
  });

  it("every route maps to a recognised group", () => {
    const groups = new Set([
      "overview",
      "performance",
      "policy",
      "holdings",
      "structure",
      "risk",
      "planning",
      "ops",
    ]);
    for (const r of ROUTES) {
      expect(groups.has(r.group)).toBe(true);
    }
  });

  // --- Adversarial: lock the registry against silent regressions ---------

  // A frozen snapshot of (path, label, navTestId) for every route, in order.
  // This is the no-regressions contract: routes/URLs and the e2e selectors that
  // depend on them must not be renamed, dropped, reordered, or relabelled by a
  // future refactor without a deliberate, reviewable change here. Mirrors the
  // hand-written routing/nav that existed on `main` before the registry.
  it("matches the frozen path/label/navTestId contract (no silent drift)", () => {
    const tuples = ROUTES.map((r) => [r.path, r.label, r.navTestId]);
    expect(tuples).toEqual([
      ["/home", "Overview", "nav-home"],
      ["/reports", "Reports", "nav-reports"],
      ["/insights", "AI insights", "nav-insights"],
      ["/charts", "Charts", "nav-charts"],
      ["/scenarios", "Scenarios", "nav-scenarios"],
      ["/stress", "Stress tests", "nav-stress"],
      ["/attribution", "Attribution", "nav-attribution"],
      ["/factors", "Factors", "nav-factors"],
      ["/benchmark", "Benchmark", "nav-benchmark"],
      ["/managers", "Managers", "nav-managers"],
      ["/alerts", "Alerts", "nav-alerts"],
      ["/ips", "IPS", "nav-ips"],
      ["/rebalance", "Rebalance", "nav-rebalance"],
      ["/fees", "Fees", "nav-fees"],
      ["/captable", "Cap table", "nav-captable"],
      ["/taxlots", "Tax lots", "nav-taxlots"],
      ["/harvest", "Harvest", "nav-harvest"],
      ["/ownership", "Ownership", "nav-ownership"],
      ["/pipeline", "Pipeline", "nav-pipeline"],
      ["/companies", "Companies", "nav-companies"],
      ["/lookthrough", "Look-through", "nav-lookthrough"],
      ["/consolidation", "Consolidation", "nav-consolidation"],
      ["/risk", "Risk", "nav-risk"],
      ["/concentration", "Concentration", "nav-concentration"],
      ["/privatemarkets", "Private markets", "nav-privatemarkets"],
      ["/cashflow", "Cashflow", "nav-cashflow"],
      ["/liquidity", "Liquidity", "nav-liquidity"],
      ["/currency", "Currency", "nav-currency"],
      ["/data-quality", "Data quality", "nav-data-quality"],
      ["/org", "Org chart", "nav-org"],
      ["/relationships", "Relationships", "nav-relationships"],
      ["/estate", "Estate", "nav-estate"],
      ["/giving", "Giving", "nav-giving"],
      ["/goals", "Goals", "nav-goals"],
      ["/tax-timeline", "Tax timeline", "nav-tax-timeline"],
      ["/insurance", "Insurance", "nav-insurance"],
      ["/vault", "Vault", "nav-vault"],
      ["/ops", "Ops cockpit", "nav-ops"],
    ]);
  });

  it("exactly one route is prefix-matched (only /pipeline)", () => {
    const prefixed = ROUTES.filter((r) => r.matchPrefix).map((r) => r.path);
    expect(prefixed).toEqual(["/pipeline"]);
  });

  it("the prefix route does not swallow a sibling with a shared name stem", () => {
    // `/pipeline` must not match `/pipelinexyz` — the boundary is `/pipeline/`,
    // not the bare prefix string.
    expect(matchRoute("/pipelinexyz")).toBeUndefined();
    expect(matchRoute("/pipeline-archive")).toBeUndefined();
  });

  it("a bare trailing slash does not resolve an exact route", () => {
    // The original exact-string check never normalised trailing slashes; keep
    // that behaviour so `/reports/` falls back to the dashboard rather than
    // silently aliasing `/reports`.
    expect(matchRoute("/reports/")).toBeUndefined();
    // `/pipeline/` IS a prefix match (drills into an empty id) — unchanged.
    expect(matchRoute("/pipeline/")?.path).toBe("/pipeline");
  });

  it("matchRoute is case-sensitive (original behaviour)", () => {
    expect(matchRoute("/Reports")).toBeUndefined();
    expect(matchRoute("/HOME")).toBeUndefined();
  });

  // --- Filter scope (m13: tag-filter consistency) ------------------------

  it("the dashboard fallback always applies the tag filter", () => {
    // The net-worth dashboard is the holding-portfolio view: the filter narrows
    // it, so `/` (and any unmatched path that falls back to the dashboard)
    // resolves to "applies".
    expect(filterScopeForPath("/")).toBe("applies");
    expect(filterScopeForPath("/does-not-exist")).toBe("applies");
  });

  it("registered routes default to an inert (n/a) filter scope", () => {
    // No registered route is wired to narrow by holding tags today, so every one
    // resolves to "n/a" — the shared control renders visibly inert there rather
    // than pretending to filter.
    for (const r of ROUTES) {
      expect(
        filterScopeForPath(r.path),
        `route ${r.path} should be n/a unless it opts in`,
      ).toBe(r.filterScope ?? "n/a");
    }
  });

  it("filterScope is always one of the two known values", () => {
    for (const r of ROUTES) {
      if (r.filterScope !== undefined) {
        expect(["applies", "n/a"]).toContain(r.filterScope);
      }
    }
  });

  it("prefix routes resolve filter scope for their sub-paths too", () => {
    // `/pipeline/<id>` must resolve the same scope as `/pipeline` (it is the
    // same page) — the control can't flip between active/inert mid-drilldown.
    expect(filterScopeForPath("/pipeline/acme-corp")).toBe(
      filterScopeForPath("/pipeline"),
    );
  });

  it("every nav testid is derivable from its path segment", () => {
    // Catches a copy-paste where a route keeps another route's testid: the part
    // after `nav-` must equal the path with `/` stripped (paths have no nested
    // segments in the nav set).
    for (const r of ROUTES) {
      expect(r.navTestId).toBe(`nav-${r.path.slice(1)}`);
    }
  });
});
