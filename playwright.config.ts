import { defineConfig } from "@playwright/test"

const live = process.env["LIVE"] === "1"

export default defineConfig({
  testDir: "test/e2e",
  testMatch: live ? "live/**/*.spec.ts" : "fixture/**/*.spec.ts",
  globalSetup: "./test/e2e/support/globalSetup.ts",
  fullyParallel: true,
  workers: live ? 1 : 2,
  retries: 0,
  timeout: live ? 120_000 : 30_000,
  expect: { timeout: 7_000 },
  reporter: [["list"]],
  outputDir: "test-results",
})
