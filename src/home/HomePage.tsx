import { AppShell } from "@/components/AppShell";

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
    <AppShell
      title="Executive overview"
      width="5xl"
      backTestId="home-back"
      backLabel="Full dashboard"
    >
        <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
          The family office at a glance: the headline number from every module —
          net worth and time-weighted return, portfolio risk, mandate
          compliance, liquidity runway and open alerts — in one cockpit. Each
          tile drills into its module. Rendered from deterministic fixtures; this
          product is read-only and never moves money.
        </p>
        <HomeOverview />
    </AppShell>
  );
}

export default HomePage;
