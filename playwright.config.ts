import { defineConfig, devices } from "@playwright/test";

// Allow overriding the dev-server port so the suite can run in environments
// where 5173 is already taken (e.g. parallel worktrees). Defaults to 5173.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
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
