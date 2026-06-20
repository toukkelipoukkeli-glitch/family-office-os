import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

/** A component that throws on render when `boom` is true. */
function Bomb({ boom }: { boom: boolean }) {
  if (boom) {
    throw new Error("kaboom");
  }
  return <div data-testid="ok">all good</div>;
}

// React logs caught render errors to console.error; silence it so the test
// output stays clean while still exercising the real boundary path.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Bomb boom={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("ok")).toBeInTheDocument();
    expect(
      screen.queryByTestId("error-boundary-fallback"),
    ).not.toBeInTheDocument();
  });

  it("catches a thrown child and shows the fallback instead of blanking", () => {
    render(
      <ErrorBoundary>
        <Bomb boom={true} />
      </ErrorBoundary>,
    );
    const fallback = screen.getByTestId("error-boundary-fallback");
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("error-boundary-message")).toHaveTextContent(
      "kaboom",
    );
    // The thrown child is NOT in the document — it was replaced, not appended.
    expect(screen.queryByTestId("ok")).not.toBeInTheDocument();
  });

  it("invokes the onError hook with the caught error", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Bomb boom={true} />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toBe("kaboom");
  });

  it("recovers when the user retries and the child no longer throws", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [boom, setBoom] = useState(true);
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <div data-testid="custom-fallback">
              <span>{error.message}</span>
              <button
                type="button"
                onClick={() => {
                  setBoom(false);
                  reset();
                }}
              >
                retry
              </button>
            </div>
          )}
        >
          <Bomb boom={boom} />
        </ErrorBoundary>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(screen.getByTestId("ok")).toBeInTheDocument();
    expect(screen.queryByTestId("custom-fallback")).not.toBeInTheDocument();
  });
});
