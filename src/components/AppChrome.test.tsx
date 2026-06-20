import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { MAIN_CONTENT_ID } from "@/lib/main-content";
import { RouteAnnouncer, SkipToContentLink } from "./AppChrome";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SkipToContentLink", () => {
  it("points at the main content anchor", () => {
    render(<SkipToContentLink />);
    const link = screen.getByTestId("skip-to-content");
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
    expect(link).toHaveTextContent("Skip to content");
  });

  it("is visually hidden by default and revealed on focus", () => {
    render(<SkipToContentLink />);
    const link = screen.getByTestId("skip-to-content");
    // sr-only until focused; the focus: utilities un-hide it.
    expect(link.className).toContain("sr-only");
    expect(link.className).toContain("focus:not-sr-only");
  });

  it("moves focus to the main region without changing the route", async () => {
    const user = userEvent.setup();
    const main = document.createElement("main");
    main.id = MAIN_CONTENT_ID;
    main.textContent = "page body";
    document.body.appendChild(main);

    const hashBefore = window.location.hash;
    render(<SkipToContentLink />);
    await user.click(screen.getByTestId("skip-to-content"));

    // Focus landed on the main region, which became focusable.
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(main);
    // The click did not mutate the hash route.
    expect(window.location.hash).toBe(hashBefore);
  });
});

describe("RouteAnnouncer", () => {
  it("renders a polite, atomic live region", () => {
    render(<RouteAnnouncer path="/" />);
    const region = screen.getByTestId("route-announcer");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveAttribute("role", "status");
    expect(region.className).toContain("sr-only");
  });

  it("stays silent on first render but announces subsequent navigations", () => {
    const { rerender } = render(<RouteAnnouncer path="/" />);
    // Initial load: browser already announces, so the region is empty.
    expect(screen.getByTestId("route-announcer")).toHaveTextContent("");

    act(() => {
      rerender(<RouteAnnouncer path="/charts" />);
    });
    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Charts page",
    );

    act(() => {
      rerender(<RouteAnnouncer path="/ops" />);
    });
    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Ops cockpit page",
    );
  });

  // --- Adversarial / edge cases (independent tester) ---

  it("re-rendering with the same path (StrictMode-style) does not re-announce", () => {
    const { rerender } = render(<RouteAnnouncer path="/charts" />);
    // Mounting directly on /charts: treated as the initial path → silent.
    expect(screen.getByTestId("route-announcer")).toHaveTextContent("");

    // A duplicate render with the unchanged path must stay silent (the ref guard
    // ignores equal paths — important for React StrictMode double effects).
    act(() => {
      rerender(<RouteAnnouncer path="/charts" />);
    });
    expect(screen.getByTestId("route-announcer")).toHaveTextContent("");
  });

  it("announces again when navigating away and back to a prior path", () => {
    const { rerender } = render(<RouteAnnouncer path="/" />);

    act(() => rerender(<RouteAnnouncer path="/charts" />));
    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Charts page",
    );

    act(() => rerender(<RouteAnnouncer path="/ops" />));
    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Ops cockpit page",
    );

    // Returning to /charts is a real navigation and must be announced anew.
    act(() => rerender(<RouteAnnouncer path="/charts" />));
    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Charts page",
    );
  });
});
