import { DataQualityView } from "./DataQualityView";

/**
 * Full-page wrapper around {@link DataQualityView} with app chrome and back
 * navigation. Routed at `#/data-quality` and exercised by the Playwright visual
 * check at desktop and mobile viewports.
 */
export function DataQualityPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Data-quality monitor
          </h1>
          <a
            href="#/"
            data-testid="dataquality-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="mb-8 text-sm text-muted-foreground">
          A trust layer over every number this app reports. For each holding it
          scores valuation staleness against a per-asset-class freshness budget,
          weighs the valuation&apos;s confidence, and surfaces missing-data gaps
          — then rolls it all into a single headline grade. Rendered from
          deterministic fixtures judged against a fixed reference date.
        </p>
        <DataQualityView />
      </main>
    </div>
  );
}

export default DataQualityPage;
