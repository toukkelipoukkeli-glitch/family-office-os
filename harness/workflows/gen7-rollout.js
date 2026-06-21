export const meta = {
  name: 'family-office-os-build-gen7',
  description: 'Gen-7 consistency/rollout (SEQUENTIAL): shared format-boundary, currency rollout, export rollout, tag-filter consistency, URL sub-view state, palette deep-links, holdings index. Builder+reviewer per unit, visual QA, QA + sweep + gen-8 ideation',
  phases: [ { title: 'm13 rollout' }, { title: 'QA' }, { title: 'Live QA sweep' }, { title: 'Ideation' } ]
}

const REPO = '/Users/touko/Ambition'
const OWNER = 'toukkelipoukkeli-glitch/family-office-os'

const CONV = [
  'Repo: ' + REPO + ' (family-office-os). Read AGENTS.md (incl. the UI testing standard) and harness/RUNBOOK.md first.',
  'Bun: start EVERY bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  'Product is READ-ONLY: never write code that moves money or places trades; never SEND email.',
  'Tests MUST be deterministic and offline. Money is exact Decimal; number only at the render boundary.',
  'CROSS-CUTTING rollout generation: units touch many existing pages + the shared AppShell. Oracle for rollouts is NO REGRESSIONS — every existing unit + e2e test still passes — PLUS new tests proving the feature now works on the newly-covered pages.',
  'Reuse the gen-6 polish layer: the route registry/AppShell, src/lib/export, the reporting-currency switcher, the tag filter, the command palette. Do not duplicate them.',
  'If a file harness/HALT exists at the repo root, STOP immediately. Do not modify .env, .claude/, or harness/state.',
  'Gens 1-6 (74 units, 39 routes, polished shell) are merged on main.'
].join(' ')

// Built STRICTLY in order, one at a time (sequential), each off latest main.
const UNITS = [
  { id:'m13-format-boundary', ui:true, title:'Shared money/percent render-boundary formatter',
    brief:'Create one shared formatting module (e.g. src/lib/format) consolidating the repeated Decimal->number + Intl money/percent/compact formatting duplicated across ~40 pages. Provide formatMoney/formatPercent/formatCompact/etc. Migrate pages to use it with NO behavior change. ORACLE: exact-output unit tests on fixtures + all existing tests still pass (no regressions).' },
  { id:'m13-currency-rollout', ui:true, title:'Reporting-currency rollout to all pages',
    brief:'Wire the existing global reporting-currency (m12-reporting-currency) through ALL value-bearing pages so every monetary figure re-expresses in the chosen currency via existing FX normalization. Audit each page; convert at the display boundary (reuse m13-format-boundary). ORACLE: e2e switches currency and asserts values update on several pages + unit tests on conversion.' },
  { id:'m13-export-rollout', ui:true, title:'Export rollout to every data-heavy page',
    brief:'Add the existing export toolkit (src/lib/export, CSV/JSON) to EVERY data-heavy page that lacks it (audit all pages with tables/series). ORACLE: e2e asserts an Export control + a triggered download on each newly-covered page; unit tests for each export data shape.' },
  { id:'m13-filter-scope-consistency', ui:true, title:'Tag-filter consistency across pages',
    brief:'Make the global tag filter (m12-tag-filter) apply on every shell page where it is meaningful, or visibly indicate/disable it where it does not apply, so behavior is consistent everywhere. ORACLE: e2e verifies the filter narrows where applicable and is clearly inert/disabled where not.' },
  { id:'m13-url-subview-state', ui:true, title:'Deep-linkable URL sub-view state',
    brief:'Make in-page tabs/sub-views deep-linkable via URL (hash query params) so a selected scenario/manager/entity/episode is shareable and survives reload. Apply to the main multi-view pages. ORACLE: e2e navigates to a deep link, asserts the sub-view is selected, and reload preserves it.' },
  { id:'m13-palette-deeplink-actions', ui:true, title:'Command palette deep-links + actions',
    brief:'Extend the command palette (Cmd-K) to deep-link sub-views, switch reporting currency, and surface recent pages — not just top-level routes. ORACLE: e2e opens the palette, runs a deep-link/currency action, asserts the effect.' },
  { id:'m13-holdings-index', ui:true, title:'Global holdings index (/holdings)',
    brief:'A global holdings index page at /holdings with search, multi-column sort, and column filters over the full portfolio, integrated with export + reporting-currency + the tag filter. ORACLE: unit tests on sort/filter/search logic + Playwright e2e+screenshot.' }
]

