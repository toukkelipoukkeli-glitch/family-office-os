export const meta = {
  name: 'family-office-os-build-gen1',
  description: 'Unified autonomous build of family-office-os (m0-m6): builder + reviewer per unit in dependency waves, human-style visual QA on UI units, QA + serialized live sweep + ideation',
  phases: [
    { title: 'm0 spine' }, { title: 'm1 data' }, { title: 'm2 valuations' },
    { title: 'm3 scenario' }, { title: 'm4 ops' }, { title: 'm5 company' },
    { title: 'm6 dealflow' }, { title: 'QA' }, { title: 'Live QA sweep' }, { title: 'Ideation' }
  ]
}

const REPO = '/Users/touko/Ambition'
const OWNER = 'toukkelipoukkeli-glitch/family-office-os'

const CONV = [
  'Repo: ' + REPO + ' (family-office-os). Read AGENTS.md and harness/RUNBOOK.md first.',
  'Bun: start EVERY bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  'Product is READ-ONLY: never write code that moves money or places trades; never SEND email.',
  'Tests MUST be deterministic and offline — use fixtures, never hit live APIs in tests.',
  'If a file harness/HALT exists at the repo root, STOP immediately and return without acting.',
  'Do not modify .env contents, .claude/, harness/state, or unrelated units files.'
].join(' ')

