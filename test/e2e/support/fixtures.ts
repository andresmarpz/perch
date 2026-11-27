import { test as base, expect, type Locator, type Page } from "@playwright/test"
import { startFixtureEnv, type FixtureEnv } from "./env.ts"

declare global {
  interface Window {
    __twitch: {
      replacePlayer(): void
      replaceWithEmptyPlayer(): void
      mountVideo(delay?: number): void
      addPlayer(): void
      rerenderPlayer(): void
      addSecondPlayer(): void
    }
    __fakePlayer: { quality: { group: string }; auto: boolean; calls: Array<[string, string | boolean]> }
    __visibilityEvents: number
    __pauseOnMove?: boolean
    __uiRemoved?: boolean
    __maxVideos?: number
    __resized?: Promise<void>
    documentPictureInPicture: EventTarget & { window: Window }
  }
}

export interface Size {
  readonly width: number
  readonly height: number
}

export const defaultSizes = {
  video: { width: 480, height: 270 },
  side: { width: 760, height: 300 },
  below: { width: 420, height: 560 },
  overlay: { width: 480, height: 270 },
} as const satisfies Record<string, Size>

export interface Harness extends FixtureEnv {
  openChannel(channel?: string): Promise<Page>
  openPip(page: Page, size?: Size): Promise<Page>
  setSettings(patch: Record<string, unknown>): Promise<void>
  getSettings(): Promise<Record<string, any>>
  tabVideo(page: Page): Promise<{ count: number; paused: boolean; t: number; muted: boolean } | null>
}

export const test = base.extend<{ app: Harness }, { env: FixtureEnv }>({
  env: [
    async ({}, use) => {
      const env = await startFixtureEnv()
      await use(env)
      await env.close()
    },
    { scope: "worker" },
  ],
  app: async ({ env }, use) => {
    await env.sw.evaluate(() => chrome.storage.sync.clear())
    env.irc.reset()
    for (const page of env.ctx.pages()) await page.close()
    const app: Harness = {
      ...env,
      openChannel: async (channel = "fixture") => {
        const page = await env.ctx.newPage()
        await page.goto(`https://www.twitch.tv/${channel}`)
        await page.waitForSelector('[data-testid="pip-open"]', { state: "attached" })
        await page.waitForFunction(() => {
          const video = document.querySelector("video")
          return video !== null && video.readyState >= 2 && video.currentTime > 0.1
        })
        return page
      },
      openPip: async (page, size = defaultSizes.side) => {
        const popup = env.ctx.waitForEvent("page")
        await page.locator('[data-testid="pip-open"]').first().click({ force: true })
        const pip = await popup
        await pip.setViewportSize(size)
        await pip.waitForSelector('[data-testid="pip-root"]')
        return pip
      },
      setSettings: (patch) =>
        env.sw.evaluate(async (next) => {
          const current = (await chrome.storage.sync.get("settings"))["settings"] ?? {}
          await chrome.storage.sync.set({ settings: { ...current, ...next } })
        }, patch),
      getSettings: () => env.sw.evaluate(async () => (await chrome.storage.sync.get("settings"))["settings"] ?? {}),
      tabVideo: (page) =>
        page.evaluate(() => {
          const video = document.querySelector("video")
          return video === null
            ? null
            : {
              count: document.querySelectorAll("video").length,
              paused: video.paused,
              t: video.currentTime,
              muted: video.muted,
            }
        }),
    }
    await use(app)
    for (const page of env.ctx.pages()) await page.close()
  },
})

export { expect }

export const tid = (page: Page, id: string): Locator => page.locator(`[data-testid="${id}"]`)

export const reveal = async (pip: Page) => {
  const box = await tid(pip, "pip-stage").boundingBox()
  const x = (box?.x ?? 0) + 20
  const y = (box?.y ?? 0) + 40
  await pip.mouse.move(x, y)
  await pip.mouse.move(x + 8, y + 6)
}

