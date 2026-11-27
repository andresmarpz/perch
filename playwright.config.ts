import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "test/e2e",
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
})
