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

function renderFilter(props?: { applies?: boolean }) {
  return render(
    <TagFilterProvider portfolio={seededPortfolio}>
      <TagFilter applies={props?.applies} />
      <FilteredCount />
    </TagFilterProvider>,
  );
}

describe("TagFilter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Default the route to the dashboard so the filter applies unless a test
    // navigates elsewhere; useHashRoute reads window.location.hash.
    window.location.hash = "";
  });
  afterEach(() => {
    window.localStorage.clear();
    window.location.hash = "";
  });

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

  // --- m13: scope consistency (inert where the filter does not apply) -----

  it("renders an active control on a route where the filter applies", () => {
    window.location.hash = "#/"; // dashboard => applies
    renderFilter();
    const root = screen.getByTestId("tag-filter-root");
    expect(root).toHaveAttribute("data-applies", "true");
    expect(screen.getByTestId("tag-filter")).toBeEnabled();
  });

  it("renders a disabled, inert control where the filter does not apply", () => {
    window.location.hash = "#/ips"; // n/a route
    renderFilter();
    const root = screen.getByTestId("tag-filter-root");
    expect(root).toHaveAttribute("data-applies", "false");
    const trigger = screen.getByTestId("tag-filter");
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("data-applies", "false");
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(trigger).toHaveAttribute("title");
  });

  it("the inert control never opens a popover when clicked", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/vault"; // n/a route
    renderFilter();
    // A disabled button does not fire click, but assert no popover regardless.
    await user.click(screen.getByTestId("tag-filter"));
    expect(screen.queryByTestId("tag-filter-popover")).not.toBeInTheDocument();
  });

  it("the explicit applies prop overrides the route scope", () => {
    // The dashboard forces applies even though it is rendered at `/` (and would
    // anyway), but the override must also win on an otherwise-n/a route.
    window.location.hash = "#/ips";
    renderFilter({ applies: true });
    expect(screen.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-applies",
      "true",
    );
    expect(screen.getByTestId("tag-filter")).toBeEnabled();
  });

  it("preserves the persisted selection while inert and reactivates it", async () => {
    const user = userEvent.setup();
    // On an applies route, select a tag.
    window.location.hash = "#/";
    const { unmount } = renderFilter();
    await user.click(screen.getByTestId("tag-filter"));
    await user.click(
      screen
        .getByTestId("tag-filter-popover")
        .querySelector('[data-tag="core"]') as HTMLElement,
    );
    const coreCount = seededPortfolio.holdings.filter((h) =>
      h.tags.includes("core"),
    ).length;
    expect(screen.getByTestId("count")).toHaveTextContent(String(coreCount));
    unmount();

    // Navigate to an n/a route: the control is inert but the *selection* (and
    // thus the filtered portfolio for pages that do apply it) is untouched.
    window.location.hash = "#/ips";
    renderFilter();
    expect(screen.getByTestId("tag-filter")).toBeDisabled();
    expect(screen.getByTestId("count")).toHaveTextContent(String(coreCount));
  });
});
