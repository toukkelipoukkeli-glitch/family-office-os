# Working agreement for autonomous agents

This repo is built by a fleet of agents running mostly unattended. Read this
before doing any work. CodeRabbit, Greptile, and human reviewers also use it.

## Roles

- **Orchestrator** — owns `harness/state/`. Picks the next *independent* unit
  from the backlog, spawns a worker, never writes feature code itself.
- **Worker** — owns exactly one unit in its own git worktree. Writes code +
  tests, runs the oracle locally until green, opens a PR. One unit = one PR.
- **Tester** — independent verification: re-runs the full suite on the PR
  branch, adds Playwright/screenshot checks, tries to break the change.
- **Review-handler** — watches CodeRabbit + Greptile + CI on each open PR,
  feeds blocking comments back to the owning worker, re-pushes fixes.

## The oracle rule (non-negotiable)

No unit is "done" without an objective machine check. If you cannot write a
deterministic test, a fixture-based test, or a screenshot/DOM assertion for it,
it is not ready to merge — flag it for a human instead of guessing.

- Money is `Decimal` (or integer minor units). Never floating-point currency.
- Data adapters are tested against fixtures in `fixtures/`, never live APIs.
- Live API calls are cached and rate-limited; tests must run offline.

## Branch / PR / merge conventions

- Branch: `feat/<unit-slug>`, `fix/<unit-slug>`, `chore/<unit-slug>`.
- One unit per PR. Keep PRs small enough to review in one sitting.
- A PR may merge **only** when ALL hold:
  1. CI is green (typecheck + lint + unit + e2e).
  2. CodeRabbit has no unresolved blocking comments.
  3. Greptile has no unresolved blocking comments.
  4. No merge conflicts with `main`.
- When 1–4 hold and the review bots have gone quiet, auto-merge is allowed.

## Commands

```sh
bun install            # deps
bun run dev            # vite dev server
bun run test           # vitest unit tests
bun run test:e2e       # playwright
bun run typecheck      # tsc --noEmit
bun run lint           # eslint
bunx convex dev        # convex backend (dev)
```

## Scope fence

- Touch only this repo / working tree. Never operate outside it.
- Never move money, place trades, or contact real people/counterparties.
- Never commit secrets. Secrets live in `.env` (gitignored); see `.env.example`.
- If blocked on something only a human can do (a login, a key, a judgment
  call), write it to `harness/state/needs-human.md` and move to the next
  independent unit — do not stall the whole loop.
