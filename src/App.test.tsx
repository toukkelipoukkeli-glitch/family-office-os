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

describe("App", () => {
  it("renders the dashboard heading at the root route", () => {
    setHash("");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /family office os/i }),
    ).toBeInTheDocument();
  });

  it("renders the ops cockpit at #/ops", () => {
    setHash("#/ops");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /ops cockpit/i }),
    ).toBeInTheDocument();
  });

  it("renders the charts gallery at #/charts", () => {
    setHash("#/charts");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /charting kit/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("charts-gallery")).toBeInTheDocument();
  });

  it("renders the ownership graph at #/ownership", () => {
    setHash("#/ownership");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /ownership graph/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ownership-network")).toBeInTheDocument();
  });

  it("navigates between dashboard and ops on hash change", () => {
    setHash("");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /family office os/i }),
    ).toBeInTheDocument();

    setHash("#/ops");
    expect(
      screen.getByRole("heading", { name: /ops cockpit/i }),
    ).toBeInTheDocument();
  });

  it("falls back to the dashboard for an unknown route", () => {
    setHash("#/does-not-exist");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /family office os/i }),
    ).toBeInTheDocument();
  });

  it("does not match #/ops with a trailing query suffix", () => {
    // currentHashPath keeps the suffix, so the exact "/ops" check fails and we
    // fall back to the dashboard rather than mis-rendering the cockpit.
    setHash("#/ops?tab=blocked");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /family office os/i }),
    ).toBeInTheDocument();
  });
});
