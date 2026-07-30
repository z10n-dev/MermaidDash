import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = 6767;
const BACKEND_PORT = 8000;
const FRONTEND_URL = process.env.BASE_URL || `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = process.env.API_URL || `http://localhost:${BACKEND_PORT}`;

/**
 * Playwright configuration for E2E browser testing
 * 
 * Environment variables:
 * - BASE_URL: Frontend URL (default: http://localhost:6767)
 * - API_URL: Backend API URL (default: http://localhost:8000)
 * - HEADED: Run in headed mode (default: false)
 * - NO_SERVER: Skip starting servers (default: false)
 */
export default defineConfig({
  testDir: "./tests",

  globalSetup: "./global-setup",

  fullyParallel: true,

  forbidOnly: !!process.env.CI,

  // One local retry, mirroring CI's tolerance. The two-browser collaboration
  // tests load the editor (mermaid + Monaco) twice in cold-cache contexts served
  // by Vite's on-demand dev server, which occasionally overruns their budget
  // under full-suite load.
  retries: process.env.CI ? 2 : 1,

  // Capped rather than left at Playwright's default (half the cores). Every
  // worker shares one Vite dev server, one backend process and one SQLite file,
  // so beyond a handful of workers the contention shows up as editor loads that
  // blow past their timeouts rather than as a faster suite.
  workers: process.env.CI ? 1 : 4,

  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: process.env.PLAYWRIGHT_REPORT_DIR || "playwright-report",
      },
    ],
  ],

  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results",

  // These run against Vite's dev server, which transforms modules on demand, so
  // the first editor load in each worker is slow. Multi-step bulk flows were
  // marginal at 60s once several workers competed for the machine.
  timeout: 120000,

  expect: {
    timeout: 10000,
  },

  use: {
    baseURL: FRONTEND_URL,

    trace: "on-first-retry",

    screenshot: "only-on-failure",

    video: "on-first-retry",

    headless: process.env.HEADED !== "true",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  webServer: (process.env.CI || process.env.NO_SERVER === "true") ? undefined : [
    {
      command: "cd ../backend && npm run dev",
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: true,
      timeout: 120000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: "file:./dev.db",
        FRONTEND_URL,
        CSRF_MAX_REQUESTS: "1000",
        // A full suite run makes well over the 1000-request default within the
        // limiter's 15 minute window, and every client shares ::1, so the tail
        // of the run would otherwise get 429s and fail for unrelated reasons.
        RATE_LIMIT_MAX_REQUESTS: "100000",
      },
    },
    {
      command: "cd ../frontend && npm run dev -- --host",
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 120000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
