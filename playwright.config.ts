import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const databaseUrl = process.env.E2E_DATABASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: databaseUrl && !process.env.E2E_BASE_URL
    ? {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          NEXT_PUBLIC_APP_URL: baseURL,
          BETTER_AUTH_TRUSTED_ORIGINS: baseURL,
        },
      }
    : undefined,
});
