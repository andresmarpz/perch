import { chromium, expect, test, type BrowserContext, type Page, type Worker } from "@playwright/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { dist } from "../support/env.ts"
import { tid } from "../support/fixtures.ts"

const chatLine = ".chat-line__message, [data-a-target='chat-line-message'], .chat-line__no-background"

test.describe.configure({ mode: "serial" })

let profile: string
let ctx: BrowserContext
let sw: Worker
let page: Page
let pip: Page
let channel: string | undefined

const videoState = (target: Page) =>
  target.evaluate(() => {
    const video = document.querySelector("video")
    return video === null ? null : { t: video.currentTime, paused: video.paused, w: video.videoWidth, h: video.videoHeight }
  })

const isLiveAndPlaying = async (candidate: Page): Promise<boolean> => {
  try {
    await candidate.waitForSelector('[data-a-target="animated-channel-viewers-count"]', { timeout: 15_000 })
    await candidate.waitForSelector('[data-a-player-type="site"]', { timeout: 5_000 })
    const first = await videoState(candidate)
    await candidate.waitForTimeout(3000)
    const second = await videoState(candidate)
    return first !== null && second !== null && second.t > first.t && !second.paused && second.w >= 320
  } catch {
    return false
  }
}

const pickLiveChannel = async (): Promise<{ channel: string; page: Page } | undefined> => {
  const directory = await ctx.newPage()
  await directory.goto("https://www.twitch.tv/directory/all", { waitUntil: "domcontentloaded" })
  await directory.waitForSelector('a[data-a-target="preview-card-channel-link"]', { timeout: 20_000 }).catch(() => undefined)
  const hrefs = await directory.evaluate(() =>
    [...document.querySelectorAll('a[data-a-target="preview-card-channel-link"]')].map((a) => a.getAttribute("href") ?? "")
  )
  await directory.close()
  const names = [...new Set(hrefs.map((href) => href.split("/")[1] ?? "").filter((name) => /^[a-z0-9_]{3,25}$/i.test(name)))]
  for (const name of names.slice(0, 8)) {
    const candidate = await ctx.newPage()
    await candidate.goto(`https://www.twitch.tv/${name}`, { waitUntil: "domcontentloaded" })
    if (await isLiveAndPlaying(candidate)) return { channel: name, page: candidate }
    await candidate.close()
  }
  return undefined
}

test.beforeAll(async () => {
  profile = mkdtempSync(join(tmpdir(), "twitch-pip-live-"))
  ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--autoplay-policy=no-user-gesture-required"],
  })
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"))
  const picked = await pickLiveChannel()
  if (picked !== undefined) {
    channel = picked.channel
    page = picked.page
    console.log(`live channel: ${channel}`)
  }
})

test.afterAll(async () => {
  await ctx?.close()
  rmSync(profile, { recursive: true, force: true })
})

test.beforeEach(() => {
  test.skip(channel === undefined, "no live Twitch channel found (directory empty or blocked); live suite skipped")
})

test("the PiP button appears in the real player bar", async () => {
  await expect(tid(page, "pip-open").first()).toBeAttached({ timeout: 20_000 })
  await page.hover('[data-a-target="video-player"]')
  await expect(tid(page, "pip-open").first()).toBeVisible()
})

test("the PiP window opens with the live video playing inside", async () => {
  await sw.evaluate(() => chrome.storage.sync.set({ settings: { layout: "side", chatSource: "twitch" } }))
  const popup = ctx.waitForEvent("page")
  await page.hover('[data-a-target="video-player"]')
  await tid(page, "pip-open").first().click({ force: true })
  pip = await popup
  await pip.setViewportSize({ width: 900, height: 420 })
  await pip.waitForSelector('[data-testid="pip-root"]')
  const first = await videoState(pip)
  await expect.poll(async () => (await videoState(pip))?.t ?? 0, { timeout: 15_000 }).toBeGreaterThan((first?.t ?? 0) + 1)
  expect((await videoState(pip))?.paused).toBe(false)
})

test("the Twitch chat embed loads and shows messages", async () => {
  const frame = pip.frameLocator('[data-testid="chat-embed"]')
  await expect(frame.locator(chatLine).first()).toBeVisible({ timeout: 30_000 })
  expect(await frame.locator(chatLine).count()).toBeGreaterThan(0)
})

test("lite chat receives live messages", async () => {
  await sw.evaluate(async () => {
    const current = (await chrome.storage.sync.get("settings"))["settings"] ?? {}
    await chrome.storage.sync.set({ settings: { ...current, chatSource: "lite" } })
  })
  await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "lite")
  await expect.poll(() => tid(pip, "chat-line").count(), { timeout: 30_000 }).toBeGreaterThan(2)
})

const topRendition = () =>
  page.evaluate(() => {
    const root = document.querySelector(".video-player__container") ?? document.querySelector('[data-a-target="video-player"]')
    if (root === null) return null
    const key = Object.keys(root).find((name) => name.startsWith("__reactFiber$"))
    let fiber = key === undefined ? null : (root as unknown as Record<string, any>)[key]
    for (let depth = 0; fiber && depth < 400; depth++, fiber = fiber.return) {
      const instance = fiber.memoizedProps?.mediaPlayerInstance ?? fiber.stateNode?.props?.mediaPlayerInstance
      if (instance && typeof instance.getQualities === "function") {
        const heights = instance.getQualities().map((quality: { height?: number }) => quality.height ?? 0)
        return { top: Math.max(...heights), auto: instance.isAutoQualityMode() as boolean }
      }
    }
    return null
  })

const simulateHidden = (hidden: boolean) =>
  page.evaluate((hide) => {
    const state = hide ? "hidden" : "visible"
    for (const key of ["visibilityState", "webkitVisibilityState"]) {
      Object.defineProperty(Document.prototype, key, { configurable: true, get: () => state })
    }
    for (const key of ["hidden", "webkitHidden"]) Object.defineProperty(Document.prototype, key, { configurable: true, get: () => hide })
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
  }, hidden)

test("with the tab hidden for 75 s the PiP keeps playing at the top rendition", async () => {
  test.setTimeout(180_000)
  const before = await topRendition()
  test.skip(before === null, "Twitch's player instance is not reachable; the quality bridge cannot be checked live")
  const top = before!.top
  await simulateHidden(true)
  try {
    await expect.poll(async () => (await videoState(pip))?.h ?? 0, { timeout: 45_000 }).toBe(top)
    const start = (await videoState(pip))!.t
    for (let elapsed = 0; elapsed < 75; elapsed += 5) {
      await page.waitForTimeout(5000)
      const sample = (await videoState(pip))!
      expect(sample.h).toBe(top)
      expect(sample.paused).toBe(false)
      expect(sample.t).toBeGreaterThan(start)
    }
    expect((await topRendition())?.auto).toBe(false)
  } finally {
    await simulateHidden(false)
  }
})

test("back to tab restores the video in the page", async () => {
  await pip.locator('[data-testid="pip-root"]').hover({ position: { x: 60, y: 60 } })
  const gone = new Promise<void>((resolve) => pip.on("close", () => resolve()))
  await tid(pip, "pip-back").click()
  await gone
  await expect.poll(async () => (await videoState(page))?.paused, { timeout: 10_000 }).toBe(false)
  const first = (await videoState(page))!
  await expect.poll(async () => (await videoState(page))?.t ?? 0, { timeout: 15_000 }).toBeGreaterThan(first.t + 1)
  expect(await page.evaluate(() => document.querySelectorAll("video").length)).toBe(1)
  await expect.poll(async () => (await topRendition())?.auto, { timeout: 10_000 }).toBe(true)
})
