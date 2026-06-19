# Needs a human

Things the loop cannot do itself. Resolve and delete the line.

## Blocking startup (must be done before unattended run)

- [ ] **GitHub auth** — `gh auth login` as `toukkelipoukkeli-glitch` (or provide
      a PAT with `repo` + `workflow` scope). Blocks repo creation + PR loop.
- [ ] **Create remote repo** — `family-office-os` (I'll run `gh repo create`
      once auth is done; just confirm the name).
- [ ] **Install CodeRabbit** GitHub app on the repo.
- [ ] **Install Greptile** GitHub app on the repo.
- [ ] **Convex login** — `bunx convex dev` browser OAuth (one-time), then a
      deploy key is generated for unattended runs.
- [ ] **Permission mode** — set Claude Code to a non-interactive mode for the
      unattended hours (allowlist in `.claude/settings.json` is pre-written).

## Deferred (not blocking; loop builds on fixtures first)

- [ ] FRED API key (macro data).
- [ ] One stock-data provider key (Alpha Vantage / Finnhub / Twelve Data).
- [ ] Commit-email attribution: confirm the email to use for the alt GitHub
      account (currently a noreply placeholder).
