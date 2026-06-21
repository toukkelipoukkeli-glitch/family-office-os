export const meta = {
  name: 'family-office-os-build-gen2',
  description: 'Gen-2 autonomous build of family-office-os: depth features (tax/attribution/fees/cashflow/alerts/lookthrough/estate/reporting) + /ops live fix, builder+reviewer per unit, visual QA, QA + sweep + gen-3 ideation',
  phases: [ { title: 'm7 depth' }, { title: 'm8 advanced' }, { title: 'QA' }, { title: 'Live QA sweep' }, { title: 'Ideation' } ]
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
  'Gen-1 (35 units: m0-m6) is already merged on main — build on top of it.'
].join(' ')

// All gen-2 units are user-facing decision surfaces => ui:true (visual-QA gated).
const UNITS = [
  { id:'m7-tax-lots', deps:['m0-model','m0-money','m1-fx','m0-app'], ui:true, title:'Tax lot engine',
    brief:'Realized/unrealized gains per lot, holding-period (short/long), and lot-selection methods (FIFO/LIFO/HIFO/spec-id). Pure exact-decimal engine + a lot-explorer view. Unit tests for each method + Playwright e2e.' },
  { id:'m7-harvest', deps:['m7-tax-lots'], ui:true, title:'Tax-loss-harvesting finder',
    brief:'Find tax-loss-harvesting candidates with wash-sale (30-day) flagging, surfaced in a view. Deterministic unit tests on fixtures + Playwright e2e.' },
  { id:'m7-attribution', deps:['m0-returns','m0-risk','m0-charts','m0-app'], ui:true, title:'Performance attribution',
    brief:'Performance attribution + benchmark-relative analytics (allocation vs selection effect, active return). Engine + charted view. Known-answer unit tests + e2e.' },
  { id:'m7-fees', deps:['m0-model','m0-money','m0-returns','m0-charts','m0-app'], ui:true, title:'Fee & TCO transparency',
    brief:'Fee & total-cost-of-ownership engine (mgmt/perf/carry/fund expenses), fee drag on returns, charted. Unit tests + e2e.' },
  { id:'m7-cashflow', deps:['m3-liquidity','m0-charts','m0-money','m0-app'], ui:true, title:'Cashflow & liquidity runway',
    brief:'Multi-period cashflow + liquidity runway forecast (commitments, distributions, expenses), charted runway view. Unit tests + e2e.' },
  { id:'m7-alerts', deps:['m0-alloc','m0-model','m0-app'], ui:true, title:'Concentration & limit alerts',
    brief:'Concentration & limit-breach alert engine (per asset class / position / currency thresholds) surfaced on the dashboard. Unit tests + e2e.' },
  { id:'m7-ops-live', deps:['m4-ops','m0-app'], ui:true, title:'Wire /ops to live state',
    brief:'Fix the QA-flagged gap: wire the /ops cockpit to live harness/state (backlog/tasks JSON) instead of stale static fixture data, so build progress reflects reality. Keep it deterministic/testable (load committed state). Unit tests + e2e.' },
  { id:'m8-lookthrough', deps:['m5-company-model','m5-ownership-graph','m0-money','m0-charts','m0-app'], ui:true, title:'Cross-entity look-through',
    brief:'Cross-entity consolidation + look-through exposure roll-up (see true underlying exposure through ownership stakes). Engine + charted view. Unit tests + e2e.' },
  { id:'m8-estate', deps:['m8-lookthrough','m0-money','m0-charts','m0-app'], ui:true, title:'Estate & succession planning',
    brief:'Estate & succession planning model (entity flow + liquidity-at-death analysis). Engine + view. Unit tests + e2e.' },
  { id:'m8-reporting', deps:['m7-attribution','m7-fees','m7-cashflow','m7-alerts','m8-lookthrough','m0-app'], ui:true, title:'Board-grade reporting / export',
    brief:'Board-grade reporting & client-ready export layer (printable/exportable report composed from attribution, fees, cashflow, alerts, look-through). View + export. Unit tests + e2e.' }
]

