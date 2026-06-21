export const meta = {
  name: 'family-office-os-build-gen3',
  description: 'Gen-3 build: PE lifecycle, benchmark, IPS, cashflow, tax-estimate, reporting, vault, risk-limits + hardening; builder+reviewer per unit, visual QA, QA + sweep + gen-4 ideation',
  phases: [ { title: 'm9 build' }, { title: 'QA' }, { title: 'Live QA sweep' }, { title: 'Ideation' } ]
}

const REPO = '/Users/touko/Ambition'
const OWNER = 'toukkelipoukkeli-glitch/family-office-os'

const CONV = [
  'Repo: ' + REPO + ' (family-office-os). Read AGENTS.md (incl. the UI testing standard) and harness/RUNBOOK.md first.',
  'Bun: start EVERY bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  'Product is READ-ONLY: never write code that moves money or places trades; never SEND email.',
  'Tests MUST be deterministic and offline — use fixtures, never hit live APIs in tests.',
  'If a file harness/HALT exists at the repo root, STOP immediately and return without acting.',
  'Do not modify .env contents, .claude/, harness/state, or unrelated units files.',
  'Gen-1 (m0-m6, 35 units) and gen-2 (m7/m8 depth: tax-lots, harvest, attribution, fees, alerts, ops-live, lookthrough, estate) are merged on main — build on top.'
].join(' ')

const UNITS = [
  { id:'m9-pe-lifecycle', deps:['m0-money','m0-model','m0-returns'], title:'Private-markets commitment lifecycle',
    brief:'src/lib/privatemarkets: Decimal-based PE/VC/real-asset fund engine. Commitment {committed, vintageYear, currency} + dated cashflow ledger of capital calls/distributions; compute TVPI/DPI/RVPI/MOIC, unfunded, PE IRR, and J-curve pacing. Vitest on fixtures vs hand-computed.' },
  { id:'m9-benchmark', deps:['m0-returns','m0-risk','m0-alloc'], title:'Benchmark + relative performance',
    brief:'src/lib/benchmark: benchmark return series (fixtures: broad equity, bond, 60/40, and a custom blended policy benchmark from weighted asset-class index returns) + relative perf (excess return, tracking error, info ratio, beta). Vitest on fixtures.' },
  { id:'m9-ips', deps:['m0-alloc','m0-model','m9-benchmark'], title:'IPS / mandate compliance',
    brief:'src/lib/ips: a governed policy model generalizing the alert rules into an Investment Policy Statement with named constraints (asset-class min/max bands, single-position concentration caps, liquidity floors, benchmark) + breach evaluation + breach history. Vitest (breach + pass fixtures).' },
  { id:'m9-cashflow', deps:['m0-money','m9-pe-lifecycle'], title:'Household cashflow projection',
    brief:'src/lib/cashflow: deterministic household/entity cash projection over a horizon. Recurring inflows (dividends, coupons, rent, salary) + outflows (living expenses, taxes, fees) + PE capital-call/distribution schedule (from m9-pe-lifecycle). Projected monthly balance series. Vitest vs hand-computed.' },
  { id:'m9-tax-estimate', deps:['m7-tax-lots','m7-harvest','m7-fees'], title:'Consolidated tax estimate',
    brief:'src/lib/taxestimate: read-only annual tax estimator consolidating realized short/long-term capital gains (from tax-lots), realized-loss benefit (from harvest), income, and fees, with configurable rate brackets. Vitest on fixtures.' },
  { id:'m9-reporting', deps:['m9-benchmark','m9-ips','m9-pe-lifecycle','m7-attribution','m7-fees'], ui:true, title:'Board-grade reporting (/reports)',
    brief:'src/lib/reporting + a /reports route: compose engines into one dated report object (net-worth & TWR, allocation vs policy via ips, benchmark-relative perf, attribution, fees, PE metrics) and render a board-grade report view with deterministic export. Vitest snapshot of the composed report + Playwright e2e+screenshot.' },
  { id:'m9-vault', deps:['m5-company-model','m9-cashflow'], ui:true, title:'Document & obligation vault (/vault)',
    brief:'src/lib/vault + a /vault route: read-only registry of family-office documents (subscription agreements, side letters, insurance, trust deeds, LPAs) as metadata linked to entities, with an offline obligation extractor (parse key dates/amounts from fixture document text). Vitest asserts exact parsed obligations + Playwright e2e+screenshot.' },
  { id:'m9-risk-limits', deps:['m8-lookthrough','m0-risk','m9-ips'], ui:true, title:'Risk-limits cockpit (/risk)',
    brief:'A /risk route composing look-through exposure, risk metrics, liquidity tiers, and IPS limits into one cross-asset risk cockpit (true concentration + limit breaches). Vitest asserts aggregated look-through concentration vs limits + Playwright e2e+screenshot.' },
  { id:'m9-hardening', deps:['m0-app'], ui:true, title:'Robustness hardening (QA gaps)',
    brief:'Address gen-2 QA gaps: (1) an app-level React error boundary around the route switch so one page render error cannot blank the whole app; (2) route-level code-splitting (React.lazy + Suspense) to break the >500kB single JS chunk; (3) an offline cache + rate-limit guard around the Alpha Vantage fetch in convex/equities.ts. Deterministic/offline tests. Vitest (boundary catches a thrown child; lazy routes render) + Playwright e2e.' }
]

