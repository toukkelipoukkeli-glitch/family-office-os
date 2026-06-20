import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { seededPortfolio } from "@/fixtures";
import {
  TagFilterProvider,
  useFilteredPortfolio,
} from "@/lib/filter";

import { TagFilter } from "./TagFilter";

/** Probe component that surfaces the filtered holding count for assertions. */
function FilteredCount() {
  const filtered = useFilteredPortfolio(seededPortfolio);
  return <output data-testid="count">{filtered.holdings.length}</output>;
}

function renderFilter() {
  return render(
    <TagFilterProvider portfolio={seededPortfolio}>
      <TagFilter />
      <FilteredCount />
    </TagFilterProvider>,
  );
}

describe("TagFilter", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("renders nothing without a provider (no throw)", () => {
    render(<TagFilter />);
    expect(screen.queryByTestId("tag-filter")).not.toBeInTheDocument();
  });

  it("renders the trigger and starts unfiltered (whole book)", () => {
    renderFilter();
    expect(screen.getByTestId("tag-filter")).toBeInTheDocument();
    expect(screen.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-filtering",
      "false",
    );
    expect(screen.getByTestId("count")).toHaveTextContent(
      String(seededPortfolio.holdings.length),
    );
  });

  it("opens the popover and lists every available tag", async () => {
    const user = userEvent.setup();
    renderFilter();
    await user.click(screen.getByTestId("tag-filter"));
    const popover = screen.getByTestId("tag-filter-popover");
    const options = within(popover).getAllByTestId("tag-filter-option");
    // One option per distinct tag in the seeded portfolio.
    const distinct = new Set(
      seededPortfolio.holdings.flatMap((h) => h.tags),
    );
    expect(options).toHaveLength(distinct.size);
  });

  it("selecting a tag narrows the filtered portfolio", async () => {
    const user = userEvent.setup();
    renderFilter();
    await user.click(screen.getByTestId("tag-filter"));
    await user.click(
      screen.getByTestId("tag-filter-popover").querySelector(
        '[data-tag="collectible"]',
      ) as HTMLElement,
    );

    const collectibleCount = seededPortfolio.holdings.filter((h) =>
      h.tags.includes("collectible"),
    ).length;
    expect(screen.getByTestId("count")).toHaveTextContent(
      String(collectibleCount),
    );
    expect(screen.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-filtering",
      "true",
    );
  });

  it("clear resets to the whole book", async () => {
    const user = userEvent.setup();
    renderFilter();
    await user.click(screen.getByTestId("tag-filter"));
    await user.click(
      screen
        .getByTestId("tag-filter-popover")
        .querySelector('[data-tag="collectible"]') as HTMLElement,
    );
    await user.click(screen.getByTestId("tag-filter-clear"));
    expect(screen.getByTestId("count")).toHaveTextContent(
      String(seededPortfolio.holdings.length),
    );
  });

  it("persists the selection across remounts", async () => {
    const user = userEvent.setup();
    const { unmount } = renderFilter();
    await user.click(screen.getByTestId("tag-filter"));
    await user.click(
      screen
        .getByTestId("tag-filter-popover")
        .querySelector('[data-tag="core"]') as HTMLElement,
    );
    unmount();

    renderFilter();
    const coreCount = seededPortfolio.holdings.filter((h) =>
      h.tags.includes("core"),
    ).length;
    expect(screen.getByTestId("count")).toHaveTextContent(String(coreCount));
    expect(screen.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-filtering",
      "true",
    );
  });
});
