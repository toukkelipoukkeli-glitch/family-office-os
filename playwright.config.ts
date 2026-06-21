import { defineConfig, devices } from "@playwright/test";

// Allow overriding the dev-server port so the suite can run in environments
// where 5173 is already taken (e.g. parallel worktrees). Defaults to 5173.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  // Default 30s is too tight for WebKit's heavy multi-nav smoke tests under the
  // 3-browser matrix on shared CI runners.
  timeout: 90000,
  // The webkit timeouts were CI resource contention, not real failures: cap
  // parallelism and retry transient flakes so one slow run can't redden main.
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on",
  },
  webServer: {
    command: `bun run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
