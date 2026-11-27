import type { Page } from "@playwright/test"
import { click, closed, countRequestWindow, expect, test, tid } from "../support/fixtures.ts"

const owners = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll("video")].map((v) => v.dataset["twitchOwn"] ?? "extension"))

const pressHotkey = async (page: Page) => {
  await page.bringToFront()
  await page.keyboard.press("Alt+Shift+KeyP")
}

test.describe("the tab never loses its video and never ends up with two", () => {
  test("three quick clicks ask for one window and leave the session open", async ({ app }) => {
    const page = await app.openChannel()
    const requests = await countRequestWindow(app, page, 300)
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="pip-open"]')!
      button.click()
      button.click()
      button.click()
    })
    await page.waitForTimeout(1200)
    expect(await requests()).toBe(1)
    expect(app.ctx.pages()).toHaveLength(2)
    expect(await owners(page)).toEqual([])
    const popup = app.ctx.pages().find((candidate) => candidate !== page)!
    const gone = closed(popup)
    await page.bringToFront()
    await tid(page, "pip-open").first().click({ force: true })
    await gone
    await expect.poll(() => owners(page)).toEqual(["extension"])
  })

  test("the video is back in the tab before the PiP window's pagehide event finishes", async ({ app }) => {
    const page = await app.openChannel()
    await app.openPip(page)
    const inTabAtHide = await page.evaluate(() => {
      const pipWindow = window.documentPictureInPicture.window
      let count = -1
      pipWindow.addEventListener("pagehide", () => {
        count = document.querySelectorAll("video").length
      })
      pipWindow.dispatchEvent(new Event("pagehide"))
      return count
    })
    expect(inTabAtHide).toBe(1)
  })

  test("a PiP window that closes while it opens leaves the video in the tab", async ({ app }) => {
    const page = await app.openChannel()
    await countRequestWindow(app, page, 150)
    await page.evaluate(() => {
      window.documentPictureInPicture.addEventListener("enter", (event) => (event as Event & { window: Window }).window.close(), { once: true })
    })
    await tid(page, "pip-open").first().click({ force: true })
    await expect.poll(() => app.ctx.pages().length).toBe(1)
    await page.waitForTimeout(500)
    expect(await owners(page)).toEqual(["extension"])
    const popup = app.ctx.waitForEvent("page")
    await pressHotkey(page)
    await expect(tid(await popup, "pip-root")).toBeVisible()
  })

  test("ending a session takes the PiP UI down before the window closes", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await page.evaluate(() => {
      const pipWindow = window.documentPictureInPicture.window
      new MutationObserver((records) => {
        if (records.some((record) => record.removedNodes.length > 0)) window.__uiRemoved = true
      }).observe(pipWindow.document.body, { childList: true })
    })
    const gone = closed(pip)
    await click(pip, "pip-back")
    await gone
    await expect.poll(() => page.evaluate(() => window.__uiRemoved)).toBe(true)
  })

  test("a second player on the page is never touched and never ends the session", async ({ app }) => {
    const page = await app.openChannel()
    await page.evaluate(() => window.__twitch.addSecondPlayer())
    const pip = await app.openPip(page)
    await page.waitForTimeout(3500)
    expect(pip.isClosed()).toBe(false)
    expect(await owners(page)).toEqual(["second"])
    const gone = closed(pip)
    await click(pip, "pip-back")
    await gone
    await page.waitForTimeout(3500)
    expect(await owners(page)).toEqual(["extension", "second"])
    expect(await page.evaluate(() => document.querySelector(".video-player")!.querySelectorAll("video").length)).toBe(1)
  })

  test("Twitch mounting its own video during the session ends it and leaves only Twitch's video", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const gone = closed(pip)
    await page.evaluate(() => window.__twitch.replacePlayer())
    await gone
    await expect.poll(() => owners(page)).toEqual(["1"])
    await page.waitForTimeout(500)
    expect(await owners(page)).toEqual(["1"])
  })

  test("Twitch re-rendering the player to an empty container still ends the session cleanly", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await page.evaluate(() => window.__twitch.replaceWithEmptyPlayer())
    await click(pip, "pip-back")
    await expect.poll(() => owners(page)).toEqual(["extension"])
  })

  test("restoring next to a video Twitch already mounted never shows two videos", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await page.evaluate(() => {
      window.__maxVideos = 0
      new MutationObserver(() => {
        window.__maxVideos = Math.max(window.__maxVideos ?? 0, document.querySelectorAll("video").length)
      }).observe(document.body, { childList: true, subtree: true })
    })
    const gone = closed(pip)
    await page.evaluate(() => window.__twitch.replacePlayer())
    await gone
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__maxVideos)).toBe(1)
    expect(await owners(page)).toEqual(["1"])
  })

  test("Twitch mounting its video right after the restore removes ours", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await page.evaluate(() => window.__twitch.replaceWithEmptyPlayer())
    await click(pip, "pip-back")
    await page.evaluate(() => window.__twitch.mountVideo(0))
    await expect.poll(() => owners(page)).toEqual(["1"])
    await page.waitForTimeout(600)
    expect(await owners(page)).toEqual(["1"])
  })

  test("Twitch mounting its video a little after the restore removes ours", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await page.evaluate(() => window.__twitch.replaceWithEmptyPlayer())
    await click(pip, "pip-back")
    await page.evaluate(() => window.__twitch.mountVideo(250))
    await expect.poll(() => owners(page)).toEqual(["1"])
    await page.waitForTimeout(600)
    expect(await owners(page)).toEqual(["1"])
  })
})

