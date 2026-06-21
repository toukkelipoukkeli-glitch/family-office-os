export const meta = {
  name: 'family-office-os-build-gen4',
  description: 'Gen-4 build: tax-aware rebalancing, currency hedging, historical stress library, philanthropy, insurance, executive home, AI insights; builder+reviewer per unit, visual QA, QA + sweep + gen-5 ideation',
  phases: [ { title: 'm10 build' }, { title: 'QA' }, { title: 'Live QA sweep' }, { title: 'Ideation' } ]
}

const REPO = '/Users/touko/Ambition'
const OWNER = 'toukkelipoukkeli-glitch/family-office-os'

const CONV = [
  'Repo: ' + REPO + ' (family-office-os). Read AGENTS.md (incl. the UI testing standard) and harness/RUNBOOK.md first.',
  'Bun: start EVERY bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  'Product is READ-ONLY: never write code that moves money or places trades; never SEND email.',
  'Tests MUST be deterministic and offline — use fixtures, never hit live APIs in tests.',
  'When adding a route, register it in src/App.tsx (React.lazy + the routeElement switch) and add a nav entry in src/Dashboard.tsx; keep ALL existing routes.',
  'If a file harness/HALT exists at the repo root, STOP immediately and return without acting.',
  'Do not modify .env contents, .claude/, harness/state, or unrelated units files.',
  'Gen-1+2+3 (52 feature units) are merged on main: model/money/returns/risk/alloc, charts, convex + data adapters, illiquid valuations, scenario engine, company/org/captable/ownership, deal-flow, tax-lots/harvest/attribution/fees/alerts/lookthrough/estate, pe-lifecycle/benchmark/ips/cashflow/tax-estimate/reporting/vault/risk-limits. Build on them.'
].join(' ')

const UNITS = [
  { id:'m10-rebalance', deps:['m0-alloc','m0-model','m9-ips','m7-tax-lots'], ui:true, title:'Tax-aware rebalancing proposal',
    brief:'src/lib/rebalance + a /rebalance route: propose trades to move a portfolio toward its IPS target allocation while MINIMIZING realized tax (use tax-lot selection from src/lib/taxlots, targets from src/lib/ips). Read-only proposal only (never executes). Deterministic unit tests (proposal reconciles to targets within tolerance; tax estimate matches hand-calc) + Playwright e2e+screenshot.' },
  { id:'m10-currency', deps:['m0-model','m1-fx','m0-charts'], ui:true, title:'Currency exposure & hedging',
    brief:'src/lib/currency + a /currency route: portfolio FX exposure by currency, hedge-ratio scenarios, and indicative cost of hedging. Fixture-based, offline. Unit tests + Playwright e2e+screenshot.' },
  { id:'m10-stress', deps:['m3-scenarios','m0-charts'], ui:true, title:'Historical stress-test library',
    brief:'src/lib/stress + a /stress route: named historical stress scenarios (2008 GFC, 2020 COVID crash, 2022 rate shock) as documented parameter sets applied to the existing scenario engine, with before/after net-worth impact. Unit tests + Playwright e2e+screenshot.' },
  { id:'m10-philanthropy', deps:['m7-tax-lots','m7-tax-estimate','m0-money'], ui:true, title:'Charitable giving planner',
    brief:'src/lib/giving + a /giving route: model gifting appreciated assets (capital-gains avoided + deduction value), DAF contributions, and multi-year giving plans. Read-only. Unit tests (tax benefit vs hand-calc) + Playwright e2e+screenshot.' },
  { id:'m10-insurance', deps:['m0-model','m0-money','m5-company-model'], ui:true, title:'Insurance coverage tracker',
    brief:'src/lib/insurance + an /insurance route: track policies (life, P&C, liability, umbrella) as fixtures and compute coverage vs net-worth exposure + coverage-gap flags. Read-only. Unit tests + Playwright e2e+screenshot.' },
  { id:'m10-home', deps:['m0-returns','m0-risk','m9-ips','m3-scenarios'], ui:true, title:'Executive home overview',
    brief:'A top-level executive home/overview (the / landing or a /home route) composing headline KPIs from across the app — net worth, TWR, volatility/drawdown, IPS compliance status, liquidity runway, open alerts — into one at-a-glance cockpit with links into each module. Playwright e2e+screenshot.' },
  { id:'m10-ai-insights', deps:['m0-returns','m0-alloc','m9-reporting'], ui:true, title:'AI portfolio narrative (optional, isolated)',
    brief:'src/lib/ai (single adapter) + an insights panel: generate a plain-English narrative of portfolio state via a Gemini adapter reading GEMINI_API_KEY server-side. CRITICAL: tests use FIXTURE responses only (never call the live API); the adapter must DEGRADE GRACEFULLY (render "AI insights unavailable" if the key is absent/invalid). Keep all AI behind this one adapter. Unit tests on the fixture path + Playwright e2e on the graceful-fallback path.' }
]

