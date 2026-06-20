import { describe, expect, it } from "vitest";

import { ROUTES, matchRoute, type RouteDef } from "./routes";

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
});