test.describe("settings from the toolbar", () => {
  test("a change made right before the session ends is still saved", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), { width: 1000, height: 400 })
    const gone = closed(pip)
    await pip
      .evaluate(() => {
        document.querySelector<HTMLButtonElement>('[data-testid="pip-font-up"]')!.click()
        document.querySelector<HTMLButtonElement>('[data-testid="pip-back"]')!.click()
      })
      .catch(() => undefined)
    await gone
    await expect.poll(async () => (await app.getSettings())["chatFontSize"]).toBe(14)
  })
})

test.describe("playback through the moves", () => {
  test("a page that pauses the video on every DOM change does not stop it in the PiP window or after the restore", async ({ app }) => {
    const page = await app.openChannel()
    await page.evaluate(() => (window.__pauseOnMove = true))
    const pip = await app.openPip(page)
    await expect.poll(() => pip.evaluate(() => document.querySelector("video")!.paused)).toBe(false)
    await click(pip, "pip-back")
    await expect.poll(() => owners(page)).toEqual(["extension"])
    await expect.poll(() => app.tabVideo(page).then((v) => v?.paused)).toBe(false)
  })

  test("a pause right after the video resumed in the PiP window is not undone", async ({ app }) => {
    const page = await app.openChannel()
    await page.evaluate(() => (window.__pauseOnMove = true))
    const pip = await app.openPip(page)
    await pip.evaluate(() =>
      new Promise<void>((resolve) => {
        const video = document.querySelector("video")!
        const pause = () => {
          video.pause()
          resolve()
        }
        if (video.paused) video.addEventListener("playing", pause, { once: true })
        else pause()
      })
    )
    await pip.waitForTimeout(900)
    expect(await pip.evaluate(() => document.querySelector("video")!.paused)).toBe(true)
  })
})

test.describe("the hotkey", () => {
  test("closes the session when pressed in the PiP window", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const gone = closed(pip)
    await pip.bringToFront()
    await pip.keyboard.press("Alt+Shift+KeyP").catch(() => undefined)
    await gone
    await expect.poll(() => owners(page)).toEqual(["extension"])
  })

  test("is ignored while typing in a contenteditable chat box", async ({ app }) => {
    const page = await app.openChannel()
    await page.bringToFront()
    await tid(page, "chat-input").click()
    await page.keyboard.press("Alt+Shift+KeyP")
    await page.waitForTimeout(800)
    expect(app.ctx.pages()).toHaveLength(1)
  })

  test("does not open a window on a channel page without a player", async ({ app }) => {
    const page = await app.ctx.newPage()
    await page.goto("https://www.twitch.tv/noplayer")
    await page.waitForSelector('[data-a-target="stream-title"]')
    await page.waitForTimeout(600)
    let opened = 0
    app.ctx.on("page", () => (opened += 1))
    await pressHotkey(page)
    await page.waitForTimeout(800)
    expect(opened).toBe(0)
  })
})

test.describe("page lifecycle", () => {
  test("a pagehide that keeps the page in the back/forward cache leaves the extension running", async ({ app }) => {
    const page = await app.openChannel()
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })))
    await page.waitForTimeout(300)
    const popup = app.ctx.waitForEvent("page")
    await pressHotkey(page)
    await expect(tid(await popup, "pip-root")).toBeVisible()
  })

  test("a pagehide that discards the page shuts the extension down and restores the video", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const gone = closed(pip)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })))
    await gone
    await expect.poll(() => owners(page)).toEqual(["extension"])
    await expect(tid(page, "pip-open")).toHaveCount(0)
  })
})
