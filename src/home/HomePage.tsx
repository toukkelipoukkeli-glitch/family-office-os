import { HomeOverview } from "./HomeOverview";

export { HomeOverview } from "./HomeOverview";

/**
 * Executive home / overview (unit m10-home).
 *
 * The at-a-glance cockpit: headline KPIs composed from every module — net
 * worth, window TWR, volatility / drawdown, IPS compliance, liquidity runway
 * and open alerts — each linking into its module. Routed at `#/home` and
 * exercised by the Playwright visual check at desktop and mobile viewports.
 *
 * READ-ONLY product: this page only reports the family's headline state for a
 * human to act on; nothing here moves money or places trades.
 */
export function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Executive overview
          </h1>
          <a
            href="#/"
            data-testid="home-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Full dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
          The family office at a glance: the headline number from every module —
          net worth and time-weighted return, portfolio risk, mandate
          compliance, liquidity runway and open alerts — in one cockpit. Each
          tile drills into its module. Rendered from deterministic fixtures; this
          product is read-only and never moves money.
        </p>
        <HomeOverview />
      </main>
    </div>
  );
}

export default HomePage;
