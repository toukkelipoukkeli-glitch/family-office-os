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
});
