# Family Office OS — Handoff

Everything you need to pick this up from **another machine**. The repo is the
source of truth; this file consolidates the knowledge that otherwise lived only
in the build agent's memory.

**Live demo:** https://toukkelipoukkeli-glitch.github.io/family-office-os/

---

## What this is

A **read-only** family-office operations cockpit — portfolio, risk, scenario
modelling, tax, private markets, company/ownership, deal-flow, planning and
reporting — across a deliberately diverse portfolio (equities, bonds, crypto,
forest, wine, art, LEGO, classic cars, vineyards, PE, watches). It was built
almost entirely by an **autonomous multi-agent loop** (see "The build harness"
below). All data is **synthetic fixtures**; it never moves money.

**Status:** v1 complete and deployed. ~90 merged PRs, **3,388 tests**, 76
`src/lib` engine modules, ~40 routed pages, all green, deployed to GitHub Pages.

---

## Quick start (fresh clone, any machine)

```sh
# 1. Bun (the runtime/package manager)
curl -fsSL https://bun.sh/install | bash      # then restart shell / source ~/.zshrc

# 2. Clone + install
git clone https://github.com/toukkelipoukkeli-glitch/family-office-os
cd family-office-os
bun install

# 3. Run it
bun run dev          # http://localhost:5173
bun run test         # vitest unit tests (offline, fixtures)
bun run test:e2e     # Playwright (chromium/firefox/webkit)
bun run typecheck    # tsc --noEmit
bun run lint         # eslint
bun run build        # tsc -b && vite build

# 4. (Only to drive the autonomous loop) GitHub CLI auth
gh auth login        # needs `repo` + `workflow` scopes
```

**Secrets:** copy `.env.example` → `.env`. Live-data keys (FRED, Alpha Vantage)
are optional — the app + tests run fully offline on fixtures. `GEMINI_API_KEY`
powers an optional AI-insights panel (graceful fallback without it).

---

## Stack

Bun · Vite · React 18 · TypeScript · Tailwind v4 · shadcn/ui · Convex (cloud,
dev deployment) · Vitest · Playwright. CI: GitHub Actions. Deploy: GitHub Pages.

## Architecture

- **`src/lib/<domain>/`** — 76 pure, **exact-Decimal**, fixture-tested engines
  (returns TWR/MWR/XIRR, risk, allocation, scenario Monte-Carlo, tax lots/
  harvest/estimate/timeline, PE lifecycle, benchmark, IPS, attribution, fees,
  liquidity, goals, cashflow, estate, lookthrough, consolidation, managers,
  data-quality, format boundary, export, …). Money is `decimal.js`; numbers
  appear **only at the render boundary**.
- **`src/<feature>/` + the route registry + shared `AppShell`** — the pages.
  Routing is hash-based (`#/...`) and generated from a typed route registry; the
  AppShell provides shared header/nav/back-link chrome.
- **`src/components/charts/`** — SVG charting kit (line/area/bar/donut/treemap/
  candlestick/sparkline) with accessible data-table toggles.
- **`src/fixtures/`** — the seeded diverse portfolio.
- **`convex/`** — backend schema + queries (dev deployment; the demo is mostly
  fixture-driven).
- **`e2e/`** — Playwright specs + committed evidence screenshots.
- **`.github/workflows/`** — `ci.yml` (typecheck/lint/test/build/e2e) and
  `deploy-pages.yml` (build with `VITE_BASE=/family-office-os/` → Pages).

---

## The build harness — how the autonomous loop works

The app was built by **`Workflow`-driven generations**. Each generation is one
script in **`harness/workflows/`** (`00-scaffold`, `gen1-spine` … `gen7-rollout`,
`hardening-v1`) defining a list of feature **units** with dependencies. For each
unit:

1. A **builder** agent (its own git worktree) writes the code + tests, runs the
   full local gate, opens a PR.
