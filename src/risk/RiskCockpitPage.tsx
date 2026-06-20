import { RiskCockpitView } from "./RiskCockpitView";

export { RiskCockpitView } from "./RiskCockpitView";

/**
 * Full-page wrapper around {@link RiskCockpitView} with app chrome and back
 * navigation. Routed at `#/risk` and exercised by the Playwright visual check
 * at desktop and mobile viewports.
 */
export function RiskCockpitPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Risk-limits cockpit
          </h1>
          <a
            href="#/"
            data-testid="risk-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="mb-8 text-sm text-muted-foreground">
          The family's true cross-asset risk picture: look-through concentration
          (seen through every holdco, fund and SPV) measured against governed
          risk limits, split into liquidity tiers, alongside portfolio risk
          metrics. A breach is a governance signal for a human — this product is
          read-only and never moves money. Rendered from deterministic fixtures.
        </p>
        <RiskCockpitView />
      </main>
    </div>
  );
}

export default RiskCockpitPage;
