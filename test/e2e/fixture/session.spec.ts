import { click, closed, defaultSizes, expect, test, tid } from "../support/fixtures.ts"

test.describe("session lifecycle", () => {
  test("closing the PiP window restores the video to the tab and it plays", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const gone = closed(pip)
    await pip.close()
    await gone
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
    const inPlayer = await page.evaluate(() => document.querySelectorAll('[data-a-target="video-ref"] > video').length)
    expect(inPlayer).toBe(1)
    const t0 = (await app.tabVideo(page))!.t
    await expect.poll(() => app.tabVideo(page).then((v) => v!.t)).toBeGreaterThan(t0 + 0.3)
  })

  test("the video returns to its original place among its siblings", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await click(pip, "pip-back")
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
    const siblings = await page.evaluate(() =>
      [...document.querySelector('[data-a-target="video-ref"]')!.children].map((el) => el.tagName + "." + el.className)
    )
    expect(siblings).toEqual(["VIDEO.", "DIV.overlay-a", "DIV.overlay-b"])
  })

  test("a video paused in the PiP window stays paused after the window closes", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await pip.waitForTimeout(700)
    await click(pip, "pip-play")
    await expect.poll(() => pip.evaluate(() => document.querySelector("video")!.paused)).toBe(true)
    await click(pip, "pip-back")
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
    await page.waitForTimeout(800)
    expect((await app.tabVideo(page))!.paused).toBe(true)
  })

  test("navigating to another channel closes the session and leaves one video on the page", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const gone = closed(pip)
    await tid(page, "nav-other").click()
    await gone
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
    await expect(tid(page, "pip-open")).toHaveCount(1)
  })

  test("navigating to a page that is not a channel closes the session and removes the button", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const gone = closed(pip)
    await tid(page, "nav-directory").click()
    await page.evaluate(() => history.pushState({}, "", "/directory"))
    await gone
    await expect(tid(page, "pip-open")).toHaveCount(0)
  })

  test("the button opens a new session after the first one ended", async ({ app }) => {
    const page = await app.openChannel()
    const first = await app.openPip(page)
    await click(first, "pip-back")
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
    const second = await app.openPip(page)
    await expect(tid(second, "pip-root")).toBeVisible()
    expect(await app.tabVideo(page)).toBeNull()
  })

  test("clicking the PiP button while a session is open closes it", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const gone = closed(pip)
    await page.bringToFront()
    await tid(page, "pip-open").click({ force: true })
    await gone
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
  })
})

test.describe("window size", () => {
  test("a resized window is saved for its layout", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel(), defaultSizes.side)
    await pip.setViewportSize({ width: 640, height: 330 })
    await expect.poll(async () => ((await app.getSettings())["windowSizes"] ?? {})["side"]).toEqual({ width: 640, height: 330 })
  })

  test("each layout keeps its own size", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel(), defaultSizes.side)
    await pip.setViewportSize({ width: 640, height: 330 })
    await expect.poll(async () => ((await app.getSettings())["windowSizes"] ?? {})["side"]).toEqual({ width: 640, height: 330 })
    await click(pip, "pip-layout-below")
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-layout", "below")
    await pip.setViewportSize({ width: 400, height: 520 })
    await expect.poll(async () => ((await app.getSettings())["windowSizes"] ?? {})["below"]).toEqual({ width: 400, height: 520 })
    expect(((await app.getSettings())["windowSizes"] ?? {})["side"]).toEqual({ width: 640, height: 330 })
  })
})
