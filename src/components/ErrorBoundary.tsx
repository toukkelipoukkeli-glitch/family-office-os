import { Component, type ErrorInfo, type ReactNode } from "react";

import { DefaultErrorFallback } from "./DefaultErrorFallback";

/**
 * App-level React error boundary.
 *
 * React unmounts the *entire* component tree if a render throws and nothing
 * catches it — a single page-level bug would blank the whole app. This boundary
 * wraps the route switch so one failing page degrades to an inline error card
 * while the rest of the shell (and recovery affordances) stay usable.
 *
 * It is intentionally dependency-free and deterministic: given a thrown child it
 * always renders the same fallback, which makes it unit-testable without mocking
 * any framework internals.
 */

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional custom fallback. Receives the caught error and a `reset` callback
   * that clears the error state so the children can attempt to re-render.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optional hook for logging/telemetry. Never throws into React. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in the console for local debugging; defer to the injected hook
    // for any structured telemetry. Guard so a faulty handler can't re-throw
    // and re-blank the app.
    console.error("Unhandled render error caught by ErrorBoundary:", error);
    try {
      this.props.onError?.(error, info);
    } catch {
      // ignore handler failures
    }
  }

  reset(): void {
    this.setState({ error: null });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return <DefaultErrorFallback error={error} reset={this.reset} />;
    }
    return this.props.children;
  }
}
