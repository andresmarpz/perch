import { closed, expect, test, tid } from "../support/fixtures.ts"

test.describe("opening the PiP window", () => {
  test("the player bar gets one PiP button before the fullscreen button", async ({ app }) => {
    const page = await app.openChannel()
    await expect(tid(page, "pip-open")).toHaveCount(1)
    const order = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="pip-open"]')!
      const bar = button.closest(".player-controls__right-control-group")!
      const wrapper = button.parentElement!
      const next = wrapper.nextElementSibling!
      return {
        visibleBar: bar.getClientRects().length > 0,
        beforeFullscreen: next.querySelector('[data-a-target="player-fullscreen-button"]') !== null,
      }
    })
    expect(order).toEqual({ visibleBar: true, beforeFullscreen: true })
  })

  test("the PiP button has no button on routes that are not a channel", async ({ app }) => {
    const page = await app.ctx.newPage()
    await page.goto("https://www.twitch.tv/directory")
    await page.waitForSelector('[data-a-target="video-player"]')
    await page.waitForTimeout(600)
    await expect(tid(page, "pip-open")).toHaveCount(0)
  })

  test("the PiP button label and tooltip show the hotkey", async ({ app }) => {
    const page = await app.openChannel()
    const button = tid(page, "pip-open")
    await expect(button).toHaveAttribute("aria-label", "Picture-in-picture with chat (Alt+Shift+P)")
    await expect(button).toHaveAttribute("title", "Picture-in-picture with chat (Alt+Shift+P)")
  })

  test("the PiP button matches the size and hover style of its neighbours", async ({ app }) => {
    const page = await app.openChannel()
    await page.hover('[data-a-target="video-player"]')
    const own = tid(page, "pip-open")
    const neighbour = page.locator('.video-player > [data-a-target="player-controls"] [data-a-target="player-fullscreen-button"]')
    const box = await own.boundingBox()
    const other = await neighbour.boundingBox()
    expect(box?.width).toBe(other?.width)
    expect(box?.height).toBe(other?.height)
    const style = (loc: typeof own) => loc.evaluate((el) => {
      const cs = getComputedStyle(el)
      const svg = el.querySelector("svg")!.getBoundingClientRect()
      return { radius: cs.borderRadius, svg: svg.width }
    })
    expect(await style(own)).toEqual(await style(neighbour))
    await own.hover()
    await expect.poll(() => own.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(255, 255, 255, 0.13)")
  })

  test("clicking the PiP button opens the window and moves the video into it", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await expect(tid(pip, "pip-root")).toBeVisible()
    expect(await app.tabVideo(page)).toBeNull()
    await expect.poll(() => pip.evaluate(() => document.querySelectorAll("video").length)).toBe(1)
  })

  test("the video keeps playing inside the PiP window", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const t0 = await pip.evaluate(() => document.querySelector("video")!.currentTime)
    await expect.poll(() => pip.evaluate(() => document.querySelector("video")!.currentTime)).toBeGreaterThan(t0 + 0.3)
    expect(await pip.evaluate(() => document.querySelector("video")!.paused)).toBe(false)
  })

  test("the hotkey opens the PiP window", async ({ app }) => {
    const page = await app.openChannel()
    await page.bringToFront()
    const popup = app.ctx.waitForEvent("page")
    await page.keyboard.press("Alt+Shift+KeyP")
    const pip = await popup
    await expect(tid(pip, "pip-root")).toBeVisible()
  })

  test("the hotkey closes an open PiP window and the video returns", async ({ app }) => {
    const page = await app.openChannel()
    await page.bringToFront()
    const popup = app.ctx.waitForEvent("page")
    await page.keyboard.press("Alt+Shift+KeyP")
    const pip = await popup
    await pip.waitForSelector('[data-testid="pip-root"]')
    const gone = closed(pip)
    await page.bringToFront()
    await page.keyboard.press("Alt+Shift+KeyP")
    await gone
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
  })

  test("the hotkey is ignored while typing in an input", async ({ app }) => {
    const page = await app.openChannel()
    await page.bringToFront()
    await page.locator('input[type="search"]').focus()
    await page.keyboard.press("Alt+Shift+KeyP")
    await page.waitForTimeout(800)
    expect(app.ctx.pages()).toHaveLength(1)
    expect((await app.tabVideo(page))?.count).toBe(1)
  })

  test("the hotkey is ignored on routes that are not a channel", async ({ app }) => {
    const page = await app.ctx.newPage()
    await page.goto("https://www.twitch.tv/directory")
    await page.waitForSelector('[data-a-target="video-player"]')
    await page.bringToFront()
    await page.keyboard.press("Alt+Shift+KeyP")
    await page.waitForTimeout(800)
    expect(app.ctx.pages()).toHaveLength(1)
  })
})
