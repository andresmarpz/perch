import { expect, test } from "@playwright/test"
import { startFixtureEnv, type FixtureEnv } from "../support/env.ts"

const openSession = async (env: FixtureEnv) => {
  const page = await env.ctx.newPage()
  await page.goto("https://www.twitch.tv/fixture")
  await page.waitForSelector('[data-testid="pip-open"]', { state: "attached" })
  await page.waitForFunction(() => {
    const video = document.querySelector("video")
    return video !== null && video.readyState >= 2 && video.currentTime > 0.1
  })
  const popup = env.ctx.waitForEvent("page")
  await page.locator('[data-testid="pip-open"]').first().click({ force: true })
  const pip = await popup
  await pip.waitForSelector('[data-testid="pip-root"]')
  return { page, pip }
}

const videos = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [...document.querySelectorAll("video")].map((video) => video.paused))

test.describe("the extension's life", () => {
  test("reloading the extension closes the PiP window and puts the video back in the tab", async () => {
    const env = await startFixtureEnv()
    try {
      const { page, pip } = await openSession(env)
      const gone = pip.waitForEvent("close", { timeout: 15_000 })
      await env.sw.evaluate(() => chrome.runtime.reload()).catch(() => undefined)
      await gone
      await expect.poll(() => videos(page), { timeout: 10_000 }).toEqual([false])
      await expect(page.locator('[data-testid="pip-open"]')).toHaveCount(0)
    } finally {
      await env.close()
    }
  })

  test("a service worker that Chrome suspends does not end the session", async () => {
    const env = await startFixtureEnv()
    try {
      const { page, pip } = await openSession(env)
      const cdp = await env.ctx.newCDPSession(page)
      await cdp.send("ServiceWorker.enable")
      const statuses: Array<string> = []
      cdp.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
        for (const version of versions) statuses.push(version.runningStatus)
      })
      await cdp.send("ServiceWorker.stopAllWorkers")
      await expect.poll(() => statuses.join(","), { timeout: 15_000 }).toMatch(/stopped.*running/)
      await page.waitForTimeout(1500)
      expect(pip.isClosed()).toBe(false)
      expect(await videos(page)).toEqual([])
      await pip.locator('[data-testid="pip-back"]').dispatchEvent("click")
      await expect.poll(() => videos(page)).toEqual([false])
    } finally {
      await env.close()
    }
  })

  test("with no session open a suspended service worker is left asleep", async () => {
    const env = await startFixtureEnv()
    try {
      const page = await env.ctx.newPage()
      await page.goto("https://www.twitch.tv/fixture")
      await page.waitForSelector('[data-testid="pip-open"]', { state: "attached" })
      const cdp = await env.ctx.newCDPSession(page)
      await cdp.send("ServiceWorker.enable")
      const statuses: Array<string> = []
      cdp.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
        for (const version of versions) statuses.push(version.runningStatus)
      })
      await cdp.send("ServiceWorker.stopAllWorkers")
      await expect.poll(() => statuses.join(","), { timeout: 10_000 }).toMatch(/stopped/)
      await page.waitForTimeout(4000)
      expect(statuses.join(",")).not.toMatch(/stopped.*(starting|running)/)
    } finally {
      await env.close()
    }
  })

  test("after the session ends the link is dropped", async () => {
    const env = await startFixtureEnv()
    try {
      const { page, pip } = await openSession(env)
      await pip.locator('[data-testid="pip-back"]').dispatchEvent("click")
      await expect.poll(() => videos(page)).toEqual([false])
      const cdp = await env.ctx.newCDPSession(page)
      await cdp.send("ServiceWorker.enable")
      const statuses: Array<string> = []
      cdp.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
        for (const version of versions) statuses.push(version.runningStatus)
      })
      await cdp.send("ServiceWorker.stopAllWorkers")
      await expect.poll(() => statuses.join(","), { timeout: 10_000 }).toMatch(/stopped/)
      await page.waitForTimeout(4000)
      expect(statuses.join(",")).not.toMatch(/stopped.*(starting|running)/)
    } finally {
      await env.close()
    }
  })
})
