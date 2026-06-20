import { render, screen, act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import App from "./App";
import { ROUTES } from "./lib/routes";

function setHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

afterEach(() => {
  setHash("");
});

// Routes are code-split with React.lazy, so each page resolves asynchronously
// after a Suspense fallback. Tests therefore use `findBy*` (which awaits) rather
// than the synchronous `getBy*` used before code-splitting.
describe("App", () => {
  it("renders the dashboard heading at the root route", async () => {
    setHash("");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /family office os/i }),
    ).toBeInTheDocument();
  });

  it("shows the route fallback while a chunk loads", async () => {
    setHash("#/ops");
    render(<App />);
    // The Suspense fallback is present synchronously before the chunk resolves.
    expect(screen.getByTestId("route-fallback")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /ops cockpit/i }),
    ).toBeInTheDocument();
  });

  it("renders the ops cockpit at #/ops", async () => {
    setHash("#/ops");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /ops cockpit/i }),
    ).toBeInTheDocument();
  });

  it("renders the charts gallery at #/charts", async () => {
    setHash("#/charts");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /charting kit/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("charts-gallery")).toBeInTheDocument();
  });

  it("renders the ownership graph at #/ownership", async () => {
    setHash("#/ownership");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /ownership graph/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ownership-network")).toBeInTheDocument();
  });

  it("renders the look-through view at #/lookthrough", async () => {
    setHash("#/lookthrough");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /cross-entity look-through/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("lookthrough-view")).toBeInTheDocument();
  });

  it("renders the limit alerts at #/alerts", async () => {
    setHash("#/alerts");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /limit alerts/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("alerts-page")).toBeInTheDocument();
  });

  it("renders the relationship graph at #/relationships", async () => {
    setHash("#/relationships");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /relationship graph/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("relationship-graph")).toBeInTheDocument();
  });

  it("renders the tax-loss harvesting finder at #/harvest", async () => {
    setHash("#/harvest");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /tax-loss harvesting/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("harvest-page")).toBeInTheDocument();
  });

  it("navigates between dashboard and ops on hash change", async () => {
    setHash("");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /family office os/i }),
    ).toBeInTheDocument();

    setHash("#/ops");
    expect(
      await screen.findByRole("heading", { name: /ops cockpit/i }),
    ).toBeInTheDocument();
  });

  it("falls back to the dashboard for an unknown route", async () => {
    setHash("#/does-not-exist");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /family office os/i }),
    ).toBeInTheDocument();
  });

  it("resolves a route even with a deep-link query suffix on the hash", async () => {
    // Deep-linkable sub-view state lives as a query param on the route's hash
    // (e.g. `#/scenarios?s=rates-up`). The router matches on the *pathname*
    // (before any `?`), so a trailing query no longer drops us to the dashboard:
    // `#/ops?tab=blocked` still mounts the ops cockpit, carrying the sub-view
    // param for the page to read.
    setHash("#/ops?tab=blocked");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /ops cockpit/i }),
    ).toBeInTheDocument();
  });

  // Registry resolution: every route in the typed registry must mount its page
  // without falling back to the dashboard or throwing into the error boundary.
  // The default error fallback renders role="alert", so its absence proves the
  // lazy page resolved and rendered cleanly.
  describe("every registered route resolves", () => {
    for (const route of ROUTES) {
      it(`mounts ${route.path}`, async () => {
        setHash(`#${route.path}`);
        const { unmount } = render(<App />);
        // Wait for the Suspense fallback to clear (the chunk to resolve).
        await waitFor(() => {
          expect(screen.queryByTestId("route-fallback")).not.toBeInTheDocument();
        });
        // The page rendered without tripping the error boundary.
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        // Ensure we did NOT silently fall back to the dashboard shell — only
        // the dashboard renders the "Family Office OS" heading, so its absence
        // proves the registry resolved this route to its own page. (A routing
        // regression that always rendered <Dashboard /> would otherwise pass.)
        expect(
          screen.queryByRole("heading", { name: "Family Office OS" }),
        ).not.toBeInTheDocument();
        // A page heading is present (the shared chrome always renders an <h1>).
        expect(
          screen.getAllByRole("heading").length,
        ).toBeGreaterThan(0);
        unmount();
      });
    }
  });
});
