export const meta = {
  name: 'family-office-os-build-gen6',
  description: 'Gen-6 polish (SEQUENTIAL, cross-cutting): route registry + AppShell, theme/print, command palette, chart a11y, export toolkit, tag filter, reporting-currency. Builder+reviewer per unit, visual QA, QA + sweep + gen-7 ideation',
  phases: [ { title: 'm12 polish' }, { title: 'QA' }, { title: 'Live QA sweep' }, { title: 'Ideation' } ]
}

const REPO = '/Users/touko/Ambition'
const OWNER = 'toukkelipoukkeli-glitch/family-office-os'

const CONV = [
  'Repo: ' + REPO + ' (family-office-os). Read AGENTS.md (incl. the UI testing standard) and harness/RUNBOOK.md first.',
  'Bun: start EVERY bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  'Product is READ-ONLY: never write code that moves money or places trades; never SEND email.',
  'Tests MUST be deterministic and offline. Money is exact Decimal; number only at the render boundary.',
  'This is a CROSS-CUTTING / refactor generation: units touch shared files (src/App.tsx, the app shell, src/Dashboard.tsx, chart components). The oracle for refactors is NO REGRESSIONS — every existing unit + e2e test must still pass, and all existing routes/URLs keep working.',
  'If a file harness/HALT exists at the repo root, STOP immediately and return without acting.',
  'Do not modify .env contents, .claude/, harness/state, or unrelated logic.',
  'Gens 1-5 (67 units, 39 routes) are merged on main.'
].join(' ')

// Built STRICTLY in this order, one at a time (sequential), each off the latest main.
const UNITS = [
  { id:'m12-route-registry', ui:true, title:'Typed route registry + shared AppShell',
    brief:'Introduce a single typed route registry (array of {path,label,group,lazy component}) and a shared AppShell component (header/nav/back-link chrome). Generate App.tsx routeElement + the Dashboard nav FROM the registry, and migrate the existing ~39 routes into it WITHOUT changing behavior or URLs. Pages stop re-declaring chrome. ORACLE: all existing unit + e2e tests still pass (no regressions). + a registry unit test (every route resolves) and an e2e nav smoke.' },
  { id:'m12-theme-print', ui:true, title:'Dark/light theme + print stylesheet',
    brief:'Add a dark/light theme toggle in the AppShell with persisted preference (localStorage, defaulting to system), using Tailwind dark: classes, plus a print stylesheet for clean report printing. Unit (preference persists/resolves) + Playwright e2e (toggle works, persists across reload).' },
  { id:'m12-command-palette', ui:true, title:'Command palette (Cmd/Ctrl-K)',
    brief:'A command palette for global keyboard navigation across all routes (built from the route registry) + quick actions. Accessible: focus trap, arrow-key selection, Esc to close, aria roles. Unit + Playwright e2e (open via Cmd-K, filter, navigate).' },
  { id:'m12-chart-a11y', ui:true, title:'Chart accessibility + route announcer',
    brief:'Accessibility pass: give each chart an associated accessible data table (toggle or visually-hidden), add a skip-to-content link in the AppShell, and an aria-live route announcer on navigation. Add automated a11y assertions (roles/labels) in e2e for a few key pages. ORACLE: a11y assertions pass + no visual regressions.' },
  { id:'m12-export-toolkit', ui:true, title:'CSV/JSON export toolkit',
    brief:'src/lib/export: a deterministic CSV/JSON export toolkit + in-browser download wiring; add Export buttons to data-heavy pages (holdings/net-worth, reporting, tax-timeline, managers). ORACLE: vitest asserts exact CSV/JSON bytes from fixtures + e2e clicks export and asserts a download is triggered.' },
  { id:'m12-tag-filter', ui:true, title:'Global holding-tag filter',
    brief:'Surface holding tags (use the existing model tag field; if absent, add an optional tags array to the model + fixtures) as a global filter in the AppShell that narrows the portfolio across pages via shared state. Unit + Playwright e2e (select a tag, dashboard narrows).' },
  { id:'m12-reporting-currency', ui:true, title:'Global reporting-currency switcher',
    brief:'A global reporting-currency switcher in the AppShell that re-expresses portfolio values in a chosen base currency using the EXISTING FX normalization (src/lib/currency / fx adapters), with a persisted preference. ORACLE: unit asserts conversion correctness on fixtures + e2e switches currency and values update.' }
]