// ui:true => the unit changes the UI and must pass the human-style visual-QA gate.
const UNITS = [
  { id:'m0-money', deps:[], title:'Decimal money type + currency utils',
    brief:'Create src/lib/money.ts: immutable Money (currency + decimal.js amount): of/zero, plus/minus (same-currency guard), times, allocate (no lost minor units), compare/equals, format. Thorough vitest tests.' },
  { id:'m0-model', deps:['m0-money'], title:'Portfolio data model + Zod schemas',
    brief:'src/lib/model: Zod schemas + types for AssetClass (equity, bond, etf, cash, crypto, forest, wine, art, lego, car, vineyard, pe, watch), Holding, Lot, Portfolio, Valuation (with confidence). Validation tests.' },
  { id:'m0-fixtures', deps:['m0-model'], title:'Diverse seeded fixture portfolio',
    brief:'src/fixtures: a realistic diverse portfolio across all asset classes as typed fixtures. Test that every fixture parses against the model schemas.' },
  { id:'m0-returns', deps:['m0-model'], title:'Returns engine: TWR, MWR, XIRR',
    brief:'src/lib/returns: time-weighted return, money-weighted return, XIRR over cashflow+valuation series. Known-answer unit tests.' },
  { id:'m0-alloc', deps:['m0-model'], title:'Allocation + rebalancing drift',
    brief:'src/lib/allocation: allocation breakdown by asset class & currency, rebalancing drift vs target weights. Unit tests.' },
  { id:'m0-risk', deps:['m0-returns'], title:'Risk metrics',
    brief:'src/lib/risk: volatility, max drawdown, Sharpe, Sortino, correlation matrix from return series. Known-value unit tests.' },
  { id:'m0-charts', deps:[], ui:true, title:'Reusable charting kit',
    brief:'src/components/charts: reusable themed chart components (line, area, bar, donut, treemap, candlestick, sparkline). Add recharts dep or use SVG. Vitest render tests + a Playwright visual check + a demo/gallery route to exercise them.' },
  { id:'m0-networth', deps:['m0-returns','m0-charts','m0-fixtures'], ui:true, title:'Net-worth dashboard with drill-down',
    brief:'Net-worth-over-time dashboard page using the charting kit + fixtures + returns, drill-down by asset class. Make it the main view. Playwright e2e + screenshot.' },

  { id:'m1-convex', deps:['m0-model'], title:'Convex backend (schema + queries)',
    brief:'Provision Convex cloud (logged in; team touko-ursin): bunx convex dev --once --configure new --team touko-ursin --project family-office-os --dev-deployment cloud. Define convex/schema.ts + queries/mutations for holdings & valuations mirroring the model. Add a Convex provider to the app. Keep .env.local gitignored. Tests where feasible.' },
  { id:'m1-equities', deps:['m1-convex'], title:'Equities/ETF adapter (Alpha Vantage)',
    brief:'Equities/ETF price adapter via Alpha Vantage (ALPHAVANTAGE_API_KEY, used server-side from a Convex action). Record a sample response as a fixture; parse + test OFFLINE.' },
  { id:'m1-fx', deps:['m1-convex'], title:'FX adapter + multi-currency',
    brief:'FX adapter via frankfurter.dev + normalize to a base currency. Fixture-tested offline.' },
  { id:'m1-crypto', deps:['m1-convex'], title:'Crypto adapter (CoinGecko)',
    brief:'Crypto price adapter via CoinGecko (keyless). Fixture-tested offline.' },
  { id:'m1-macro', deps:['m1-convex'], title:'Macro adapter (FRED)',
    brief:'Macro adapter via FRED (FRED_API_KEY): rates (DGS10), CPI. Fixture-tested offline.' },
  { id:'m1-weather', deps:['m1-convex'], title:'Weather/world adapter',
    brief:'Adapter for Open-Meteo (weather) + World Bank (world data), keyless. Fixture-tested offline.' },

  { id:'m2-forest', deps:['m1-weather'], title:'Forest valuation',
    brief:'Forest/timber valuation: biological growth model + timber price index + drought/weather coupling, documented confidence band. Unit tests.' },
  { id:'m2-wine', deps:['m1-convex'], title:'Wine valuation',
    brief:'Fine-wine valuation: index (Liv-ex-style) + provenance + confidence band. Unit tests.' },
  { id:'m2-art', deps:['m1-convex'], title:'Art valuation',
    brief:'Art valuation: appraisal model + confidence band (honest about uncertainty). Unit tests.' },
  { id:'m2-lego', deps:['m1-convex'], title:'LEGO valuation',
    brief:'LEGO set valuation: secondary-market price-guide model. Unit tests.' },
  { id:'m2-cars', deps:['m1-convex'], title:'Classic car valuation',
    brief:'Classic car valuation model + confidence band. Unit tests.' },

  { id:'m3-corr', deps:['m0-risk'], title:'Correlation matrix + assumptions',
    brief:'src/lib/scenario/correlation: cross-asset correlation matrix with documented assumptions. Tests (symmetry, PSD check).' },
  { id:'m3-mc', deps:['m3-corr'], title:'Monte Carlo net-worth simulator',
    brief:'src/lib/scenario/montecarlo: simulate total net worth across correlated assets (SEEDED RNG for determinism). Tests on distribution stats with a fixed seed.' },
  { id:'m3-scenarios', deps:['m3-mc'], title:'Named scenario builder',
    brief:'Named scenarios (rate shock, FX move, drought, market correction) applied to the MC engine. Unit tests.' },
  { id:'m3-liquidity', deps:['m3-mc'], title:'Liquidity / capital-call coverage',
    brief:'Liquidity analysis: cover a capital call without selling illiquids? Unit tests.' },
  { id:'m3-viz', deps:['m3-scenarios','m0-charts'], ui:true, title:'Scenario cockpit visualization',
    brief:'Scenario cockpit page: fan charts, tornado, waterfall, driven by the scenario engine. Playwright e2e + screenshot.' },

  { id:'m4-ops', deps:[], ui:true, title:'/ops cockpit page',
    brief:'An /ops page rendering harness/state (backlog, tasks, merged, blocked) + build progress. Playwright e2e.' },

  { id:'m5-company-model', deps:['m0-model'], title:'Company/ownership model',
    brief:'src/lib/company: Zod schemas for Company, Subsidiary, OwnershipStake, Person. Validation tests.' },
  { id:'m5-orgchart', deps:['m5-company-model','m0-charts'], ui:true, title:'Org-hierarchy / subsidiary tree',
    brief:'Org-hierarchy + subsidiary tree visualization. Playwright e2e + screenshot.' },
  { id:'m5-captable', deps:['m5-company-model'], ui:true, title:'Cap table',
    brief:'Cap table + ownership-stake breakdown with dilution math, rendered as a view. Unit tests + Playwright e2e.' },
  { id:'m5-ownership-graph', deps:['m5-company-model','m0-charts'], ui:true, title:'Ownership network graph',
    brief:'Cross-holding ownership network graph. Playwright e2e + screenshot.' },
  { id:'m5-company-profile', deps:['m5-company-model'], ui:true, title:'Company profile cards',
    brief:'Company profile cards (financials, holdings, people). Component + e2e.' },

  { id:'m6-deal-model', deps:['m0-model'], title:'Deal/pipeline model',
    brief:'src/lib/deals: Zod schemas for Deal, PipelineStage, Contact, Interaction. Validation tests.' },
  { id:'m6-pipeline', deps:['m6-deal-model'], ui:true, title:'Deal pipeline board',
    brief:'VC deal pipeline board (stages, status, drill-down) on fixtures. Playwright e2e.' },
  { id:'m6-email-ingest', deps:['m6-deal-model'], title:'Gmail deal-email parser (read-only)',
    brief:'A deal-email PARSER turning raw email text into structured deal/contact data. Build + test against FIXTURE emails only (never hit live Gmail). Read-only.' },
  { id:'m6-calendar-sync', deps:['m6-deal-model'], title:'Calendar meeting sync',
    brief:'Map calendar events into a deal timeline. Build + test against FIXTURE events only. Read-only.' },
  { id:'m6-relationship-graph', deps:['m6-deal-model','m0-charts'], ui:true, title:'Relationship graph',
    brief:'Founder/investor relationship graph on fixtures. Playwright e2e + screenshot.' }
]

