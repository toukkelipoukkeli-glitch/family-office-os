import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { seededPortfolio } from "@/fixtures";
import type { Portfolio } from "@/lib/model/portfolio";

import { availableTags } from "./holding-filter";
import { readStoredSelection } from "./storage";
import { TagFilterProvider } from "./tag-filter-provider";
import { useFilteredPortfolio, useTagFilter } from "./tag-filter-context";

const KEY = "fo-os:tag-filter";

/** Surfaces provider state for assertions and exposes its mutators as buttons. */
function Probe({ source = seededPortfolio }: { source?: Portfolio }) {
  const { selected, isFiltering, setSelection, toggle, clear } = useTagFilter();
  const filtered = useFilteredPortfolio(source);
  return (
    <div>
      <output data-testid="count">{filtered.holdings.length}</output>
      <output data-testid="selected">
        {[...selected].sort().join(",")}
      </output>
      <output data-testid="filtering">{String(isFiltering)}</output>
      <button
        data-testid="set-ghost"
        onClick={() => setSelection(["core", "ghost-not-real"])}
      />
      <button data-testid="toggle-core" onClick={() => toggle("core")} />
      <button data-testid="clear" onClick={clear} />
    </div>
  );
}

describe("TagFilterProvider (adversarial)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("drops a stale persisted tag on mount and self-heals storage", () => {
    // Persist a real tag plus one the data no longer has.
    window.localStorage.setItem(
      KEY,
      JSON.stringify(["core", "tag-that-no-longer-exists"]),
    );

    render(
      <TagFilterProvider portfolio={seededPortfolio}>
        <Probe />
      </TagFilterProvider>,
    );

    // Only the surviving tag is active...
    expect(screen.getByTestId("selected")).toHaveTextContent("core");
    expect(screen.getByTestId("selected")).not.toHaveTextContent(
      "tag-that-no-longer-exists",
    );
    // ...and storage was rewritten to the reconciled set, so the ghost can
    // never re-seed on the next load.
    expect(readStoredSelection()).toEqual(["core"]);
  });

  it("does not pin the whole book when storage holds only ghost tags", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["ghost-a", "ghost-b"]));
    render(
      <TagFilterProvider portfolio={seededPortfolio}>
        <Probe />
      </TagFilterProvider>,
    );
    // Unfiltered: a fully-stale selection must not silently hide the book.
    expect(screen.getByTestId("filtering")).toHaveTextContent("false");
    expect(screen.getByTestId("count")).toHaveTextContent(
      String(seededPortfolio.holdings.length),
    );
  });

  it("setSelection ignores tags absent from the source portfolio", async () => {
    const user = userEvent.setup();
    render(
      <TagFilterProvider portfolio={seededPortfolio}>
        <Probe />
      </TagFilterProvider>,
    );
    await user.click(screen.getByTestId("set-ghost"));
    // Only the real tag survives; the ghost is silently discarded.
    expect(screen.getByTestId("selected")).toHaveTextContent("core");
    expect(screen.getByTestId("selected")).not.toHaveTextContent("ghost");
  });

  it("recomputes available tags when the source portfolio changes", () => {
    const onlyCore: Portfolio = {
      ...seededPortfolio,
      holdings: seededPortfolio.holdings.map((h) => ({
        ...h,
        tags: h.tags.includes("core") ? ["core"] : [],
      })),
    };
    const { rerender } = render(
      <TagFilterProvider portfolio={seededPortfolio}>
        <Probe />
      </TagFilterProvider>,
    );
    expect(availableTags(seededPortfolio).length).toBeGreaterThan(1);

    // Swap to a portfolio that only has "core". A previously-valid selection of
    // a now-absent tag would be filtered out by setSelection, but available
    // must reflect the new source immediately.
    rerender(
      <TagFilterProvider portfolio={onlyCore}>
        <Probe />
      </TagFilterProvider>,
    );
    expect(availableTags(onlyCore)).toEqual(["core"]);
  });

  it("toggle is reversible and clears back to the whole book", async () => {
    const user = userEvent.setup();
    render(
      <TagFilterProvider portfolio={seededPortfolio}>
        <Probe />
      </TagFilterProvider>,
    );
    const whole = String(seededPortfolio.holdings.length);
    expect(screen.getByTestId("count")).toHaveTextContent(whole);

    await user.click(screen.getByTestId("toggle-core"));
    expect(screen.getByTestId("filtering")).toHaveTextContent("true");

    await user.click(screen.getByTestId("toggle-core"));
    expect(screen.getByTestId("filtering")).toHaveTextContent("false");
    expect(screen.getByTestId("count")).toHaveTextContent(whole);

    await user.click(screen.getByTestId("toggle-core"));
    await user.click(screen.getByTestId("clear"));
    expect(screen.getByTestId("count")).toHaveTextContent(whole);
  });
});
