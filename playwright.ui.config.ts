import { defineConfig, devices } from "@playwright/test";

/** Isolated interface checks with explicit HTTP fixtures, not backend acceptance. */
export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  outputDir: "test-results/ui",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    env: { ...process.env, VITE_API_MODE: "api" },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