const unitIds = new Set(UNITS.map(u => u.id))
const phaseFor = () => 'm9 build'

const BUILD_SCHEMA = { type:'object', additionalProperties:false, properties:{ ok:{type:'boolean'}, pr:{type:'string'}, branch:{type:'string'}, notes:{type:'string'} }, required:['ok','branch'] }
const MERGE_SCHEMA = { type:'object', additionalProperties:false, properties:{ merged:{type:'boolean'}, pr:{type:'string'}, blocked:{type:'boolean'}, note:{type:'string'} }, required:['merged'] }

const idemBuild = (u) => 'IDEMPOTENT RESUME GUARD: first run gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If already MERGED, return {ok:true, pr:<url>, branch:"feat/' + u.id + '", notes:"already merged"} immediately. If an OPEN PR exists, reuse that branch/PR.'
const idemReview = (u) => 'IDEMPOTENT RESUME GUARD: first run gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If already MERGED, return {merged:true, pr:<url>, blocked:false, note:"already merged"} immediately.'
const visualBuild = (u) => 'VISUAL QA (REQUIRED — UI unit): the Playwright e2e MUST click through the workflow, type realistic data, exercise navigation, AND capture screenshots at BOTH desktop (1280x800) and mobile (390x844) AND record a trace. Save under e2e/evidence/' + u.id + '/ and COMMIT them. Then use the Read tool to VIEW each screenshot with vision and judge like a human (rendered? laid out? charts drawn? not blank/clipped/overflowing? readable on mobile?). Fix the UI until correct. Link screenshot paths + vision verdict in the PR body.'
const visualReview = (u) => 'VISUAL QA GATE (UI unit): confirm desktop (1280x800) + mobile (390x844) screenshots + trace exist under e2e/evidence/' + u.id + '/. Use the Read tool to VIEW each with vision and judge like a human. If missing or the vision check fails, do NOT merge. Merge a UI PR ONLY IF the vision check passes AND screenshots look correct, in addition to green CI.'

const botNote = 'NOTE: CodeRabbit and Greptile are near/at their free-trial limits. If a bot posts a billing/quota/trial-limit notice instead of a real review (or its status check just passes with no inline comments), treat that as NON-BLOCKING and rely on green CI + your own independent adversarial review + the visual-QA gate to decide the merge. Still fix any real inline comment a bot does post.'

