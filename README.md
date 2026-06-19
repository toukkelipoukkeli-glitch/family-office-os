# Family Office OS

A read-only operations cockpit for a diverse private portfolio: liquid assets
(global equities, bonds, ETFs, crypto, multi-currency cash) **and** illiquid /
physical assets (managed forest, fine wine, art, LEGO, classic cars, vineyard,
farmland, private equity, watches).

It values, visualizes, and stress-tests an entire net worth as one correlated
system, wired to real public data feeds (markets, FX, macro, weather, world data).

> **Safety stance:** read-only. It never moves money, never places a trade,
> never emails a real counterparty. It is analytics + visualization only.

## Stack

- **Runtime / package manager:** Bun
- **Frontend:** Vite + React + TypeScript
- **UI:** Tailwind + shadcn/ui
- **Backend / DB:** Convex (realtime)
- **Tests:** Vitest (unit), Playwright (e2e + screenshot diff)
- **CI:** GitHub Actions
- **Review:** CodeRabbit + Greptile on every PR

## The design principle that makes autonomy possible

Every unit of work must have a **machine oracle** — an objective pass/fail the
agents can check without a human:

- Portfolio math (returns, XIRR, allocation, risk) → deterministic unit tests.
- Data adapters → tested against recorded fixtures, never live endpoints.
- Visualizations → Playwright DOM assertions + screenshot diffing.

Deterministic code owns every number. See [AGENTS.md](AGENTS.md) for the full
working agreement and [harness/README.md](harness/README.md) for how the
autonomous build loop runs.

## The flagship feature

A **unified cross-asset scenario & risk engine**: model the whole net worth as
one correlated system and run Monte Carlo scenarios ("rates +200bps, EUR −10%,
a drought year hits the forest, wine corrects 15%") against total net worth and
liquidity — with transparent, documented correlation and growth assumptions.