const PHASES = { m0:'m0 spine', m1:'m1 data', m2:'m2 valuations', m3:'m3 scenario', m4:'m4 ops', m5:'m5 company', m6:'m6 dealflow' }
const phaseFor = (id) => PHASES[id.split('-')[0]] || 'm0 spine'

const BUILD_SCHEMA = { type:'object', additionalProperties:false,
  properties:{ ok:{type:'boolean'}, pr:{type:'string'}, branch:{type:'string'}, notes:{type:'string'} },
  required:['ok','branch'] }
const MERGE_SCHEMA = { type:'object', additionalProperties:false,
  properties:{ merged:{type:'boolean'}, pr:{type:'string'}, blocked:{type:'boolean'}, note:{type:'string'} },
  required:['merged'] }

const idemBuild = (u) => 'IDEMPOTENT RESUME GUARD: first run: gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If a PR for this unit is already MERGED, do NOT rebuild — return {ok:true, pr:<url>, branch:"feat/' + u.id + '", notes:"already merged"} immediately. If an OPEN PR already exists, reuse that branch/PR (do not open a duplicate).'
const idemReview = (u) => 'IDEMPOTENT RESUME GUARD: first run: gh pr list --head feat/' + u.id + ' --state all --json number,state,url. If the PR is already MERGED, return {merged:true, pr:<url>, blocked:false, note:"already merged"} immediately and do nothing else.'

const visualBuild = (u) => 'VISUAL QA (REQUIRED — this is a UI unit): the Playwright e2e MUST click through the core workflow, type realistic data, and exercise navigation, AND capture screenshots at BOTH a desktop viewport (1280x800) and a mobile viewport (390x844), AND record a Playwright trace (trace:"on"). Save screenshots under e2e/evidence/' + u.id + '/ and COMMIT them so they appear in the PR. Then use the Read tool to VIEW each screenshot PNG with your own vision and judge it like a human: actually rendered? laid out? charts drawn? nothing blank/clipped/overflowing? readable on mobile? If anything looks wrong, FIX the UI and re-capture until correct. In the PR body, link the screenshot paths and state your vision verdict.'
const visualReview = (u) => 'VISUAL QA GATE (this is a UI unit): confirm the PR captured desktop (1280x800) + mobile (390x844) screenshots + a trace (under e2e/evidence/' + u.id + '/). Use the Read tool to VIEW each screenshot PNG with your own vision and judge like a human (rendered? laid out? charts drawn? not blank/clipped/overflowing? readable on mobile?). If screenshots are missing or the vision check fails, do NOT merge — push fixes or block. A UI PR may merge ONLY IF the vision check passes AND the screenshots look correct, in ADDITION to green CI + clean CodeRabbit/Greptile review.'

