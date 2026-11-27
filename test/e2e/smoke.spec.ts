import { chromium, expect, test, type Page } from "@playwright/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const dist = resolve(import.meta.dirname, "../../dist")
const tid = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`)
const videoTime = (page: Page) => page.evaluate(() => document.querySelector("video")?.currentTime ?? 0)

const isPlaying = async (page: Page) => {
  try {
    await page.waitForSelector('[data-a-target="animated-channel-viewers-count"]', { timeout: 15_000 })
    const first = await videoTime(page)
    await page.waitForTimeout(3000)
    return (await videoTime(page)) > first
  } catch {
    return false
  }
}

test("the extension works on a live Twitch channel", async () => {
  test.setTimeout(150_000)
  const profile = mkdtempSync(join(tmpdir(), "twitch-pip-"))
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--autoplay-policy=no-user-gesture-required"],
  })
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"))
    const directory = await ctx.newPage()
    await directory.goto("https://www.twitch.tv/directory/all", { waitUntil: "domcontentloaded" })
    const link = 'a[data-a-target="preview-card-channel-link"]'
    await directory.waitForSelector(link, { timeout: 20_000 }).catch(() => undefined)
    const hrefs = await directory.evaluate((sel) => [...document.querySelectorAll(sel)].map((a) => a.getAttribute("href") ?? ""), link)
    await directory.close()

    let page: Page | undefined
    for (const href of hrefs.slice(0, 8)) {
      const candidate = await ctx.newPage()
      await candidate.goto(`https://www.twitch.tv${href}`, { waitUntil: "domcontentloaded" })
      if (await isPlaying(candidate)) {
        page = candidate
        break
      }
      await candidate.close()
    }
    test.skip(page === undefined, "no live Twitch channel found")
    const tab = page!

    await sw.evaluate(() => chrome.storage.sync.set({ settings: { layout: "side", chatSource: "lite" } }))
    await tab.hover('[data-a-target="video-player"]')
    await expect(tid(tab, "pip-open").first()).toBeVisible({ timeout: 20_000 })

    const popup = ctx.waitForEvent("page")
    await tid(tab, "pip-open").first().click({ force: true })
    const pip = await popup
    await pip.setViewportSize({ width: 900, height: 420 })
    await pip.waitForSelector('[data-testid="pip-root"]')
    const start = await videoTime(pip)
    await expect.poll(() => videoTime(pip), { timeout: 15_000 }).toBeGreaterThan(start + 1)
    await expect.poll(() => tid(pip, "chat-line").count(), { timeout: 30_000 }).toBeGreaterThan(0)

    await pip.locator('[data-testid="pip-root"]').hover({ position: { x: 60, y: 60 } })
    const closed = new Promise<void>((resolve) => pip.on("close", () => resolve()))
    await tid(pip, "pip-back").click()
    await closed
    const resumed = await videoTime(tab)
    await expect.poll(() => videoTime(tab), { timeout: 15_000 }).toBeGreaterThan(resumed + 1)
  } finally {
    await ctx.close()
    rmSync(profile, { recursive: true, force: true })
  }
})
