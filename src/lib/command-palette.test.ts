import { describe, expect, it } from "vitest";

import {
  buildCommands,
  commandHref,
  filterCommands,
  fuzzyMatch,
  type Command,
} from "./command-palette";
import { ROUTES } from "./routes";

describe("buildCommands", () => {
  it("includes the quick actions first (no recents), then one command per route", () => {
    const commands = buildCommands();
    // With no recent pages, the two fixed quick actions lead the list.
    expect(commands[0].id).toBe("action:dashboard");
    expect(commands[1].id).toBe("action:toggle-theme");
    // Every route is represented exactly once by a `route:` navigation command.
    const routeIds = commands
      .filter((c) => c.id.startsWith("route:"))
      .map((c) => c.id);
    expect(routeIds).toHaveLength(ROUTES.length);
    for (const route of ROUTES) {
      expect(routeIds).toContain(`route:${route.path}`);
    }
  });

  it("labels navigation commands with their route label + group hint", () => {
    const commands = buildCommands();
    const fees = commands.find((c) => c.id === "route:/fees");
    expect(fees?.label).toBe("Fees");
    expect(fees?.hint).toBe("Policy");
  });

  it("stays in sync with the registry as it grows (no second list)", () => {
    // Generated from ROUTES, so the `route:` command count must track the
    // registry exactly. (Deep-link sub-views are also navigation-kind but carry
    // their own `deeplink:` id prefix.)
    const routeCount = buildCommands().filter((c) =>
      c.id.startsWith("route:"),
    ).length;
    expect(routeCount).toBe(ROUTES.length);
  });

  it("emits one reporting-currency command per supported currency", () => {
    const commands = buildCommands();
    const currencyCmds = commands.filter((c) => c.kind === "currency");
    expect(currencyCmds.map((c) => c.currencyCode)).toEqual([
      "USD",
      "EUR",
      "GBP",
      "CHF",
    ]);
    // Each currency command navigates nowhere (it switches state).
    for (const c of currencyCmds) {
      expect(commandHref(c)).toBeUndefined();
    }
  });

  it("marks the current reporting currency as (current)", () => {
    const commands = buildCommands({ currentCurrency: "EUR" });
    const eur = commands.find((c) => c.id === "currency:EUR");
    const usd = commands.find((c) => c.id === "currency:USD");
    expect(eur?.label).toContain("(current)");
    expect(usd?.label).not.toContain("(current)");
  });

  it("includes curated deep-link sub-views with full hrefs", () => {
    const commands = buildCommands();
    const gfc = commands.find((c) => c.id === "deeplink:stress:gfc-2008");
    expect(gfc?.kind).toBe("navigation");
    expect(commandHref(gfc!)).toBe("#/stress?e=gfc-2008");
  });

  it("floats recently visited routes to the top as 'Recent' commands", () => {
    const commands = buildCommands({ recentPaths: ["/fees", "/risk"] });
    expect(commands[0].id).toBe("recent:/fees");
    expect(commands[0].hint).toBe("Recent");
    expect(commands[0].label).toBe("Fees");
    expect(commands[1].id).toBe("recent:/risk");
    // The fixed quick actions follow the recents.
    expect(commands[2].id).toBe("action:dashboard");
  });

  it("ignores recent paths that no longer resolve to a route", () => {
    const commands = buildCommands({
      recentPaths: ["/gone", "/fees", "/fees"],
    });
    const recents = commands.filter((c) => c.id.startsWith("recent:"));
    expect(recents.map((c) => c.id)).toEqual(["recent:/fees"]);
  });

  // --- Adversarial / edge-case coverage (independent tester) -----------------

  it("normalizes a lowercase / padded currentCurrency before matching (current)", () => {
    // The shell could hand us an un-normalized value; "(current)" must still
    // attach to exactly the matching currency and nothing else.
    const commands = buildCommands({ currentCurrency: "  eur " });
    const eur = commands.find((c) => c.id === "currency:EUR");
    const usd = commands.find((c) => c.id === "currency:USD");
    expect(eur?.label).toContain("(current)");
    expect(usd?.label).not.toContain("(current)");
  });

  it("marks no currency current for an unknown currentCurrency", () => {
    const commands = buildCommands({ currentCurrency: "JPY" });
    const marked = commands.filter(
      (c) => c.kind === "currency" && c.label.includes("(current)"),
    );
    expect(marked).toHaveLength(0);
  });

  it("emits globally unique command ids across every section", () => {
    // Recents, actions, currencies, routes and deep links must never collide on
    // id (it is the React key and the e2e data-testid suffix).
    const commands = buildCommands({ recentPaths: ["/fees", "/risk"] });
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every navigation command exposes a usable hash href; non-nav ones do not", () => {
    const commands = buildCommands({ recentPaths: ["/fees"] });
    for (const c of commands) {
      const href = commandHref(c);
      if (c.kind === "navigation") {
        expect(href).toBeDefined();
        expect(href!.startsWith("#/")).toBe(true);
      } else {
        expect(href).toBeUndefined();
      }
    }
  });

  it("a recent route still also appears as its normal route command (no removal)", () => {
    // Floating a page to the top must not delete its registry entry, so the
    // page is reachable both as 'Recent' and in its group.
    const commands = buildCommands({ recentPaths: ["/fees"] });
    expect(commands.some((c) => c.id === "recent:/fees")).toBe(true);
    expect(commands.some((c) => c.id === "route:/fees")).toBe(true);
  });
});

