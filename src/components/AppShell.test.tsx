import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the title as a heading and the body", () => {
    render(
      <AppShell title="Fees">
        <p>body content</p>
      </AppShell>,
    );
    expect(
      screen.getByRole("heading", { name: "Fees" }),
    ).toBeInTheDocument();
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("renders a back link to the dashboard by default", () => {
    render(
      <AppShell title="Fees" backTestId="fees-back">
        body
      </AppShell>,
    );
    const back = screen.getByTestId("fees-back");
    expect(back).toHaveAttribute("href", "#/");
    expect(back).toHaveTextContent("Back to dashboard");
  });

  it("supports a custom back href + label", () => {
    render(
      <AppShell title="Home" backTestId="home-back" backLabel="Full dashboard">
        body
      </AppShell>,
    );
    expect(screen.getByTestId("home-back")).toHaveTextContent("Full dashboard");
  });

  it("can hide the back link", () => {
    render(
      <AppShell title="X" hideBack backTestId="x-back">
        body
      </AppShell>,
    );
    expect(screen.queryByTestId("x-back")).not.toBeInTheDocument();
  });

  it("renders actions before the back link", () => {
    render(
      <AppShell
        title="Reports"
        backTestId="reports-back"
        actions={<button data-testid="toggle">Export</button>}
      >
        body
      </AppShell>,
    );
    expect(screen.getByTestId("toggle")).toBeInTheDocument();
    expect(screen.getByTestId("reports-back")).toBeInTheDocument();
  });

  it("renders a subtitle beneath the title", () => {
    render(
      <AppShell title="Pipeline" subtitle={<p>3 stages</p>}>
        body
      </AppShell>,
    );
    expect(screen.getByText("3 stages")).toBeInTheDocument();
  });

  it("renders a title aside on the same line", () => {
    render(
      <AppShell title="Board report" titleAside={<span>as of 2025</span>}>
        body
      </AppShell>,
    );
    expect(screen.getByText("as of 2025")).toBeInTheDocument();
  });

  it("applies the container and main test ids", () => {
    render(
      <AppShell title="X" containerTestId="x-container" mainTestId="x-main">
        body
      </AppShell>,
    );
    expect(screen.getByTestId("x-container")).toBeInTheDocument();
    expect(screen.getByTestId("x-main")).toBeInTheDocument();
  });

  it("applies the requested max width to header and main", () => {
    render(
      <AppShell title="X" width="4xl" mainTestId="x-main">
        body
      </AppShell>,
    );
    expect(screen.getByTestId("x-main").className).toContain("max-w-4xl");
  });

  it("defaults to the 6xl width", () => {
    render(
      <AppShell title="X" mainTestId="x-main">
        body
      </AppShell>,
    );
    expect(screen.getByTestId("x-main").className).toContain("max-w-6xl");
  });
});
