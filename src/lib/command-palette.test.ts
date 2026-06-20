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
  it("includes the quick actions first, then one command per route", () => {
    const commands = buildCommands();
    // The two fixed quick actions lead the list.
    expect(commands[0].id).toBe("action:dashboard");
    expect(commands[1].id).toBe("action:toggle-theme");
    // Every route is represented exactly once.
    const navIds = commands
      .filter((c) => c.kind === "navigation")
      .map((c) => c.id);
    expect(navIds).toHaveLength(ROUTES.length);
    for (const route of ROUTES) {
      expect(navIds).toContain(`route:${route.path}`);
    }
  });

  it("labels navigation commands with their route label + group hint", () => {
    const commands = buildCommands();
    const fees = commands.find((c) => c.id === "route:/fees");
    expect(fees?.label).toBe("Fees");
    expect(fees?.hint).toBe("Policy");
  });

  it("stays in sync with the registry as it grows (no second list)", () => {
    // Generated from ROUTES, so the count must track the registry exactly.
    const navCount = buildCommands().filter(
      (c) => c.kind === "navigation",
    ).length;
    expect(navCount).toBe(ROUTES.length);
  });
});

describe("commandHref", () => {
  it("returns the hash href for a navigation command", () => {
    const cmd: Command = {
      id: "route:/risk",
      label: "Risk",
      hint: "Risk",
      kind: "navigation",
    };
    expect(commandHref(cmd)).toBe("#/risk");
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
});
