/**
 * Suspense fallback shown while a lazily-loaded route chunk is being fetched.
 *
 * Route-level code-splitting (`React.lazy`) means a page's JS arrives on demand;
 * during that fetch React renders this fallback. It is deliberately minimal and
 * stable so it never causes layout shift or flicker on fast loads.
 */
export function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="route-fallback"
      className="min-h-screen bg-background text-foreground"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-16">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
        />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    </div>
  );
}