const phaseFor = () => 'm13 rollout'
const BUILD_SCHEMA = { type:'object', additionalProperties:false, properties:{ ok:{type:'boolean'}, pr:{type:'string'}, branch:{type:'string'}, notes:{type:'string'} }, required:['ok','branch'] }
const MERGE_SCHEMA = { type:'object', additionalProperties:false, properties:{ merged:{type:'boolean'}, pr:{type:'string'}, blocked:{type:'boolean'}, note:{type:'string'} }, required:['merged'] }

const idemBuild = (u) => 'IDEMPOTENT RESUME GUARD: gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If MERGED, return {ok:true, pr:<url>, branch:"feat/' + u.id + '", notes:"already merged"} immediately. If an OPEN PR exists, reuse it.'
const idemReview = (u) => 'IDEMPOTENT RESUME GUARD: gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If MERGED, return {merged:true, pr:<url>, blocked:false, note:"already merged"} immediately.'
const visualBuild = (u) => 'VISUAL QA (REQUIRED): Playwright e2e MUST exercise the change and capture desktop (1280x800) + mobile (390x844) screenshots + a trace under e2e/evidence/' + u.id + '/ (COMMIT them). Read each screenshot with vision and judge like a human (rendered? laid out? not blank/clipped/overflowing? readable on mobile?). Fix until correct. Link paths + vision verdict in the PR body.'
const visualReview = (u) => 'VISUAL QA GATE: confirm desktop+mobile screenshots + trace under e2e/evidence/' + u.id + '/. Read each with vision and judge. If missing or the vision check fails, do NOT merge. Merge ONLY IF it passes + green CI.'
const botNote = 'CodeRabbit/Greptile may be at trial limits; a billing/quota notice (or a check that just passes with no inline comments) is NON-BLOCKING — rely on green CI + independent adversarial review + visual QA. Still fix any real inline comment.'

const buildPrompt = (u) => [
  'You are the BUILDER for unit ' + u.id + ': ' + u.title + '.', u.brief, CONV, idemBuild(u),
  'In your worktree: 1) export PATH; git fetch origin; git checkout -B feat/' + u.id + ' origin/main; bun install.',
  '2) Implement + thorough tests. Run typecheck && lint && test && build && test:e2e until ALL green (rollout oracle: NO regressions + new coverage).',
  visualBuild(u),
  '3) git add -A; git commit -m "' + u.id + ': ' + u.title + '"; git push -u origin feat/' + u.id + '; gh pr create --base main --head feat/' + u.id + ' --title "' + u.id + ': ' + u.title + '" --body "<what + how tested + screenshot paths + vision verdict>".',
  'Return {ok, pr, branch:"feat/' + u.id + '", notes}. If stuck, ok=false but still push + open the PR.'
].join('\n')
const reviewPrompt = (u) => [
  'You are the INDEPENDENT TESTER + REVIEWER + MERGER for unit ' + u.id + ' (branch feat/' + u.id + '). Find the PR: gh pr list --head feat/' + u.id + ' --json number,url. Repo: ' + OWNER + '.', CONV, idemReview(u),
  '1) git fetch origin; git checkout feat/' + u.id + '; bun install. Independently verify typecheck+lint+test+build; add adversarial tests; fix real bugs; push.',
  visualReview(u),
  '2) gh pr checks <pr> --watch --interval 20 (bounded). Read CodeRabbit/Greptile; fix real blocking comments; up to 3 rounds. ' + botNote,
  '3) Confirm CI green. If behind main: git fetch; git rebase origin/main (keep ALL routes/registry/page changes from both sides); git push --force-with-lease.',
  '4) MERGE ONLY IF CI green + visual QA passes + no blocking comments: gh pr merge <pr> --squash --delete-branch. If Actions has not produced a build run, wait + re-check — never merge without confirmed-green CI.',
  '5) NEVER merge red or a UI PR with wrong/missing screenshots. If unfixable after 3 rounds, leave open, return merged=false, blocked=true.',
  'Return {merged, pr, blocked, note}.'
].join('\n')

async function buildUnit(u) {
  const b = await agent(buildPrompt(u), { label:'build:'+u.id, phase:phaseFor(), isolation:'worktree', effort:'high', schema:BUILD_SCHEMA })
  if (!b || !b.branch) return { unit:u.id, merged:false, blocked:true, note:'build failed/skipped' }
  const r = await agent(reviewPrompt(u), { label:'review:'+u.id, phase:phaseFor(), isolation:'worktree', effort:'high', schema:MERGE_SCHEMA })
  if (!r) return { unit:u.id, merged:false, blocked:true, note:'review failed/skipped' }
  return { unit:u.id, merged:!!r.merged, blocked:!!r.blocked, pr:r.pr, note:r.note }
}

