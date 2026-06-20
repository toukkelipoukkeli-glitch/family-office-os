import { describe, expect, it } from "vitest";

import { routeAnnouncement, routeTitle } from "./route-title";

describe("routeTitle", () => {
  it("maps the root and empty path to Overview", () => {
    expect(routeTitle("/")).toBe("Overview");
    expect(routeTitle("")).toBe("Overview");
  });

  it("uses the registry label for a known route", () => {
    expect(routeTitle("/charts")).toBe("Charts");
    expect(routeTitle("/ops")).toBe("Ops cockpit");
    expect(routeTitle("/tax-timeline")).toBe("Tax timeline");
  });

  it("resolves prefix-matched sub-paths to the base route label", () => {
    expect(routeTitle("/pipeline/acme")).toBe("Pipeline");
  });

  it("falls back to Overview for an unknown path (matches routing fallback)", () => {
    expect(routeTitle("/does-not-exist")).toBe("Overview");
  });

  it("labels the crash-test route as Error", () => {
    expect(routeTitle("/crash-test")).toBe("Error");
  });
});

describe("routeAnnouncement", () => {
  it("appends 'page' to the route title", () => {
    expect(routeAnnouncement("/charts")).toBe("Charts page");
    expect(routeAnnouncement("/")).toBe("Overview page");
  });
});
