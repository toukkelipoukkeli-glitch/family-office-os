/**
 * The default inline fallback card rendered by {@link ErrorBoundary} when a page
 * render throws. It keeps the app shell usable on a crash: the rest of the app
 * is unaffected, and the user gets a retry plus a route home.
 */
export function DefaultErrorFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="error-boundary-fallback"
      className="min-h-screen bg-background text-foreground"
    >
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-xl font-semibold tracking-tight">
          Something went wrong on this page
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The rest of the app is still running. You can retry this page or head
          back to the dashboard.
        </p>
        <pre
          data-testid="error-boundary-message"
          className="mt-4 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          {error.message || String(error)}
        </pre>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            data-testid="error-boundary-retry"
            className="rounded-md border border-border bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="#/"
            data-testid="error-boundary-home"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
