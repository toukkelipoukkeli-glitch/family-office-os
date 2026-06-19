# Readiness tracker

Pre-flight before any production code.

## ✅ Ready & tested

- **Bun** 1.3.14 installed.
- **Keep-awake** (`caffeinate`) running.
- **GitHub auth** — `gh` logged in as `toukkelipoukkeli-glitch` (scopes: repo, workflow).
- **Repo** created + pushed: `toukkelipoukkeli-glitch/family-office-os`.
- **Claude in Chrome** — connected ("Browser 1", macOS) and verified.
- **Data feeds — ALL live-tested:**
  - Equities — Alpha Vantage (key in `.env`) ✓
  - Macro — FRED (key in `.env`) ✓
  - FX — frankfurter.dev ✓
  - Weather — Open-Meteo ✓
  - World data — World Bank ✓
  - Crypto — CoinGecko ✓
- **Secrets** — `.env` created and confirmed gitignored; `.env.example` committed.

## 🔵 Decision needed (blocks Chrome review + review bots)

- [ ] **Repo visibility** — public (recommended: synthetic data; unlocks Chrome
      access + CodeRabbit/Greptile free tiers) vs private (then log Chrome into
      GitHub as the alt account + confirm bot trials cover private).

## ⏳ Needs a human

- [ ] **Install CodeRabbit** on the repo → then I run the smoke-test PR.
- [ ] **Install Greptile** on the repo → same.
- [ ] **Connect Gmail** — Claude app connector settings (read-only).
- [ ] **Connect Google Calendar** — same (VC/startup deal-flow + meetings).
- [ ] **Convex login** — done at app-scaffold time; I run `bunx convex dev`,
      you approve the browser OAuth, I generate a deploy key for unattended.

## 🔧 Mine — remaining

- [ ] After bots installed: throwaway smoke-test PR to confirm both comment.

## Deferred (not blocking; modeled/scraped later)

- [ ] Alt-asset indices: LEGO (BrickEconomy), wine (Liv-ex), timber.