describe("commandHref", () => {
  it("returns the hash href for a navigation command", () => {
    const cmd: Command = {
      id: "route:/risk",
      label: "Risk",
      hint: "Risk",
      kind: "navigation",
      href: "#/risk",
    };
    expect(commandHref(cmd)).toBe("#/risk");
  });

  it("returns the deep-link href for a generated route command", () => {
    const risk = buildCommands().find((c) => c.id === "route:/risk");
    expect(commandHref(risk!)).toBe("#/risk");
  });

  it("returns undefined for an action command", () => {
    const cmd: Command = {
      id: "action:toggle-theme",
      label: "Toggle theme",
      hint: "Quick action",
      kind: "action",
    };
    expect(commandHref(cmd)).toBeUndefined();
  });

  it("returns undefined for a currency command", () => {
    const cmd: Command = {
      id: "currency:EUR",
      label: "Reporting currency → EUR",
      hint: "Currency",
      kind: "currency",
      currencyCode: "EUR",
    };
    expect(commandHref(cmd)).toBeUndefined();
  });
});

describe("fuzzyMatch", () => {
  it("matches a subsequence in order, case-insensitively", () => {
    expect(fuzzyMatch("cshf", "Cashflow")).toBe(true);
    expect(fuzzyMatch("RISK", "risk")).toBe(true);
  });

  it("does not match characters out of order", () => {
    expect(fuzzyMatch("fhsc", "Cashflow")).toBe(false);
  });

  it("matches everything for an empty/whitespace query", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
    expect(fuzzyMatch("   ", "anything")).toBe(true);
  });
});

describe("filterCommands", () => {
  const commands = buildCommands();

  it("returns the full list (registry order) for an empty query", () => {
    const result = filterCommands("", commands);
    expect(result).toHaveLength(commands.length);
    expect(result[0].id).toBe("action:dashboard");
  });

  it("ranks an exact label match to the top", () => {
    const result = filterCommands("Fees", commands);
    expect(result[0].label).toBe("Fees");
  });

  it("ranks a prefix match above a mere substring match", () => {
    // "re" is a prefix of "Reports"/"Rebalance" and a substring of others.
    const result = filterCommands("re", commands);
    const top = result[0].label.toLowerCase();
    expect(top.startsWith("re")).toBe(true);
  });

  it("finds a page via hidden keywords (money → Cashflow not present, but dark → theme)", () => {
    const result = filterCommands("dark", commands);
    expect(result.some((c) => c.id === "action:toggle-theme")).toBe(true);
  });

  it("supports fuzzy matching across the haystack", () => {
    const result = filterCommands("cshflw", commands);
    expect(result.some((c) => c.id === "route:/cashflow")).toBe(true);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterCommands("zzzxqq", commands)).toHaveLength(0);
  });

  it("does not mutate the input array", () => {
    const before = commands.map((c) => c.id);
    filterCommands("risk", commands);
    expect(commands.map((c) => c.id)).toEqual(before);
  });

  // --- Adversarial / edge-case coverage (independent tester) -----------------

  it("ignores surrounding whitespace in the query (trims before scoring)", () => {
    const padded = filterCommands("  fees  ", commands);
    const tight = filterCommands("fees", commands);
    // A query of only-whitespace is treated as empty (full list, registry order).
    expect(filterCommands("   ", commands)).toHaveLength(commands.length);
    // Padded vs tight produce the same ranked result set.
    expect(padded.map((c) => c.id)).toEqual(tight.map((c) => c.id));
    expect(padded[0]?.label).toBe("Fees");
  });

  it("ranks exact > prefix > substring > keyword > fuzzy deterministically", () => {
    // Construct commands that hit each tier for the query "ab".
    const probe: Command[] = [
      { id: "fuzzy", label: "a x b", hint: "", kind: "action" }, // subsequence only
      { id: "keyword", label: "zzz", hint: "", kind: "action", keywords: "ab" },
      { id: "substr", label: "zabz", hint: "", kind: "action" },
      { id: "prefix", label: "abz", hint: "", kind: "action" },
      { id: "exact", label: "ab", hint: "", kind: "action" },
    ];
    const ranked = filterCommands("ab", probe).map((c) => c.id);
    expect(ranked).toEqual(["exact", "prefix", "substr", "keyword", "fuzzy"]);
  });

  it("breaks score ties by preserving registry order (stable sort)", () => {
    // Two routes whose labels are equal-length exact-prefix matches of the query
    // tie on score; the earlier-in-registry one must stay first.
    const ties: Command[] = [
      { id: "first", label: "Risk", hint: "", kind: "navigation" },
      { id: "second", label: "Risk", hint: "", kind: "navigation" },
    ];
    expect(filterCommands("ris", ties).map((c) => c.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("matches a query case-insensitively regardless of label casing", () => {
    const res = filterCommands("FEES", commands);
    expect(res[0]?.label).toBe("Fees");
  });

  it("commandHref handles a route whose path contains a hyphen", () => {
    const lookthrough = commands.find((c) => c.label === "Look-through");
    // Guard: only assert if such a route exists in the registry.
    if (lookthrough) {
      expect(commandHref(lookthrough)?.startsWith("#/")).toBe(true);
    }
    // The dashboard quick action is NOT a navigation command -> no href.
    const dash = commands.find((c) => c.id === "action:dashboard");
    expect(dash && commandHref(dash)).toBeUndefined();
  });

  it("fuzzyMatch requires every query char (a near-miss fails)", () => {
    // All but the final char are present in order -> still a non-match.
    expect(fuzzyMatch("cashx", "Cashflow")).toBe(false);
  });
});
