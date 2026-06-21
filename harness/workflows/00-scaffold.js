export const meta = {
  name: 'scaffold-phase-a',
  description: 'Scaffold and verify the family-office-os app shell (Phase A)',
  phases: [
    { title: 'Scaffold', detail: 'hand-write Vite+React+TS+Tailwind v4+shadcn+Vitest+Playwright+CI' },
    { title: 'Verify', detail: 'install/typecheck/lint/test/build green; fix-until-green loop' }
  ]
}

const REPO = '/Users/touko/Ambition'

const SCAFFOLD = [
  'You are scaffolding a web app in ' + REPO + ' (a git repo, currently on branch feat/scaffold).',
  'CRITICAL RULES:',
  '- Bun is the runtime. Start EVERY bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  '- Do NOT touch git (no add/commit/push/checkout). Do NOT modify or read .env. Do NOT modify the harness/ dir, .claude/, AGENTS.md, or README.md. Only create the app files listed below.',
  '- Use NO interactive scaffolders (no "bun create", no "shadcn init"). Hand-write every file.',
  '',
  'Build a Vite + React 18 + TypeScript app. Use these dep ranges in package.json:',
  '  dependencies: react ^18.3.1, react-dom ^18.3.1, class-variance-authority ^0.7.0, clsx ^2.1.1, tailwind-merge ^2.5.4, lucide-react ^0.460.0, @radix-ui/react-slot ^1.1.0',
  '  devDependencies: vite ^6.0.0, @vitejs/plugin-react ^4.3.4, typescript ^5.6.3, tailwindcss ^4.0.0, @tailwindcss/vite ^4.0.0, vitest ^2.1.5, @testing-library/react ^16.0.1, @testing-library/jest-dom ^6.6.3, @testing-library/user-event ^14.5.2, jsdom ^25.0.1, @playwright/test ^1.49.0, @types/react ^18.3.12, @types/react-dom ^18.3.1, eslint ^9.15.0, @eslint/js ^9.15.0, typescript-eslint ^8.16.0, eslint-plugin-react-hooks ^5.0.0, eslint-plugin-react-refresh ^0.4.14, globals ^15.12.0',
  '',
  'package.json: type module, private true, name family-office-os. scripts: dev=vite, build=(tsc -b && vite build), preview=vite preview, test=vitest run, test:watch=vitest, typecheck=tsc --noEmit, lint=eslint ., test:e2e=playwright test.',
  '',
  'Files to create:',
  '- index.html: root div #root, module script /src/main.tsx, title Family Office OS.',
  '- tsconfig.json: strict; target ES2022; lib ES2022,DOM,DOM.Iterable; module ESNext; moduleResolution bundler; jsx react-jsx; noEmit; noUnusedLocals; noUnusedParameters; baseUrl "."; paths { "@/*": ["./src/*"] }; types ["vitest/globals","@testing-library/jest-dom"]; include ["src"]; references [{path:./tsconfig.node.json}]. Do NOT include the e2e dir here.',
  '- tsconfig.node.json: composite, include vite.config.ts.',
  '- vite.config.ts: /// reference types vitest/config; import defineConfig from vitest/config; plugins [react(), tailwindcss()]; resolve.alias "@" -> src dir via fileURLToPath(new URL("./src", import.meta.url)); test config { environment:jsdom, globals:true, setupFiles:["./src/test/setup.ts"], include:["src/**/*.{test,spec}.{ts,tsx}"], exclude:["e2e/**","node_modules/**","dist/**"] }.',
  '- src/index.css: Tailwind v4. First line exactly: @import "tailwindcss"; then @custom-variant dark (&:is(.dark *)); define shadcn tokens as CSS vars on :root and .dark (background, foreground, card, card-foreground, popover, popover-foreground, primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground, accent, accent-foreground, destructive, border, input, ring, radius) using oklch values; then a @theme inline block mapping --color-background:var(--background), --color-foreground:var(--foreground), etc., and radius tokens, so utilities bg-background, text-foreground, border-border, rounded-lg work. Apply bg-background text-foreground to body.',
  '- src/lib/utils.ts: export function cn(...inputs) = twMerge(clsx(inputs)).',
  '- src/components/ui/button.tsx: shadcn-style Button with class-variance-authority and @radix-ui/react-slot Slot (asChild). variants default/secondary/outline/ghost/destructive/link, sizes default/sm/lg/icon. Export buttonVariants.',
  '- src/components/ui/card.tsx: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter.',
  '- src/App.tsx: a tasteful app shell — a top header bar with h1 text "Family Office OS", and below it a centered Card (CardTitle "Net worth", a placeholder value, and a Button). Use the ui components + Tailwind.',
  '- src/main.tsx: createRoot(...).render(<StrictMode><App/></StrictMode>); import ./index.css.',
  '- src/test/setup.ts: import "@testing-library/jest-dom".',
  '- src/App.test.tsx: render <App/> via @testing-library/react; expect screen.getByRole("heading", { name: /family office os/i }) to be in the document.',
  '- components.json: shadcn config (style new-york, rsc false, tsx true, tailwind { config "", css "src/index.css", baseColor neutral, cssVariables true }, aliases { components "@/components", utils "@/lib/utils", ui "@/components/ui", lib "@/lib", hooks "@/hooks" }).',
  '- eslint.config.js: ESLint 9 flat config = @eslint/js recommended + typescript-eslint recommended + eslint-plugin-react-hooks + eslint-plugin-react-refresh, applied to **/*.{ts,tsx}, browser + es2022 globals, ignores ["dist","node_modules"]. Make sure the code you write passes it.',
  '- playwright.config.ts: testDir "e2e"; use { baseURL "http://localhost:5173" }; webServer { command "bun run dev", url "http://localhost:5173", reuseExistingServer true, timeout 60000 }; one chromium project.',
  '- e2e/smoke.spec.ts: goto "/", expect page.getByRole("heading", { name: /family office os/i }) toBeVisible.',
  '- .github/workflows/ci.yml: on push and pull_request. ubuntu-latest. steps: actions/checkout@v4; oven-sh/setup-bun@v2; bun install; bun run typecheck; bun run lint; bun run test; bun run build; npx playwright install --with-deps chromium; bun run test:e2e.',
  '',
  'After creating files, run (PATH set): bun install; then bun run typecheck; bun run lint; bun run test; bun run build. Fix until ALL FOUR pass. Do NOT start a long-running dev server (no plain "bun run dev"). Report the file list and final command results.'
].join('\n')