const unitIds = new Set(UNITS.map(u => u.id))
const PHASES = { m7:'m7 depth', m8:'m8 advanced' }
const phaseFor = (id) => PHASES[id.split('-')[0]] || 'm7 depth'

const BUILD_SCHEMA = { type:'object', additionalProperties:false, properties:{ ok:{type:'boolean'}, pr:{type:'string'}, branch:{type:'string'}, notes:{type:'string'} }, required:['ok','branch'] }
const MERGE_SCHEMA = { type:'object', additionalProperties:false, properties:{ merged:{type:'boolean'}, pr:{type:'string'}, blocked:{type:'boolean'}, note:{type:'string'} }, required:['merged'] }

const idemBuild = (u) => 'IDEMPOTENT RESUME GUARD: first run: gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If a PR for this unit is already MERGED, do NOT rebuild — return {ok:true, pr:<url>, branch:"feat/' + u.id + '", notes:"already merged"} immediately. If an OPEN PR already exists, reuse that branch/PR.'
const idemReview = (u) => 'IDEMPOTENT RESUME GUARD: first run: gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If the PR is already MERGED, return {merged:true, pr:<url>, blocked:false, note:"already merged"} immediately.'
const visualBuild = (u) => 'VISUAL QA (REQUIRED — UI unit): the Playwright e2e MUST click through the workflow, type realistic data, and exercise navigation, AND capture screenshots at BOTH desktop (1280x800) and mobile (390x844) AND record a trace. Save screenshots under e2e/evidence/' + u.id + '/ and COMMIT them. Then use the Read tool to VIEW each screenshot PNG with your vision and judge like a human (rendered? laid out? charts drawn? not blank/clipped/overflowing? readable on mobile?). Fix the UI until correct. Link the screenshot paths + your vision verdict in the PR body.'
const visualReview = (u) => 'VISUAL QA GATE (UI unit): confirm desktop (1280x800) + mobile (390x844) screenshots + trace exist under e2e/evidence/' + u.id + '/. Use the Read tool to VIEW each screenshot with your vision and judge like a human. If missing or the vision check fails, do NOT merge. A UI PR merges ONLY IF the vision check passes AND screenshots look correct, in addition to green CI + clean bot review.'

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
    '3) Wait for external review: gh pr checks <pr> --watch --interval 20 (bounded). Read CodeRabbit + Greptile: gh api repos/' + OWNER + '/issues/<pr>/comments , .../pulls/<pr>/comments , .../pulls/<pr>/reviews. Address EVERY blocking comment; push fixes; up to 3 rounds.',
    '4) Confirm CI green: gh pr checks <pr>. If behind main: git fetch origin; git rebase origin/main; git push --force-with-lease.',
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

// waves: a dep is satisfied if built this gen OR not a gen-2 unit (i.e. already on main)
const waves = []
const done = new Set()
let remaining = UNITS.slice()
while (remaining.length) {
  const wave = remaining.filter(u => u.deps.every(d => done.has(d) || !unitIds.has(d)))
  if (!wave.length) { log('Unresolvable deps for: ' + remaining.map(u=>u.id).join(',')); break }
  waves.push(wave); wave.forEach(u => done.add(u.id)); remaining = remaining.filter(u => !done.has(u.id))
}
log('Gen-2: ' + waves.length + ' waves over ' + UNITS.length + ' units.')

const merged = new Set()
const results = []
for (let i = 0; i < waves.length; i++) {
  const wave = waves[i]
  const ready = wave.filter(u => u.deps.every(d => merged.has(d) || !unitIds.has(d)))
  const skipped = wave.filter(u => !ready.includes(u))
  skipped.forEach(u => results.push({ unit:u.id, merged:false, blocked:true, note:'gen-2 dependency not merged' }))
  log('Wave ' + (i+1) + '/' + waves.length + ': ' + ready.map(u=>u.id).join(', ') + (skipped.length ? ' | skipped: ' + skipped.map(u=>u.id).join(',') : ''))
  const wr = await parallel(ready.map(u => () => buildUnit(u)))
  wr.filter(Boolean).forEach(r => { results.push(r); if (r.merged) merged.add(r.unit) })
}
const mergedList = [...merged]
log('Gen-2 build complete: ' + mergedList.length + '/' + UNITS.length + ' merged.')