const unitIds = new Set(UNITS.map(u => u.id))
const phaseFor = () => 'm10 build'

const BUILD_SCHEMA = { type:'object', additionalProperties:false, properties:{ ok:{type:'boolean'}, pr:{type:'string'}, branch:{type:'string'}, notes:{type:'string'} }, required:['ok','branch'] }
const MERGE_SCHEMA = { type:'object', additionalProperties:false, properties:{ merged:{type:'boolean'}, pr:{type:'string'}, blocked:{type:'boolean'}, note:{type:'string'} }, required:['merged'] }

const idemBuild = (u) => 'IDEMPOTENT RESUME GUARD: first run gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If already MERGED, return {ok:true, pr:<url>, branch:"feat/' + u.id + '", notes:"already merged"} immediately. If an OPEN PR exists, reuse that branch/PR.'
const idemReview = (u) => 'IDEMPOTENT RESUME GUARD: first run gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If already MERGED, return {merged:true, pr:<url>, blocked:false, note:"already merged"} immediately.'
const visualBuild = (u) => 'VISUAL QA (REQUIRED — UI unit): the Playwright e2e MUST click through the workflow, type realistic data, exercise navigation, AND capture screenshots at BOTH desktop (1280x800) and mobile (390x844) AND record a trace. Save under e2e/evidence/' + u.id + '/ and COMMIT them. Then use the Read tool to VIEW each screenshot with vision and judge like a human (rendered? laid out? charts drawn? not blank/clipped/overflowing? readable on mobile?). Fix the UI until correct. Link screenshot paths + vision verdict in the PR body.'
const visualReview = (u) => 'VISUAL QA GATE (UI unit): confirm desktop (1280x800) + mobile (390x844) screenshots + trace exist under e2e/evidence/' + u.id + '/. Use the Read tool to VIEW each with vision and judge like a human. If missing or the vision check fails, do NOT merge. Merge a UI PR ONLY IF the vision check passes AND screenshots look correct, in addition to green CI.'
const botNote = 'NOTE: CodeRabbit + Greptile may be at/near trial limits; if a bot posts only a billing/quota/trial-limit notice (or its check just passes with no inline comments), treat it as NON-BLOCKING and rely on green CI + your own independent adversarial review + the visual-QA gate. Still fix any real inline comment.'

