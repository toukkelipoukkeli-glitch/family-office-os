import { render, screen, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import App from "./App";

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

  it("does not match #/ops with a trailing query suffix", async () => {
    // currentHashPath keeps the suffix, so the exact "/ops" check fails and we
    // fall back to the dashboard rather than mis-rendering the cockpit.
    setHash("#/ops?tab=blocked");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /family office os/i }),
    ).toBeInTheDocument();
  });
});