phase('QA')
const QA_SCHEMA = { type:'object', additionalProperties:false, properties:{ healthy:{type:'boolean'}, suite:{type:'string'}, findings:{type:'array',items:{type:'string'}}, gaps:{type:'array',items:{type:'string'}} }, required:['healthy','findings'] }
const qa = await agent([
  'You are the QA/audit lead for ' + OWNER + ' (repo ' + REPO + ').', CONV,
  'In your worktree: git fetch origin; git checkout -B qa-gen2 origin/main; bun install. Run the FULL suite: typecheck, lint, test, build, and (best-effort) test:e2e.',
  'Holistically review the merged app (gen-1 + gen-2): code quality, security (no secret leaks; read-only), test-coverage gaps, and whether the new decision-surface pages render (build then preview; screenshot).',
  'Do NOT modify code. Return {healthy, suite, findings:[...], gaps:[...]}.'
].join('\n'), { label:'qa-audit', phase:'QA', isolation:'worktree', effort:'high', schema:QA_SCHEMA })

phase('Live QA sweep')
const SWEEP_SCHEMA = { type:'object', additionalProperties:false, properties:{ ran:{type:'boolean'}, skipped:{type:'boolean'}, reason:{type:'string'}, flows:{type:'array',items:{type:'string'}}, findings:{type:'array',items:{type:'string'}}, screenshots:{type:'array',items:{type:'string'}} }, required:['ran'] }
const sweep = await agent([
  'You are the end-of-generation SERIALIZED LIVE QA SWEEP for family-office-os (only agent now; shared screen is safe).', CONV,
  'STEP 1 (availability): check whether the Computer Use MCP and/or Claude-in-Chrome MCP are connected and a screen is usable (ToolSearch "computer-use" and "Claude_in_Chrome"). Computer Use may need request_access (unavailable unattended).',
  'IF NEITHER usable: return {ran:false, skipped:true, reason:"computer-use/Chrome MCP not connected or no screen"}. Do NOT fail.',
  'IF available: in a clean worktree off origin/main, bun install; bun run build; start bun run preview in the background; walk the app like a real user across the MAIN flows incl. the new ones (net-worth, scenario cockpit, org charts, deal pipeline, tax lots, attribution, cashflow, reporting) at desktop + mobile, capturing screenshots and judging with vision.',
  'Return {ran, skipped, reason, flows:[...], findings:[...], screenshots:[...]}.'
].join('\n'), { label:'live-qa-sweep', phase:'Live QA sweep', isolation:'worktree', effort:'high', schema:SWEEP_SCHEMA })

phase('Ideation')
const IDEAS_SCHEMA = { type:'object', additionalProperties:false, properties:{ rationale:{type:'string'}, nextUnits:{ type:'array', items:{ type:'object', additionalProperties:false, properties:{ id:{type:'string'}, title:{type:'string'}, brief:{type:'string'}, deps:{type:'array',items:{type:'string'}}, oracle:{type:'string'} }, required:['id','title','brief','deps','oracle'] } } }, required:['nextUnits','rationale'] }
const ideas = await agent([
  'You are the PM / ideation lead for family-office-os (a world-class read-only family-office OS).', CONV,
  'Review the built product (read AGENTS.md, harness/state, merged code on main). QA: ' + JSON.stringify(qa || {}).slice(0,1500) + '. Sweep: ' + JSON.stringify(sweep || {}).slice(0,600) + '.',
  'Propose the NEXT generation (gen-3) of high-value features (depth over shallow breadth). For each: id (e.g. m9-xxx), title, build brief, deps (ids), machine-checkable oracle. Do NOT build them.',
  'Return {nextUnits:[...], rationale}.'
].join('\n'), { label:'ideation-pm', phase:'Ideation', isolation:'worktree', effort:'high', schema:IDEAS_SCHEMA })

return { generation:2, mergedCount: mergedList.length, total: UNITS.length, merged: mergedList, results, qa, sweep, ideas }