const buildPrompt = (u) => {
  const lines = [
    'You are the BUILDER for unit ' + u.id + ': ' + u.title + '.',
    u.brief,
    CONV,
    idemBuild(u),
    'Steps in your isolated worktree:',
    '1) export PATH; git fetch origin; git checkout -B feat/' + u.id + ' origin/main; bun install.',
    '2) Implement the feature AND thorough tests (oracle rule: every unit needs machine-checkable tests). For UI units add a Vitest component test AND a Playwright e2e/visual test.',
    '3) Ensure ALL pass: bun run typecheck && bun run lint && bun run test && bun run build (UI: also bun run test:e2e).'
  ]
  if (u.ui) lines.push(visualBuild(u))
  lines.push(
    '4) git add -A; git commit -m "' + u.id + ': ' + u.title + '"; git push -u origin feat/' + u.id + '.',
    '5) gh pr create --base main --head feat/' + u.id + ' --title "' + u.id + ': ' + u.title + '" --body "<what you built + how it is tested' + (u.ui ? ' + committed screenshot paths + vision verdict' : '') + '>".',
    'Return {ok, pr, branch:"feat/' + u.id + '", notes}. ok=true only if all checks passed and the PR opened. If stuck, set ok=false but still push + open the PR and explain in notes.'
  )
  return lines.join('\n')
}