const buildPrompt = (u) => {
  const lines = [
    'You are the BUILDER for unit ' + u.id + ': ' + u.title + '.', u.brief, CONV, idemBuild(u),
    'Steps in your isolated worktree:',
    '1) export PATH; git fetch origin; git checkout -B feat/' + u.id + ' origin/main; bun install.',
    '2) Implement the feature AND thorough tests (oracle rule). UI: add a Vitest component test AND a Playwright e2e/visual test.',
    '3) Ensure ALL pass: bun run typecheck && bun run lint && bun run test && bun run build (UI: also bun run test:e2e).'
  ]
  if (u.ui) lines.push(visualBuild(u))
  lines.push(
    '4) git add -A; git commit -m "' + u.id + ': ' + u.title + '"; git push -u origin feat/' + u.id + '.',
    '5) gh pr create --base main --head feat/' + u.id + ' --title "' + u.id + ': ' + u.title + '" --body "<what + how tested' + (u.ui ? ' + screenshot paths + vision verdict' : '') + '>".',
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
    '3) Wait for external review: gh pr checks <pr> --watch --interval 20 (bounded). Read CodeRabbit + Greptile via gh api. Address EVERY real blocking inline comment; push fixes; up to 3 rounds. ' + botNote,
    '4) Confirm CI green: gh pr checks <pr>. If behind main: git fetch origin; git rebase origin/main (resolve nav/route conflicts in src/App.tsx and src/Dashboard.tsx by KEEPING ALL routes/entries from both sides); git push --force-with-lease.',
    '5) MERGE ONLY IF CI green' + (u.ui ? ', the visual-QA vision check passes,' : '') + ' and no unresolved BLOCKING comments: gh pr merge <pr> --squash --delete-branch. If behind, re-fetch/rebase/push/retry once.',
    '6) NEVER merge red' + (u.ui ? ' or a UI PR whose screenshots look wrong/missing' : '') + '. If it cannot go green after 3 rounds, leave the PR open and return merged=false, blocked=true with reason.',
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
log('Gen-3: ' + waves.length + ' waves over ' + UNITS.length + ' units.')

const merged = new Set()
const results = []
for (let i = 0; i < waves.length; i++) {
  const wave = waves[i]
  const ready = wave.filter(u => u.deps.every(d => merged.has(d) || !unitIds.has(d)))
  const skipped = wave.filter(u => !ready.includes(u))
  skipped.forEach(u => results.push({ unit:u.id, merged:false, blocked:true, note:'gen-3 dependency not merged' }))
  log('Wave ' + (i+1) + '/' + waves.length + ': ' + ready.map(u=>u.id).join(', ') + (skipped.length ? ' | skipped: ' + skipped.map(u=>u.id).join(',') : ''))
  const wr = await parallel(ready.map(u => () => buildUnit(u)))
  wr.filter(Boolean).forEach(r => { results.push(r); if (r.merged) merged.add(r.unit) })
}
const mergedList = [...merged]
log('Gen-3 build complete: ' + mergedList.length + '/' + UNITS.length + ' merged.')

phase('QA')
const QA_SCHEMA = { type:'object', additionalProperties:false, properties:{ healthy:{type:'boolean'}, suite:{type:'string'}, findings:{type:'array',items:{type:'string'}}, gaps:{type:'array',items:{type:'string'}} }, required:['healthy','findings'] }
const qa = await agent([
  'You are the QA/audit lead for ' + OWNER + ' (repo ' + REPO + ').', CONV,
  'In your worktree: git fetch origin; git checkout -B qa-gen3 origin/main; bun install. Run the FULL suite: typecheck, lint, test, build, and (best-effort) test:e2e.',
  'Holistically review the merged app (gen-1+2+3): code quality, security (no secret leaks; read-only), test-coverage gaps, whether the new /reports, /vault, /risk pages render (build then preview; screenshot), and whether the gen-2 hardening gaps (error boundary, code-splitting) are resolved.',
  'Do NOT modify code. Return {healthy, suite, findings:[...], gaps:[...]}.'
].join('\n'), { label:'qa-audit', phase:'QA', isolation:'worktree', effort:'high', schema:QA_SCHEMA })

phase('Live QA sweep')
const SWEEP_SCHEMA = { type:'object', additionalProperties:false, properties:{ ran:{type:'boolean'}, skipped:{type:'boolean'}, reason:{type:'string'}, flows:{type:'array',items:{type:'string'}}, findings:{type:'array',items:{type:'string'}}, screenshots:{type:'array',items:{type:'string'}} }, required:['ran'] }
const sweep = await agent([
  'You are the end-of-generation SERIALIZED LIVE QA SWEEP (only agent now; shared screen is safe).', CONV,
  'STEP 1 (availability): check whether Computer Use MCP and/or Claude-in-Chrome MCP are connected and a screen is usable (ToolSearch "computer-use" and "Claude_in_Chrome"). Computer Use may need request_access (unavailable unattended).',
  'IF NEITHER usable: return {ran:false, skipped:true, reason:"computer-use/Chrome MCP not connected or no screen"}. Do NOT fail.',
  'IF available: in a clean worktree off origin/main, bun install; bun run build; start bun run preview in background; walk the app like a real user across the main flows incl. the new /reports, /vault, /risk at desktop + mobile, capturing screenshots and judging with vision.',
  'Return {ran, skipped, reason, flows:[...], findings:[...], screenshots:[...]}.'
].join('\n'), { label:'live-qa-sweep', phase:'Live QA sweep', isolation:'worktree', effort:'high', schema:SWEEP_SCHEMA })

phase('Ideation')
const IDEAS_SCHEMA = { type:'object', additionalProperties:false, properties:{ rationale:{type:'string'}, nextUnits:{ type:'array', items:{ type:'object', additionalProperties:false, properties:{ id:{type:'string'}, title:{type:'string'}, brief:{type:'string'}, deps:{type:'array',items:{type:'string'}}, oracle:{type:'string'} }, required:['id','title','brief','deps','oracle'] } } }, required:['nextUnits','rationale'] }
const ideas = await agent([
  'You are the PM / ideation lead for family-office-os.', CONV,
  'Review the built product (AGENTS.md, harness/state, merged code on main). QA: ' + JSON.stringify(qa || {}).slice(0,1500) + '. Sweep: ' + JSON.stringify(sweep || {}).slice(0,500) + '.',
  'Propose the NEXT generation (gen-4) of high-value features (depth over shallow breadth). For each: id (m10-xxx), title, build brief, deps (ids), machine-checkable oracle. Do NOT build them.',
  'Return {nextUnits:[...], rationale}.'
].join('\n'), { label:'ideation-pm', phase:'Ideation', isolation:'worktree', effort:'high', schema:IDEAS_SCHEMA })

return { generation:3, mergedCount: mergedList.length, total: UNITS.length, merged: mergedList, results, qa, sweep, ideas }
