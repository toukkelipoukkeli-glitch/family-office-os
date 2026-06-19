# RUNBOOK — autonomous build (read this first if your context just reset)

You are mid-flight on an **autonomous, mostly-unattended build** of
**family-office-os**. Touko launched it 2026-06-19 and is away ~72h. Your job:
build the best possible read-only family-office OS, and **never stop** until the
backlog is built, then switch to ideation mode. Don't wait for the user.

## The contract
- Full autonomy granted (bypass permissions). No approvals needed for the
  routine cycle. Use all the tokens.
- **Hard limits:** read-only product (never move money / place trades). Ask
  before *sending* any real email (reading/drafting is fine).
- **Kill switch:** if `harness/HALT` exists, stop cleanly. Check it every cycle.

## The loop (one unit at a time, fan out in parallel where independent)
1. Read `harness/state/tasks.json` + `backlog.json`. Pick the next unit whose
   deps are all merged.
2. Build it in a git worktree. Follow `AGENTS.md` (oracle rule: every unit needs
   a machine-checkable test).
3. Verify locally: `bun run typecheck && bun run test && bun run build`
   (+ Playwright/screenshot for UI; drive the app via the preview/Chrome to
   eyeball it).
4. Open a PR (one unit per PR). Push.
5. Wait for CodeRabbit + Greptile (minutes). Read their comments
   (`gh api repos/.../issues/<n>/comments`, `.../pulls/<n>/reviews`).
6. Fix blocking comments, re-push, re-check. Repeat until both quiet.
7. Merge when CI green + both bots quiet + no conflicts. Update `tasks.json`.
8. Next unit. Use the Workflow tool to run several independent units in parallel.

## Where things are
- Repo: `/Users/touko/Ambition`, remote `origin` →
  toukkelipoukkeli-glitch/family-office-os (PUBLIC). `gh` is authed.
- Secrets: `.env` (gitignored) — FRED, Alpha Vantage, Gemini, ElevenLabs, Tavily.
- Bun at `~/.bun/bin` (export `PATH="$HOME/.bun/bin:$PATH"`).
- Convex: logged in (team `touko-ursin`); provision the project at unit `m1-convex`.
- Data feeds (all tested): Alpha Vantage (equities), FRED (macro), frankfurter.dev
  (FX), Open-Meteo (weather), World Bank (world), CoinGecko (crypto).

## After m0–m6 are built
Switch to **ideation mode**: generate new feature ideas → write them into
`backlog.json` as units (each with an oracle) → build them via the same loop.
Cap with budget + HALT; log what you ideate to the app's `/ops` page.

## Honest caveats
- Continuation depends on this session staying alive (Mac awake + online).
  If it pauses, resume from this repo state — nothing is lost.
- The build progresses in turns + scheduled wake-ups, not one unbroken process.