const reviewPrompt = (u) => {
  const lines = [
    'You are the INDEPENDENT TESTER + REVIEWER + MERGER for unit ' + u.id + ' on branch feat/' + u.id + '.',
    'Find the PR: gh pr list --head feat/' + u.id + ' --json number,url. Repo: ' + OWNER + '.',
    CONV,
    idemReview(u),
    'Steps in your isolated worktree:',
    '1) export PATH; git fetch origin; git checkout feat/' + u.id + '; bun install.',
    '2) Independently verify: bun run typecheck && bun run lint && bun run test && bun run build. Adversarially add edge-case tests; fix any real bugs and push.'
  ]
  if (u.ui) lines.push(visualReview(u))
  lines.push(
    '3) Wait for external review: gh pr checks <pr> --watch --interval 20 (bounded; if it does not settle in a few minutes, proceed). Read CodeRabbit + Greptile: gh api repos/' + OWNER + '/issues/<pr>/comments , .../pulls/<pr>/comments , .../pulls/<pr>/reviews. Address EVERY actionable/blocking comment; push fixes; repeat up to 3 rounds until both bots pass with no unresolved blocking items.',
    '4) Confirm CI green: gh pr checks <pr>. If behind main: git fetch origin; git rebase origin/main (resolve conflicts); git push --force-with-lease.',
    '5) MERGE ONLY IF CI green' + (u.ui ? ', the visual-QA vision check passes,' : '') + ' and no unresolved BLOCKING comments (non-blocking nits may be deferred): gh pr merge <pr> --squash --delete-branch. If merge fails because main moved, re-fetch, rebase, push, retry once.',
    '6) NEVER merge red' + (u.ui ? ', and never merge a UI PR whose screenshots look wrong or are missing' : '') + '. If after 3 rounds it cannot go green, leave the PR open and return merged=false, blocked=true with the reason.',
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

// dependency waves (Kahn)
const waves = []
const done = new Set()
let remaining = UNITS.slice()
while (remaining.length) {
  const wave = remaining.filter(u => u.deps.every(d => done.has(d)))
  if (!wave.length) { log('Unresolvable deps (cycle?) for: ' + remaining.map(u=>u.id).join(',')); break }
  waves.push(wave)
  wave.forEach(u => done.add(u.id))
  remaining = remaining.filter(u => !done.has(u.id))
}
log('Planned ' + waves.length + ' dependency waves over ' + UNITS.length + ' units.')

const merged = new Set()
const results = []
for (let i = 0; i < waves.length; i++) {
  const wave = waves[i]
  const ready = wave.filter(u => u.deps.every(d => merged.has(d)))
  const skipped = wave.filter(u => !u.deps.every(d => merged.has(d)))
  skipped.forEach(u => results.push({ unit:u.id, merged:false, blocked:true, note:'dependency not merged' }))
  log('Wave ' + (i+1) + '/' + waves.length + ': ' + ready.map(u=>u.id).join(', ') + (skipped.length ? ' | skipped: ' + skipped.map(u=>u.id).join(',') : ''))
  const waveResults = await parallel(ready.map(u => () => buildUnit(u)))
  waveResults.filter(Boolean).forEach(r => { results.push(r); if (r.merged) merged.add(r.unit) })
}

const mergedList = [...merged]
log('Build complete: ' + mergedList.length + '/' + UNITS.length + ' units merged.')

phase('QA')
const QA_SCHEMA = { type:'object', additionalProperties:false,
  properties:{ healthy:{type:'boolean'}, suite:{type:'string'}, findings:{type:'array',items:{type:'string'}}, gaps:{type:'array',items:{type:'string'}} },
  required:['healthy','findings'] }
const qa = await agent([
  'You are the QA/audit lead for ' + OWNER + ' (repo ' + REPO + ').',
  CONV,
  'On main: git checkout main; git pull --ff-only; bun install. Run the FULL suite: bun run typecheck, lint, test, build, and (best-effort) test:e2e.',
  'Then holistically review the merged app: code quality, security (no secret leaks; read-only safety), test-coverage gaps, and whether the key dashboard pages actually render (bun run build then bun run preview, or dev; screenshot if possible).',
  'Do NOT modify code. Return {healthy, suite, findings:[...], gaps:[...]}.'
].join('\n'), { label:'qa-audit', phase:'QA', effort:'high', schema:QA_SCHEMA })

// End-of-generation SERIALIZED live QA sweep — real Computer Use / signed-in Chrome,
// one agent only (the shared screen can't be parallelized). Optional: skip + log if disconnected.
phase('Live QA sweep')
const SWEEP_SCHEMA = { type:'object', additionalProperties:false,
  properties:{ ran:{type:'boolean'}, skipped:{type:'boolean'}, reason:{type:'string'}, flows:{type:'array',items:{type:'string'}}, findings:{type:'array',items:{type:'string'}}, screenshots:{type:'array',items:{type:'string'}} },
  required:['ran'] }
const sweep = await agent([
  'You are the end-of-generation LIVE QA SWEEP for family-office-os. This step is SERIALIZED — you are the only agent now, so using the single shared screen is safe.',
  CONV,
  'STEP 1 (availability): determine whether the real Computer Use MCP and/or the Claude-in-Chrome MCP are connected and a screen is usable. Use ToolSearch (queries like "computer-use" and "Claude_in_Chrome"); note Computer Use may need user approval (request_access) that is unavailable while unattended.',
  'IF NEITHER is available/usable: SKIP — return {ran:false, skipped:true, reason:"computer-use / Claude-in-Chrome MCP not connected or no screen available"}. Do NOT fail the generation.',
  'IF available: serve the app — export PATH; git checkout main; git pull --ff-only; bun install; bun run build; then start a preview server (bun run preview) in the background on its port. Walk the app like a real signed-in user across the MAIN flows: net-worth dashboard, scenario cockpit, company org charts, deal pipeline — at BOTH desktop and mobile sizes — capturing screenshots and judging them with your vision.',
  'Return {ran:true, skipped:false, flows:[...visited...], findings:[...visual issues...], screenshots:[...paths...]}.'
].join('\n'), { label:'live-qa-sweep', phase:'Live QA sweep', effort:'high', schema:SWEEP_SCHEMA })

phase('Ideation')
const IDEAS_SCHEMA = { type:'object', additionalProperties:false,
  properties:{ rationale:{type:'string'},
    nextUnits:{ type:'array', items:{ type:'object', additionalProperties:false,
      properties:{ id:{type:'string'}, title:{type:'string'}, brief:{type:'string'}, deps:{type:'array',items:{type:'string'}}, oracle:{type:'string'} },
      required:['id','title','brief','deps','oracle'] } } },
  required:['nextUnits','rationale'] }
const ideas = await agent([
  'You are the PM / ideation lead for family-office-os (a world-class read-only family-office OS).',
  CONV,
  'Review the built product: read AGENTS.md, harness/state/backlog.json, and the merged code on main. QA findings: ' + JSON.stringify(qa || {}) + '. Live sweep: ' + JSON.stringify(sweep || {}) + '.',
  'Propose the NEXT generation of high-value features (depth over shallow breadth) that a top family office would want. For each: id (e.g. m7-xxx), title, a concrete build brief, deps (ids), and a machine-checkable oracle. Do NOT build them now.',
  'Return {nextUnits:[...], rationale}.'
].join('\n'), { label:'ideation-pm', phase:'Ideation', effort:'high', schema:IDEAS_SCHEMA })

return { generation:1, mergedCount: mergedList.length, total: UNITS.length, merged: mergedList, results, qa, sweep, ideas }