const phaseFor = () => 'm12 polish'
const BUILD_SCHEMA = { type:'object', additionalProperties:false, properties:{ ok:{type:'boolean'}, pr:{type:'string'}, branch:{type:'string'}, notes:{type:'string'} }, required:['ok','branch'] }
const MERGE_SCHEMA = { type:'object', additionalProperties:false, properties:{ merged:{type:'boolean'}, pr:{type:'string'}, blocked:{type:'boolean'}, note:{type:'string'} }, required:['merged'] }

const idemBuild = (u) => 'IDEMPOTENT RESUME GUARD: first run gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If already MERGED, return {ok:true, pr:<url>, branch:"feat/' + u.id + '", notes:"already merged"} immediately. If an OPEN PR exists, reuse it.'
const idemReview = (u) => 'IDEMPOTENT RESUME GUARD: first run gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If already MERGED, return {merged:true, pr:<url>, blocked:false, note:"already merged"} immediately.'
const visualBuild = (u) => 'VISUAL QA (REQUIRED): Playwright e2e MUST exercise the change and capture screenshots at BOTH desktop (1280x800) and mobile (390x844) + a trace, saved under e2e/evidence/' + u.id + '/ and COMMITTED. Use the Read tool to VIEW each screenshot with vision and judge like a human (rendered? laid out? not blank/clipped/overflowing? readable on mobile?). Fix until correct. Link paths + vision verdict in the PR body.'
const visualReview = (u) => 'VISUAL QA GATE: confirm desktop (1280x800) + mobile (390x844) screenshots + trace under e2e/evidence/' + u.id + '/. Read each with vision and judge. If missing or the vision check fails, do NOT merge. Merge ONLY IF the vision check passes AND screenshots look correct, in addition to green CI.'
const botNote = 'NOTE: CodeRabbit + Greptile may be at/near trial limits; a billing/quota notice (or a check that just passes with no inline comments) is NON-BLOCKING — rely on green CI + your independent adversarial review + the visual-QA gate. Still fix any real inline comment.'

const buildPrompt = (u) => [
  'You are the BUILDER for unit ' + u.id + ': ' + u.title + '.', u.brief, CONV, idemBuild(u),
  'In your worktree: 1) export PATH; git fetch origin; git checkout -B feat/' + u.id + ' origin/main; bun install.',
  '2) Implement + thorough tests. Run bun run typecheck && lint && test && build && test:e2e until ALL green (refactor oracle: NO regressions).',
  visualBuild(u),
  '3) git add -A; git commit -m "' + u.id + ': ' + u.title + '"; git push -u origin feat/' + u.id + '; gh pr create --base main --head feat/' + u.id + ' --title "' + u.id + ': ' + u.title + '" --body "<what + how tested + screenshot paths + vision verdict>".',
  'Return {ok, pr, branch:"feat/' + u.id + '", notes}. If stuck, ok=false but still push + open the PR.'
].join('\n')
const reviewPrompt = (u) => [
  'You are the INDEPENDENT TESTER + REVIEWER + MERGER for unit ' + u.id + ' (branch feat/' + u.id + '). Find the PR: gh pr list --head feat/' + u.id + ' --json number,url. Repo: ' + OWNER + '.', CONV, idemReview(u),
  '1) git fetch origin; git checkout feat/' + u.id + '; bun install. Independently verify typecheck+lint+test+build; add adversarial tests; fix real bugs; push.',
  visualReview(u),
  '2) gh pr checks <pr> --watch --interval 20 (bounded). Read CodeRabbit/Greptile; fix real blocking inline comments; up to 3 rounds. ' + botNote,
  '3) Confirm CI green. If behind main: git fetch; git rebase origin/main (keep ALL routes/registry entries from both sides); git push --force-with-lease.',
  '4) MERGE ONLY IF CI green + visual-QA passes + no blocking comments: gh pr merge <pr> --squash --delete-branch. If Actions has not produced a build run, wait and re-check — never merge without confirmed-green CI.',
  '5) NEVER merge red or a UI PR with wrong/missing screenshots. If unfixable after 3 rounds, leave open, return merged=false, blocked=true.',
  'Return {merged, pr, blocked, note}.'
].join('\n')

async function buildUnit(u) {
  const ph = phaseFor()
  const b = await agent(buildPrompt(u), { label:'build:'+u.id, phase:ph, isolation:'worktree', effort:'high', schema:BUILD_SCHEMA })
  if (!b || !b.branch) return { unit:u.id, merged:false, blocked:true, note:'build agent failed/skipped' }
  const r = await agent(reviewPrompt(u), { label:'review:'+u.id, phase:ph, isolation:'worktree', effort:'high', schema:MERGE_SCHEMA })
  if (!r) return { unit:u.id, merged:false, blocked:true, note:'review agent failed/skipped' }
  return { unit:u.id, merged:!!r.merged, blocked:!!r.blocked, pr:r.pr, note:r.note }
}

