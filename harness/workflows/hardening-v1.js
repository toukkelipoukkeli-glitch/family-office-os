export const meta = {
  name: 'family-office-os-hardening-v1',
  description: 'v1 hardening (SEQUENTIAL): export precision+currency fix, mobile-nav overflow, CSV-injection, cross-browser e2e, no-key-no-network guard. Builder+reviewer per unit, visual QA, then QA.',
  phases: [ { title: 'm14 hardening' }, { title: 'QA' } ]
}

const REPO = '/Users/touko/Ambition'
const OWNER = 'toukkelipoukkeli-glitch/family-office-os'

const CONV = [
  'Repo: ' + REPO + ' (family-office-os). Read AGENTS.md (incl. the UI testing standard) and harness/RUNBOOK.md first.',
  'Bun: start EVERY bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  'Product is READ-ONLY: never code that moves money/places trades; never SEND email. Money is exact Decimal; number only at the render boundary.',
  'This is a HARDENING pass: fix real gaps WITHOUT regressions — every existing unit + e2e test must still pass.',
  'The app is deployed to GitHub Pages (auto-redeploy on merge). Do not break the build.',
  'If a file harness/HALT exists at the repo root, STOP immediately. Do not modify .env, .claude/, harness/state.',
  'Gens 1-7 (73 units, ~40 routes) merged on main, plus a polish layer (route registry/AppShell, export toolkit, reporting-currency, tag filter, command palette).'
].join(' ')

const UNITS = [
  { id:'m14-export-precision', ui:true, title:'Exact-Decimal + currency-correct export on every data page',
    brief:'Add CSV/JSON export to every data-heavy page that still lacks it, deriving values from the exact-Decimal engine model (NOT collapsed float view-models) and applying the active reporting-currency conversion (convertMoney) so downloads exactly match the on-screen values, including after a currency switch. Add a per-page export-shape UNIT test for EACH covered page (assert exact-Decimal strings + currency-converted values). Follow the correct existing pattern (concentration/estate/giving/ops exports). Also fix AlertsPage to export the FILTERED visible rows. ORACLE: per-page shape tests + e2e export-download per page; no regressions. (This replaces the closed PR #85.)' },
  { id:'m14-mobile-nav', ui:true, title:'Fix global nav horizontal overflow on mobile',
    brief:'The global route nav row overflows the viewport at 390px (a long-standing flagged issue). Make it wrap or horizontally scroll cleanly so page content has no horizontal overflow. ORACLE: e2e at 390x844 asserts document.scrollWidth <= clientWidth (no horizontal overflow) on the dashboard + a couple of pages; visual QA at desktop+mobile.' },
  { id:'m14-csv-injection', ui:true, title:'CSV formula-injection hardening',
    brief:'Harden CSV export (src/lib/export) against formula injection: any cell value beginning with = + - @ (or tab/CR) is escaped (e.g. prefixed with a single quote) so spreadsheets do not execute it. JSON export unaffected. ORACLE: unit tests assert dangerous cells are neutralized and benign cells unchanged; all existing export shape tests still pass.' },
  { id:'m14-cross-browser', ui:true, title:'Cross-browser e2e (Firefox + WebKit)',
    brief:'Add firefox and webkit projects to playwright.config.ts and update CI to install them (npx playwright install --with-deps chromium firefox webkit). Keep OS-specific visual-snapshot tests CI-skipped. Fix any GENUINE cross-browser failures. ORACLE: e2e green on chromium + firefox + webkit in CI.' },
  { id:'m14-no-key-guard', ui:true, title:'No live network call without keys (guard + test)',
    brief:'Ensure the client bundle makes NO live network call to AI/data providers without keys: the AI-insights (Gemini) and any client path must degrade gracefully (render an unavailable state) when keys are absent, never fetching a live endpoint from the browser. ORACLE: a test asserts no fetch to live AI/data hosts occurs in the client path without keys, and the graceful-fallback e2e passes.' }
]

const phaseFor = () => 'm14 hardening'
const BUILD_SCHEMA = { type:'object', additionalProperties:false, properties:{ ok:{type:'boolean'}, pr:{type:'string'}, branch:{type:'string'}, notes:{type:'string'} }, required:['ok','branch'] }
const MERGE_SCHEMA = { type:'object', additionalProperties:false, properties:{ merged:{type:'boolean'}, pr:{type:'string'}, blocked:{type:'boolean'}, note:{type:'string'} }, required:['merged'] }