2. An independent **reviewer/merger** agent re-verifies, adds adversarial tests,
   drives the CodeRabbit + Greptile loop, runs a **visual-QA gate** (Playwright
   captures desktop 1280×800 + mobile 390×844 screenshots + a trace, then the
   agent *reads the screenshots back with vision* and judges them), and merges —
   **never merging red**.
3. After all units: a **QA audit**, a serialized **Computer-Use/Chrome live
   sweep**, and a **PM ideation** phase that proposes the next generation.

Independent feature *pages* fan out in parallel (dependency waves); cross-cutting
work that touches the shared shell builds **sequentially** to avoid conflicts.

- **`AGENTS.md`** — the working agreement (the oracle rule, the merge gate, the
  UI testing standard). Read it before extending.
- **`harness/RUNBOOK.md`** — operational runbook.
- **`harness/state/`** — `backlog.json`, `tasks.json` (the generation log),
  `config.json`.
- **`harness/workflows/`** — the 9 generation scripts, re-runnable.
- **Kill switch:** `touch harness/HALT`.

### Launching a new generation (from another machine)

You need a Claude Code session with the **Workflow tool + multi-agent
("ultracode") enabled**, `gh` authed (`repo`+`workflow`), Bun, and the repo
cloned. Copy a script from `harness/workflows/`, edit its `UNITS` list, and
launch it via the Workflow tool — it builds, tests, PRs, reviews, and merges each
unit autonomously. Use sequential build for shell-touching units, parallel for
independent pages.

---

## Hard-won lessons (read before extending)

1. **Never couple an e2e test to volatile `harness/state/tasks.json`** — the
   `/ops` cockpit renders live state; assert *invariants* (columns exist, merged
   count ≥ N), never a specific phase string / active-unit row. This caused a
   multi-PR cascade twice.
2. **Between generations:** `rm -rf .claude/worktrees/*; git worktree prune` and
   delete stale local branches — worktrees/branches pile up.
3. **Route-adding units conflict in `src/App.tsx`** — resolve by keeping ALL
   lazy imports + routes from both sides.
4. **GitHub Actions can briefly stall** (no new runs) — a push probes it; it
   recovers on its own.
5. **Anthropic API `529 Overloaded`** is transient server-side capacity — failed
   units just need a re-run (idempotency guards skip already-merged ones).
6. **The PM auto-ideation occasionally returns a degenerate stub** — be ready to
   design the next generation yourself.
7. **A local `.env` with real keys can change AI-related test behavior** — CI
   (no `.env`) is the source of truth.
8. **Cross-browser e2e needs care:** the 3-engine matrix (chromium/firefox/
   webkit) needs `timeout: 90s`, `workers: CI?2`, and `retries: CI?2` or webkit
   times out under load. **CI now runs ~26 min** because of it — consider making
   firefox/webkit a nightly/non-required job if that's a bottleneck.
9. **Convex** is authed on the original build machine only — re-auth
   (`bunx convex dev`) elsewhere.

---

## Next steps — demo → production (needs *your* accounts/decisions)

- [ ] **Real data** — wire actual bank/brokerage/custodian feeds (the adapters
      exist and are fixture-tested; connect them live).
- [ ] **Auth** — it's single-user with no auth; add an auth provider before real
      data.
- [ ] **Convex prod** — provision a production deployment with real data
      (currently fixtures + a dev deployment).
- [ ] **Custom domain** (optional) for the Pages site.
- [ ] **Optional capabilities** — wire the unused **ElevenLabs** (voice
      briefings) and **Tavily** (company research) keys if wanted.
- [ ] **Polish** — 5 standalone pages still have pre-existing mobile horizontal
      overflow (`/charts`, `/risk`, `/concentration`, `/data-quality`, `/ops`);
      flagged by `m14-mobile-nav`, scoped out of it.

## Review bots

CodeRabbit + Greptile are installed but their free trials are largely spent; the
loop falls back to CI + an independent adversarial-reviewer agent + the visual-QA
gate. Top up if you want full third-party review back.