export const toolbarOpacity = (pip: Page) =>
  tid(pip, "pip-toolbar").evaluate((el) => getComputedStyle(el).opacity)

export const pipVideo = (pip: Page) =>
  pip.evaluate(() => {
    const video = document.querySelector("video")
    return video === null
      ? null
      : { paused: video.paused, muted: video.muted, volume: video.volume, t: video.currentTime, w: video.videoWidth, h: video.videoHeight }
  })

export const control = async (pip: Page, id: string): Promise<Locator> => {
  await reveal(pip)
  const target = tid(pip, id)
  if (await target.isVisible()) return target
  const triggers = pip.locator("[data-pop-trigger]")
  const count = await triggers.count()
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i)
    if (!(await trigger.isVisible())) continue
    await trigger.hover()
    if (await target.isVisible()) return target
  }
  return target
}

export const click = async (pip: Page, id: string) => {
  const target = await control(pip, id)
  await target.click({ timeout: 5000 })
}

export const closed = (page: Page) => new Promise<void>((resolve) => page.on("close", () => resolve()))

export const openLite = async (app: Harness, layout: "side" | "below" | "overlay" = "side", size: Size = defaultSizes[layout]) => {
  await app.setSettings({ layout, chatSource: "lite" })
  const page = await app.openChannel()
  const pip = await app.openPip(page, size)
  await expect.poll(() => app.irc.received.some((line) => line.startsWith("JOIN #"))).toBe(true)
  return { page, pip }
}

export const storedSizes = async (app: Harness) => (await app.getSettings())["windowSizes"] ?? {}

export const inContentScript = async (app: Harness, page: Page) => {
  const cdp = await app.ctx.newCDPSession(page)
  const contexts: Array<{ id: number; origin: string }> = []
  cdp.on("Runtime.executionContextCreated", ({ context }) => contexts.push(context))
  await cdp.send("Runtime.enable")
  const extension = contexts.find((context) => context.origin.startsWith("chrome-extension://"))
  if (extension === undefined) throw new Error("content script context not found")
  return async (expression: string): Promise<unknown> => {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression,
      contextId: extension.id,
      awaitPromise: true,
      returnByValue: true,
    })
    return result.value
  }
}

export const countRequestWindow = async (app: Harness, page: Page, delayMs: number) => {
  const evaluate = await inContentScript(app, page)
  await evaluate(`(() => {
    const api = window.documentPictureInPicture
    const original = api.requestWindow.bind(api)
    window.__requests = 0
    api.requestWindow = async (...args) => {
      window.__requests += 1
      const win = await original(...args)
      await new Promise((resolve) => setTimeout(resolve, ${delayMs}))
      return win
    }
  })()`)
  return async () => (await evaluate("window.__requests")) as number
}

export const hideTab = (page: Page, hidden: boolean) =>
  page.evaluate((hide) => {
    const state = hide ? "hidden" : "visible"
    for (const key of ["visibilityState", "webkitVisibilityState"]) {
      Object.defineProperty(Document.prototype, key, { configurable: true, get: () => state })
    }
    for (const key of ["hidden", "webkitHidden"]) {
      Object.defineProperty(Document.prototype, key, { configurable: true, get: () => hide })
    }
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
  }, hidden)

export const pageSees = (page: Page) =>
  page.evaluate(() => ({
    state: document.visibilityState,
    hidden: document.hidden,
    webkitHidden: (document as unknown as { webkitHidden: boolean }).webkitHidden,
    events: window.__visibilityEvents,
  }))

export const fakePlayer = (page: Page) =>
  page.evaluate(() => ({
    group: window.__fakePlayer.quality.group,
    auto: window.__fakePlayer.auto,
    calls: window.__fakePlayer.calls,
    stored: localStorage.getItem("video-quality"),
  }))

export const boostAttribute = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute("data-twitch-pip-active"))
