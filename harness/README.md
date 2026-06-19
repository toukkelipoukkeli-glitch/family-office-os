# Autonomous build harness

How this repo builds itself, mostly unattended, for days.

## Durable loop, not one session

State lives on disk + in the repo, so the loop survives context resets,
crashes, and reboots. Each heartbeat iteration:

1. **Read state** — `state/tasks.json` (live queue) + `state/backlog.json`
   (roadmap). Check `HALT` (kill switch) first; if present, stop cleanly.
2. **Reconcile** — for every open PR, check CI + CodeRabbit + Greptile. Merge
   the ones that satisfy the merge gate (see `../AGENTS.md`). Feed blocking
   comments back to the owning worker.
3. **Dispatch** — if under the concurrency cap, pull the next *independent*
   unit from the backlog and spawn a worker in its own git worktree.
4. **Record** — write progress, PR links, and any blockers back to state.
   Append a one-line summary to `logs/heartbeat.log`.
5. **Exit** — the scheduler re-invokes the next heartbeat.

## Kill switch

Create a file named `HALT` in this directory:

```sh
touch harness/HALT
```

The loop checks for it at the top of every iteration and before every merge,
and stops at the next safe point (it won't abandon a half-finished merge).
Delete the file to resume.

## Budget & pacing

- Per-iteration token ceiling and a daily cap, so work spreads across the run
  instead of burning out early. Configured in `state/config.json`.
- Concurrency cap on simultaneous workers (default 3) to keep PRs reviewable
  and avoid worktree thrash.

## Monitoring

- `logs/heartbeat.log` — one line per iteration.
- `state/tasks.json` — current queue, in-flight workers, merged units.
- `state/needs-human.md` — anything the loop is blocked on that only a human
  can resolve (a login, a key, a judgment call).
- The app's own `/ops` page (built later) renders this state as the cockpit.
