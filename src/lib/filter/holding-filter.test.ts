import { describe, expect, it } from "vitest";

import { seededPortfolio } from "@/fixtures";
import type { Portfolio } from "@/lib/model/portfolio";

import {
  availableTags,
  filterPortfolioByTags,
  holdingMatchesTags,
  reconcileSelection,
  tagCounts,
} from "./holding-filter";

describe("availableTags", () => {
  it("collects every distinct tag across holdings, sorted", () => {
    const tags = availableTags(seededPortfolio);
    expect(tags).toContain("core");
    expect(tags).toContain("collectible");
    expect(tags).toContain("liquidity");
    // Distinct.
    expect(new Set(tags).size).toBe(tags.length);
    // Sorted (case-insensitive).
    const sorted = [...tags].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" }),
    );
    expect(tags).toEqual(sorted);
  });

  it("returns an empty list when no holding carries a tag", () => {
    const untagged: Portfolio = {
      ...seededPortfolio,
      holdings: seededPortfolio.holdings.map((h) => ({ ...h, tags: [] })),
    };
    expect(availableTags(untagged)).toEqual([]);
  });
});

describe("tagCounts", () => {
  it("counts holdings per tag", () => {
    const counts = tagCounts(seededPortfolio);
    // Two cash holdings are both tagged "liquidity".
    expect(counts.get("liquidity")).toBe(2);
    // "core" is on the equity + the etf.
    expect(counts.get("core")).toBe(2);
  });
});

describe("holdingMatchesTags", () => {
  const apple = seededPortfolio.holdings.find((h) => h.id === "hold-equity-aapl")!;

  it("matches when no tag is selected (identity)", () => {
    expect(holdingMatchesTags(apple, new Set())).toBe(true);
  });

  it("matches on ANY selected tag (OR semantics)", () => {
    expect(holdingMatchesTags(apple, new Set(["tech"]))).toBe(true);
    expect(holdingMatchesTags(apple, new Set(["tech", "nonexistent"]))).toBe(
      true,
    );
  });

  it("does not match when no tag overlaps", () => {
    expect(holdingMatchesTags(apple, new Set(["collectible"]))).toBe(false);
  });
});

describe("filterPortfolioByTags", () => {
  it("returns the same reference for an empty selection", () => {
    expect(filterPortfolioByTags(seededPortfolio, new Set())).toBe(
      seededPortfolio,
    );
  });

  it("narrows to holdings carrying any selected tag", () => {
    const filtered = filterPortfolioByTags(
      seededPortfolio,
      new Set(["collectible"]),
    );
    expect(filtered.holdings.length).toBeGreaterThan(0);
    expect(filtered.holdings.length).toBeLessThan(
      seededPortfolio.holdings.length,
    );
    for (const h of filtered.holdings) {
      expect(h.tags).toContain("collectible");
    }
  });

  it("unions matches across multiple selected tags", () => {
    const core = filterPortfolioByTags(seededPortfolio, new Set(["core"]));
    const liquidity = filterPortfolioByTags(
      seededPortfolio,
      new Set(["liquidity"]),
    );
    const both = filterPortfolioByTags(
      seededPortfolio,
      new Set(["core", "liquidity"]),
    );
    const expected = new Set([
      ...core.holdings.map((h) => h.id),
      ...liquidity.holdings.map((h) => h.id),
    ]);
    expect(new Set(both.holdings.map((h) => h.id))).toEqual(expected);
  });

  it("does not mutate the source portfolio or its holdings", () => {
    const before = JSON.stringify(seededPortfolio);
    const filtered = filterPortfolioByTags(seededPortfolio, new Set(["tech"]));
    expect(JSON.stringify(seededPortfolio)).toBe(before);
    // Holding objects are shared by reference (non-destructive subset).
    for (const h of filtered.holdings) {
      expect(seededPortfolio.holdings).toContain(h);
    }
  });

  it("preserves exact money strings on the surviving holdings", () => {
    const filtered = filterPortfolioByTags(seededPortfolio, new Set(["tech"]));
    const apple = filtered.holdings.find((h) => h.id === "hold-equity-aapl")!;
    expect(apple.valuations[0].value.amount).toBe("108625.00");
  });
});

describe("availableTags (adversarial)", () => {
  it("dedupes a tag that appears twice on a single holding", () => {
    // The Holding schema does not enforce per-holding tag uniqueness, so a
    // holding can legitimately carry the same tag twice. availableTags must
    // still list it once.
    const dup: Portfolio = {
      ...seededPortfolio,
      holdings: seededPortfolio.holdings.map((h, i) =>
        i === 0 ? { ...h, tags: ["dupe", "dupe", "other"] } : { ...h, tags: [] },
      ),
    };
    const tags = availableTags(dup);
    expect(tags.filter((t) => t === "dupe")).toHaveLength(1);
    expect(tags).toEqual(["dupe", "other"]);
  });
});

describe("filterPortfolioByTags (adversarial)", () => {
  it("drops a tag duplicated on one holding to a single membership", () => {
    // A holding carrying the same selected tag twice still appears exactly once
    // in the filtered subset (no duplicate holdings leak through).
    const dup: Portfolio = {
      ...seededPortfolio,
      holdings: seededPortfolio.holdings.map((h, i) =>
        i === 0 ? { ...h, tags: ["dupe", "dupe"] } : h,
      ),
    };
    const filtered = filterPortfolioByTags(dup, new Set(["dupe"]));
    expect(filtered.holdings).toHaveLength(1);
    expect(filtered.holdings[0]?.id).toBe(seededPortfolio.holdings[0]?.id);
  });

  it("returns a fresh portfolio (not the source ref) for a non-empty selection", () => {
    const filtered = filterPortfolioByTags(seededPortfolio, new Set(["core"]));
    expect(filtered).not.toBe(seededPortfolio);
    expect(filtered.holdings).not.toBe(seededPortfolio.holdings);
  });

  it("yields an empty book when no holding carries the selected tag", () => {
    const filtered = filterPortfolioByTags(
      seededPortfolio,
      new Set(["definitely-not-a-real-tag"]),
    );
    expect(filtered.holdings).toEqual([]);
    // Still non-destructive: source is untouched.
    expect(seededPortfolio.holdings.length).toBeGreaterThan(0);
  });
});

describe("reconcileSelection", () => {
  it("drops tags absent from the portfolio and sorts the rest", () => {
    const kept = reconcileSelection(seededPortfolio, [
      "tech",
      "ghost-tag",
      "core",
    ]);
    expect(kept).toEqual(["core", "tech"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(reconcileSelection(seededPortfolio, ["nope"])).toEqual([]);
  });
});