// SEQUENTIAL: one unit fully built+merged before the next starts (each off latest main -> no cross-unit conflicts).
const merged = []
const results = []
for (const u of UNITS) {
  log('Sequential build: ' + u.id + ' (' + (results.length + 1) + '/' + UNITS.length + ')')
  const r = await buildUnit(u)
  results.push(r)
  if (r.merged) merged.push(r.unit)
}
log('Gen-6 build complete: ' + merged.length + '/' + UNITS.length + ' merged.')

phase('QA')
const QA_SCHEMA = { type:'object', additionalProperties:false, properties:{ healthy:{type:'boolean'}, suite:{type:'string'}, findings:{type:'array',items:{type:'string'}}, gaps:{type:'array',items:{type:'string'}} }, required:['healthy','findings'] }
const qa = await agent([
  'You are the QA/audit lead for ' + OWNER + ' (repo ' + REPO + ').', CONV,
  'In your worktree: git fetch origin; git checkout -B qa-gen6 origin/main; bun install. Run the FULL suite: typecheck, lint, test, build, CI=1 test:e2e.',
  'Verify the cross-cutting changes did not regress: all routes still resolve, theme/palette/export/tag/currency work, charts have a11y tables, and the AppShell refactor preserved behavior. Confirm read-only + no secret leaks in dist.',
  'Do NOT modify code. Return {healthy, suite, findings:[...], gaps:[...]}.'
].join('\n'), { label:'qa-audit', phase:'QA', isolation:'worktree', effort:'high', schema:QA_SCHEMA })

phase('Live QA sweep')
const SWEEP_SCHEMA = { type:'object', additionalProperties:false, properties:{ ran:{type:'boolean'}, skipped:{type:'boolean'}, reason:{type:'string'}, flows:{type:'array',items:{type:'string'}}, findings:{type:'array',items:{type:'string'}}, screenshots:{type:'array',items:{type:'string'}} }, required:['ran'] }
const sweep = await agent([
  'You are the end-of-generation SERIALIZED LIVE QA SWEEP (only agent now; shared screen safe).', CONV,
  'Check whether Computer Use and/or Claude-in-Chrome MCPs are connected + a screen is usable (ToolSearch "computer-use", "Claude_in_Chrome"). If NEITHER usable: return {ran:false, skipped:true, reason:"..."}.',
  'IF available: in a clean worktree off origin/main, bun install; bun run build; bun run preview in background; walk the app like a real user — try the command palette (Cmd-K), theme toggle, an export, the tag filter, and the reporting-currency switcher — at desktop + mobile, capturing screenshots and judging with vision.',
  'Return {ran, skipped, reason, flows:[...], findings:[...], screenshots:[...]}.'
].join('\n'), { label:'live-qa-sweep', phase:'Live QA sweep', isolation:'worktree', effort:'high', schema:SWEEP_SCHEMA })

phase('Ideation')
const IDEAS_SCHEMA = { type:'object', additionalProperties:false, properties:{ rationale:{type:'string'}, nextUnits:{ type:'array', items:{ type:'object', additionalProperties:false, properties:{ id:{type:'string'}, title:{type:'string'}, brief:{type:'string'}, deps:{type:'array',items:{type:'string'}}, oracle:{type:'string'} }, required:['id','title','brief','deps','oracle'] } } }, required:['nextUnits','rationale'] }
const ideas = await agent([
  'You are the PM / ideation lead for family-office-os. Be thorough — propose 5-8 concrete, high-value units (no stub).', CONV,
  'Review the built product. QA: ' + JSON.stringify(qa || {}).slice(0,1400) + '.',
  'The app is mature (40+ pages, deep engines, polish layer now in). Favor genuinely high-value DEPTH or cross-cutting quality the app still lacks; flag honestly if the space is saturating. For each unit: id (m13-xxx), title, brief, deps, machine-checkable oracle. Mark whether each is INDEPENDENT (new page) or CROSS-CUTTING (touches shared shell) so the build can sequence cross-cutting ones.',
  'Return {nextUnits:[...], rationale}.'
].join('\n'), { label:'ideation-pm', phase:'Ideation', isolation:'worktree', effort:'high', schema:IDEAS_SCHEMA })

return { generation:6, mergedCount: merged.length, total: UNITS.length, merged, results, qa, sweep, ideas }