const merged = []
const results = []
for (const u of UNITS) {
  log('Sequential build: ' + u.id + ' (' + (results.length + 1) + '/' + UNITS.length + ')')
  const r = await buildUnit(u)
  results.push(r)
  if (r.merged) merged.push(r.unit)
}
log('Gen-7 complete: ' + merged.length + '/' + UNITS.length + ' merged.')

phase('QA')
const QA_SCHEMA = { type:'object', additionalProperties:false, properties:{ healthy:{type:'boolean'}, suite:{type:'string'}, findings:{type:'array',items:{type:'string'}}, gaps:{type:'array',items:{type:'string'}} }, required:['healthy','findings'] }
const qa = await agent([
  'You are the QA/audit lead for ' + OWNER + ' (repo ' + REPO + ').', CONV,
  'In your worktree: git fetch origin; git checkout -B qa-gen7 origin/main; bun install. Run the FULL suite: typecheck, lint, test, build, CI=1 test:e2e.',
  'Verify the rollouts are CONSISTENT: reporting currency, export, and the tag filter now behave the same across pages; the shared formatter is adopted; no regressions. Confirm read-only + no secret leaks in dist.',
  'Do NOT modify code. Return {healthy, suite, findings:[...], gaps:[...]}.'
].join('\n'), { label:'qa-audit', phase:'QA', isolation:'worktree', effort:'high', schema:QA_SCHEMA })

phase('Live QA sweep')
const SWEEP_SCHEMA = { type:'object', additionalProperties:false, properties:{ ran:{type:'boolean'}, skipped:{type:'boolean'}, reason:{type:'string'}, flows:{type:'array',items:{type:'string'}}, findings:{type:'array',items:{type:'string'}}, screenshots:{type:'array',items:{type:'string'}} }, required:['ran'] }
const sweep = await agent([
  'You are the end-of-generation SERIALIZED LIVE QA SWEEP (only agent now; shared screen safe).', CONV,
  'Check Computer Use and/or Claude-in-Chrome MCP availability (ToolSearch "computer-use", "Claude_in_Chrome"). If NEITHER usable: return {ran:false, skipped:true, reason:"..."}.',
  'IF available: clean worktree off origin/main, bun install, bun run build, bun run preview in background; walk the app like a real user — switch reporting currency and confirm multiple pages update, export from a couple pages, apply a tag filter, deep-link a sub-view, open the holdings index — at desktop + mobile, capturing screenshots and judging with vision.',
  'Return {ran, skipped, reason, flows:[...], findings:[...], screenshots:[...]}.'
].join('\n'), { label:'live-qa-sweep', phase:'Live QA sweep', isolation:'worktree', effort:'high', schema:SWEEP_SCHEMA })

phase('Ideation')
const IDEAS_SCHEMA = { type:'object', additionalProperties:false, properties:{ rationale:{type:'string'}, nextUnits:{ type:'array', items:{ type:'object', additionalProperties:false, properties:{ id:{type:'string'}, title:{type:'string'}, brief:{type:'string'}, deps:{type:'array',items:{type:'string'}}, oracle:{type:'string'} }, required:['id','title','brief','deps','oracle'] } } }, required:['nextUnits','rationale'] }
const ideas = await agent([
  'You are the PM / ideation lead for family-office-os. Be thorough; no stub.', CONV,
  'Review the built product. QA: ' + JSON.stringify(qa || {}).slice(0,1400) + '.',
  'The app is now mature AND consistently polished. Be HONEST: if the feature space is saturating, say so and propose the highest-value remaining work — production-readiness (real data wiring, error monitoring, perf), deeper analytics, or genuinely novel capabilities — over busywork. For each unit: id (m14-xxx), title, brief, deps, machine-checkable oracle, and INDEPENDENT vs CROSS-CUTTING. Return {nextUnits:[...5-8...], rationale}.'
].join('\n'), { label:'ideation-pm', phase:'Ideation', isolation:'worktree', effort:'high', schema:IDEAS_SCHEMA })

return { generation:7, mergedCount: merged.length, total: UNITS.length, merged, results, qa, sweep, ideas }