const VERIFY = [
  'Independently verify the scaffold in ' + REPO + '. Start every bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  'Run in order, record pass/fail + key error lines for each:',
  '1) bun install   2) bun run typecheck   3) bun run lint   4) bun run test   5) bun run build',
  'Then best-effort e2e: bunx playwright install chromium && bun run test:e2e. If the browser download fails in this sandbox, mark e2e as "skipped" (NOT failed).',
  'Do NOT modify any files. Do NOT touch git or .env.',
  'Return the structured result. pass = true ONLY if steps 1-5 all succeeded.'
].join('\n')

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    install: { type: 'string' },
    typecheck: { type: 'string' },
    lint: { type: 'string' },
    unitTest: { type: 'string' },
    build: { type: 'string' },
    e2e: { type: 'string' },
    pass: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } }
  },
  required: ['install', 'typecheck', 'lint', 'unitTest', 'build', 'pass', 'issues']
}

const fixPrompt = (v) => [
  'The scaffold in ' + REPO + ' has failing checks. Fix the app files so bun install, bun run typecheck, bun run lint, bun run test, and bun run build ALL pass. Start every bash command with: export PATH="$HOME/.bun/bin:$PATH"',
  'Do NOT touch git, .env, harness/, .claude/, AGENTS.md, README.md.',
  'Known issues from verification:',
  ...((v && v.issues) || []).map(s => '- ' + s),
  'After fixing, re-run all five commands and confirm they pass. Report what you changed.'
].join('\n')

log('Phase A: scaffolding the family-office-os app shell')
phase('Scaffold')
await agent(SCAFFOLD, { label: 'scaffold', phase: 'Scaffold', effort: 'high' })

phase('Verify')
let v = await agent(VERIFY, { label: 'verify', phase: 'Verify', schema: VERIFY_SCHEMA })
let round = 0
while (v && !v.pass && round < 3) {
  round++
  log('Verify failed (round ' + round + '): ' + ((v.issues || []).slice(0, 3).join('; ')))
  await agent(fixPrompt(v), { label: 'fix-' + round, phase: 'Verify', effort: 'high' })
  v = await agent(VERIFY, { label: 'verify-' + round, phase: 'Verify', schema: VERIFY_SCHEMA })
}
return v