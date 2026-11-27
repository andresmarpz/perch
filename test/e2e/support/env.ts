import { chromium, type BrowserContext, type Worker } from "@playwright/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { MockIrc } from "./mockIrc.ts"

export const root = resolve(import.meta.dirname, "../../..")
export const dist = join(root, "dist")
export const fixturesDir = join(root, "test/e2e/fixtures")

export interface FixtureEnv {
  readonly ctx: BrowserContext
  readonly sw: Worker
  readonly extId: string
  readonly irc: MockIrc
  close(): Promise<void>
}

export const startFixtureEnv = async (): Promise<FixtureEnv> => {
  const irc = await MockIrc.start()
  const profile = mkdtempSync(join(tmpdir(), "twitch-pip-profile-"))
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--autoplay-policy=no-user-gesture-required",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-background-timer-throttling",
      ...irc.chromiumArgs,
    ],
  })
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"))
  const extId = new URL(sw.url()).host

  return {
    ctx,
    sw,
    extId,
    irc,
    close: async () => {
      await ctx.close()
      await irc.stop()
      rmSync(profile, { recursive: true, force: true })
    },
  }
}