const buildPrompt = (u) => {
  const lines = [
    'You are the BUILDER for unit ' + u.id + ': ' + u.title + '.', u.brief, CONV, idemBuild(u),
    'Steps in your isolated worktree:',
    '1) export PATH; git fetch origin; git checkout -B feat/' + u.id + ' origin/main; bun install.',
    '2) Implement the feature AND thorough tests (oracle rule). UI: add a Vitest component test AND a Playwright e2e/visual test.',
    '3) Ensure ALL pass: bun run typecheck && bun run lint && bun run test && bun run build (also bun run test:e2e).'
  ]
  if (u.ui) lines.push(visualBuild(u))
  lines.push(
    '4) git add -A; git commit -m "' + u.id + ': ' + u.title + '"; git push -u origin feat/' + u.id + '.',
    '5) gh pr create --base main --head feat/' + u.id + ' --title "' + u.id + ': ' + u.title + '" --body "<what + how tested + screenshot paths + vision verdict>".',
    'Return {ok, pr, branch:"feat/' + u.id + '", notes}. If stuck, set ok=false but still push + open the PR.'
  )
  return lines.join('\n')
}
const reviewPrompt = (u) => {
  const lines = [
    'You are the INDEPENDENT TESTER + REVIEWER + MERGER for unit ' + u.id + ' on branch feat/' + u.id + '.',
    'Find the PR: gh pr list --head feat/' + u.id + ' --json number,url. Repo: ' + OWNER + '.', CONV, idemReview(u),
    'Steps in your isolated worktree:',
    '1) export PATH; git fetch origin; git checkout feat/' + u.id + '; bun install.',
    '2) Independently verify: bun run typecheck && bun run lint && bun run test && bun run build. Add adversarial edge-case tests; fix real bugs and push.'
  ]
  if (u.ui) lines.push(visualReview(u))
  lines.push(
    '3) Wait for external review: gh pr checks <pr> --watch --interval 20 (bounded). Read CodeRabbit + Greptile via gh api; address EVERY real blocking inline comment; push fixes; up to 3 rounds. ' + botNote,
    '4) Confirm CI green: gh pr checks <pr>. If behind main: git fetch origin; git rebase origin/main (resolve src/App.tsx and src/Dashboard.tsx route/nav conflicts by KEEPING ALL routes/entries from both sides); git push --force-with-lease.',
    '5) MERGE ONLY IF CI green, the visual-QA vision check passes, and no unresolved BLOCKING comments: gh pr merge <pr> --squash --delete-branch. If behind, re-fetch/rebase/push/retry once. If GitHub Actions has not produced a build run, wait and re-check (CI may be briefly delayed) — never merge without a confirmed-green build.',
    '6) NEVER merge red or a UI PR whose screenshots look wrong/missing. If it cannot go green after 3 rounds, leave the PR open and return merged=false, blocked=true with reason.',
    'Return {merged, pr, blocked, note}.'
  )
  return lines.join('\n')
}

async function buildUnit(u) {
  const ph = phaseFor(u.id)
  const b = await agent(buildPrompt(u), { label:'build:'+u.id, phase:ph, isolation:'worktree', effort:'high', schema:BUILD_SCHEMA })
  if (!b || !b.branch) return { unit:u.id, merged:false, blocked:true, note:'build agent failed/skipped' }
  const r = await agent(reviewPrompt(u), { label:'review:'+u.id, phase:ph, isolation:'worktree', effort:'high', schema:MERGE_SCHEMA })
  if (!r) return { unit:u.id, merged:false, blocked:true, note:'review agent failed/skipped' }
  return { unit:u.id, merged:!!r.merged, blocked:!!r.blocked, pr:r.pr, note:r.note }
}

const waves = []
const done = new Set()
let remaining = UNITS.slice()
while (remaining.length) {
  const wave = remaining.filter(u => u.deps.every(d => done.has(d) || !unitIds.has(d)))
  if (!wave.length) { log('Unresolvable deps for: ' + remaining.map(u=>u.id).join(',')); break }
  waves.push(wave); wave.forEach(u => done.add(u.id)); remaining = remaining.filter(u => !done.has(u.id))
}
log('Gen-4: ' + waves.length + ' wave(s) over ' + UNITS.length + ' units.')

const merged = new Set()
const results = []
for (let i = 0; i < waves.length; i++) {
  const wave = waves[i]
  const ready = wave.filter(u => u.deps.every(d => merged.has(d) || !unitIds.has(d)))
  const skipped = wave.filter(u => !ready.includes(u))
  skipped.forEach(u => results.push({ unit:u.id, merged:false, blocked:true, note:'gen-4 dependency not merged' }))
  log('Wave ' + (i+1) + '/' + waves.length + ': ' + ready.map(u=>u.id).join(', '))
  const wr = await parallel(ready.map(u => () => buildUnit(u)))
  wr.filter(Boolean).forEach(r => { results.push(r); if (r.merged) merged.add(r.unit) })
}
const mergedList = [...merged]
log('Gen-4 build complete: ' + mergedList.length + '/' + UNITS.length + ' merged.')