const idemBuild = (u) => 'IDEMPOTENT RESUME GUARD: gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If MERGED, return {ok:true, pr:<url>, branch:"feat/' + u.id + '", notes:"already merged"} immediately. If an OPEN PR exists, reuse it.'
const idemReview = (u) => 'IDEMPOTENT RESUME GUARD: gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If MERGED, return {merged:true, pr:<url>, blocked:false, note:"already merged"} immediately.'
const visualBuild = (u) => 'VISUAL QA (REQUIRED): Playwright e2e MUST exercise the change and capture desktop (1280x800) + mobile (390x844) screenshots + a trace under e2e/evidence/' + u.id + '/ (COMMIT them). Read each with vision and judge like a human (rendered? laid out? no overflow/clipping? readable on mobile?). Fix until correct. Link paths + vision verdict in the PR body.'
const visualReview = (u) => 'VISUAL QA GATE: confirm desktop+mobile screenshots + trace under e2e/evidence/' + u.id + '/. Read each with vision. If missing or the vision check fails, do NOT merge. Merge ONLY IF it passes + green CI.'
const botNote = 'CodeRabbit/Greptile may be at trial limits; a billing/quota notice (or a check that just passes with no inline comments) is NON-BLOCKING — rely on green CI + independent adversarial review + visual QA. Still fix any real inline comment.'

const buildPrompt = (u) => [
  'You are the BUILDER for unit ' + u.id + ': ' + u.title + '.', u.brief, CONV, idemBuild(u),
  'In your worktree: 1) export PATH; git fetch origin; git checkout -B feat/' + u.id + ' origin/main; bun install.',
  '2) Implement + thorough tests. Run typecheck && lint && test && build && test:e2e until ALL green (NO regressions).',
  visualBuild(u),
  '3) git add -A; git commit -m "' + u.id + ': ' + u.title + '"; git push -u origin feat/' + u.id + '; gh pr create --base main --head feat/' + u.id + ' --title "' + u.id + ': ' + u.title + '" --body "<what + how tested + screenshot paths + vision verdict>".',
  'Return {ok, pr, branch:"feat/' + u.id + '", notes}. If stuck, ok=false but still push + open the PR.'
].join('\n')
const reviewPrompt = (u) => [
  'You are the INDEPENDENT TESTER + REVIEWER + MERGER for unit ' + u.id + ' (branch feat/' + u.id + '). Find the PR: gh pr list --head feat/' + u.id + ' --json number,url. Repo: ' + OWNER + '.', CONV, idemReview(u),
  '1) git fetch origin; git checkout feat/' + u.id + '; bun install. Independently verify typecheck+lint+test+build; add adversarial tests; fix real bugs; push.',
  visualReview(u),
  '2) gh pr checks <pr> --watch --interval 20 (bounded). Read CodeRabbit/Greptile; fix real blocking comments; up to 3 rounds. ' + botNote,
  '3) Confirm CI green. If behind main: git fetch; git rebase origin/main (keep ALL changes from both sides); git push --force-with-lease.',
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
  log('Hardening (sequential): ' + u.id + ' (' + (results.length + 1) + '/' + UNITS.length + ')')
  const r = await buildUnit(u)
  results.push(r)
  if (r.merged) merged.push(r.unit)
}
log('Hardening complete: ' + merged.length + '/' + UNITS.length + ' merged.')

phase('QA')
const QA_SCHEMA = { type:'object', additionalProperties:false, properties:{ healthy:{type:'boolean'}, suite:{type:'string'}, findings:{type:'array',items:{type:'string'}}, gaps:{type:'array',items:{type:'string'}} }, required:['healthy','findings'] }
const qa = await agent([
  'You are the final v1 QA/release lead for ' + OWNER + ' (repo ' + REPO + '). The app is deployed to GitHub Pages.', CONV,
  'In your worktree: git fetch origin; git checkout -B qa-v1 origin/main; bun install. Run the FULL suite: typecheck, lint, test, build, CI=1 test:e2e.',
  'Confirm v1 quality: exports are exact-Decimal + currency-correct, no mobile overflow, CSV injection-safe, cross-browser e2e present, no key-less network calls, read-only, no secret leaks. Give an honest release-readiness verdict + any residual gaps.',
  'Do NOT modify code. Return {healthy, suite, findings:[...], gaps:[...]}.'
].join('\n'), { label:'qa-release', phase:'QA', isolation:'worktree', effort:'high', schema:QA_SCHEMA })

return { generation:'hardening-v1', mergedCount: merged.length, total: UNITS.length, merged, results, qa }
