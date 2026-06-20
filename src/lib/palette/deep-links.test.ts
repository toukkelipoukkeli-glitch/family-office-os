import { describe, expect, it } from "vitest";

import { CONSOLIDATION_ENTITIES } from "@/lib/consolidation/fixtures";
import { HISTORICAL_SCENARIOS } from "@/lib/stress/scenarios";
import { matchRoute } from "@/lib/routes";

import { DEEP_LINKS, deepLinkHash } from "./deep-links";

describe("DEEP_LINKS", () => {
  it("derives one deep link per stress episode and consolidation entity", () => {
    const stress = DEEP_LINKS.filter((l) => l.path === "/stress");
    const consolidation = DEEP_LINKS.filter((l) => l.path === "/consolidation");
    expect(stress).toHaveLength(HISTORICAL_SCENARIOS.length);
    expect(consolidation).toHaveLength(CONSOLIDATION_ENTITIES.length);
  });

  it("points every deep link at a real, matchable route", () => {
    for (const link of DEEP_LINKS) {
      // The path (query stripped) must resolve in the route registry.
      expect(matchRoute(link.path)).toBeDefined();
    }
  });

  it("encodes the sub-view selection as a single query param", () => {
    const gfc = DEEP_LINKS.find((l) => l.id === "deeplink:stress:gfc-2008");
    expect(gfc).toBeDefined();
    expect(gfc!.query).toBe("e=gfc-2008");
    expect(gfc!.label).toBe("2008 Global Financial Crisis");

    const trust = DEEP_LINKS.find(
      (l) => l.id === "deeplink:consolidation:trust",
    );
    expect(trust).toBeDefined();
    expect(trust!.query).toBe("entity=trust");
  });

  it("has globally unique deep-link ids", () => {
    const ids = DEEP_LINKS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds a hash that carries both the route and the sub-view query", () => {
    const gfc = DEEP_LINKS.find((l) => l.id === "deeplink:stress:gfc-2008")!;
    expect(deepLinkHash(gfc)).toBe("#/stress?e=gfc-2008");
  });

  it("omits the query from the hash when a deep link has no query", () => {
    expect(
      deepLinkHash({
        id: "x",
        path: "/risk",
        query: "",
        label: "Risk",
        hint: "Risk",
        keywords: "",
      }),
    ).toBe("#/risk");
  });
});