phase('QA')
const QA_SCHEMA = { type:'object', additionalProperties:false, properties:{ healthy:{type:'boolean'}, suite:{type:'string'}, findings:{type:'array',items:{type:'string'}}, gaps:{type:'array',items:{type:'string'}} }, required:['healthy','findings'] }
const qa = await agent([
  'You are the QA/audit lead for ' + OWNER + ' (repo ' + REPO + ').', CONV,
  'In your worktree: git fetch origin; git checkout -B qa-gen4 origin/main; bun install. Run the FULL suite: typecheck, lint, test, build, and (best-effort) test:e2e (use CI=1 to match CI skips).',
  'Holistically review the merged app (all generations): code quality, security (no secret leaks; read-only), test-coverage gaps, and whether the new /rebalance, /currency, /stress, /giving, /insurance, home, and AI-insights surfaces render (build then preview; screenshot).',
  'Do NOT modify code. Return {healthy, suite, findings:[...], gaps:[...]}.'
].join('\n'), { label:'qa-audit', phase:'QA', isolation:'worktree', effort:'high', schema:QA_SCHEMA })

phase('Live QA sweep')
const SWEEP_SCHEMA = { type:'object', additionalProperties:false, properties:{ ran:{type:'boolean'}, skipped:{type:'boolean'}, reason:{type:'string'}, flows:{type:'array',items:{type:'string'}}, findings:{type:'array',items:{type:'string'}}, screenshots:{type:'array',items:{type:'string'}} }, required:['ran'] }
const sweep = await agent([
  'You are the end-of-generation SERIALIZED LIVE QA SWEEP (only agent now; shared screen is safe).', CONV,
  'STEP 1 (availability): check whether Computer Use MCP and/or Claude-in-Chrome MCP are connected and a screen is usable (ToolSearch "computer-use" and "Claude_in_Chrome"). Computer Use may need request_access (unavailable unattended).',
  'IF NEITHER usable: return {ran:false, skipped:true, reason:"..."}. Do NOT fail.',
  'IF available: in a clean worktree off origin/main, bun install; bun run build; start bun run preview in background; walk the app like a real user across the main flows incl. the new gen-4 surfaces at desktop + mobile, capturing screenshots and judging with vision.',
  'Return {ran, skipped, reason, flows:[...], findings:[...], screenshots:[...]}.'
].join('\n'), { label:'live-qa-sweep', phase:'Live QA sweep', isolation:'worktree', effort:'high', schema:SWEEP_SCHEMA })

phase('Ideation')
const IDEAS_SCHEMA = { type:'object', additionalProperties:false, properties:{ rationale:{type:'string'}, nextUnits:{ type:'array', items:{ type:'object', additionalProperties:false, properties:{ id:{type:'string'}, title:{type:'string'}, brief:{type:'string'}, deps:{type:'array',items:{type:'string'}}, oracle:{type:'string'} }, required:['id','title','brief','deps','oracle'] } } }, required:['nextUnits','rationale'] }
const ideas = await agent([
  'You are the PM / ideation lead for family-office-os. Be thorough — propose 6-9 concrete, high-value units (this is important; do not return a stub).', CONV,
  'Review the built product (AGENTS.md, harness/state, merged code on main). QA: ' + JSON.stringify(qa || {}).slice(0,1500) + '.',
  'Propose the NEXT generation (gen-5) of high-value features (depth over shallow breadth). For each: id (m11-xxx), title, a concrete build brief, deps (ids of existing units), and a machine-checkable oracle. Do NOT build them.',
  'Return {nextUnits:[...6-9 items...], rationale}.'
].join('\n'), { label:'ideation-pm', phase:'Ideation', isolation:'worktree', effort:'high', schema:IDEAS_SCHEMA })

return { generation:4, mergedCount: mergedList.length, total: UNITS.length, merged: mergedList, results, qa, sweep, ideas }
