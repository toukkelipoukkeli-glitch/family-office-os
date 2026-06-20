import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CommandPalette } from "./CommandPalette";
import { openCommandPalette } from "./command-palette-events";

/** Open the palette with the global Cmd-K shortcut. */
async function pressCmdK(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard("{Meta>}k{/Meta}");
}

/**
 * Open the palette and wait until its input is focused, so subsequent keyboard
 * events land inside the dialog (focus is applied on the next animation frame).
 */
async function openAndFocus(user: ReturnType<typeof userEvent.setup>) {
  await pressCmdK(user);
  const input = await screen.findByTestId("command-palette-input");
  await waitFor(() => expect(input).toHaveFocus());
  return input;
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  window.location.hash = "";
});

describe("CommandPalette", () => {
  it("is closed initially (no dialog in the DOM)", () => {
    render(<CommandPalette />);
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("opens on Cmd-K and focuses the input", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await pressCmdK(user);
    const dialog = await screen.findByTestId("command-palette");
    expect(dialog).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("command-palette-input")).toHaveFocus(),
    );
  });

  it("opens on Ctrl-K as well", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
  });

  it("opens via the openCommandPalette() event helper", async () => {
    render(<CommandPalette />);
    act(() => openCommandPalette());
    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
  });

  it("exposes ARIA combobox + listbox roles", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await pressCmdK(user);
    await screen.findByTestId("command-palette");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-controls",
      "command-palette-listbox",
    );
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("filters commands as the user types", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await pressCmdK(user);
    const input = await screen.findByTestId("command-palette-input");
    await user.type(input, "cashflow");
    await waitFor(() => {
      expect(
        screen.getByTestId("command-option-route:/cashflow"),
      ).toBeInTheDocument();
    });
    // Unrelated routes are filtered out.
    expect(
      screen.queryByTestId("command-option-route:/estate"),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await pressCmdK(user);
    const input = await screen.findByTestId("command-palette-input");
    await user.type(input, "zzzxqq");
    expect(
      await screen.findByTestId("command-palette-empty"),
    ).toBeInTheDocument();
  });

  it("navigates with arrow keys (aria-selected moves)", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await openAndFocus(user);
    const options = screen.getAllByRole("option");
    // First option is selected on open.
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("wraps selection from first to last with ArrowUp", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await openAndFocus(user);
    await user.keyboard("{ArrowUp}");
    const options = screen.getAllByRole("option");
    expect(options[options.length - 1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("navigates to the selected route on Enter and closes", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await pressCmdK(user);
    const input = await screen.findByTestId("command-palette-input");
    await user.type(input, "risk");
    await waitFor(() =>
      expect(
        screen.getByTestId("command-option-route:/risk"),
      ).toHaveAttribute("aria-selected", "true"),
    );
    await user.keyboard("{Enter}");
    expect(window.location.hash).toBe("#/risk");
    await waitFor(() =>
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument(),
    );
  });

  it("navigates by clicking an option", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await pressCmdK(user);
    await screen.findByTestId("command-palette");
    await user.click(screen.getByTestId("command-option-route:/fees"));
    expect(window.location.hash).toBe("#/fees");
  });

  it("runs the dashboard quick action", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/risk";
    render(<CommandPalette />);
    await pressCmdK(user);
    await screen.findByTestId("command-palette");
    await user.click(screen.getByTestId("command-option-action:dashboard"));
    expect(window.location.hash).toBe("#/");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await openAndFocus(user);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument(),
    );
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await pressCmdK(user);
    await screen.findByTestId("command-palette");
    await user.click(screen.getByTestId("command-palette-backdrop"));
    await waitFor(() =>
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument(),
    );
  });

  it("toggles closed when Cmd-K is pressed while open", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await pressCmdK(user);
    await screen.findByTestId("command-palette");
    await pressCmdK(user);
    await waitFor(() =>
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument(),
    );
  });

  it("traps Tab focus on the input (focus never leaves the dialog)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button data-testid="outside">outside</button>
        <CommandPalette />
      </>,
    );
    const input = await openAndFocus(user);
    await user.tab();
    // Focus stays on the input rather than escaping to the outside button.
    expect(input).toHaveFocus();
    expect(screen.getByTestId("outside")).not.toHaveFocus();
  });
});
