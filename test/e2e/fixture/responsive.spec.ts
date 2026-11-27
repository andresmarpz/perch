import { click, control, expect, reveal, test, tid } from "../support/fixtures.ts"

const rowOf = async (pip: import("@playwright/test").Page) => {
  await reveal(pip)
  const toolbar = (await tid(pip, "pip-toolbar").boundingBox())!
  const buttons = await tid(pip, "pip-toolbar").locator("button:visible").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    })
  )
  return { toolbar, buttons }
}

test.describe("toolbar fits one row", () => {
  for (const width of [300, 320, 360, 420, 480, 600, 760, 1000]) {
    for (const layout of ["below", "overlay"] as const) {
      test(`at ${width}px in the ${layout} layout`, async ({ app }) => {
        await app.setSettings({ layout, chatSource: "lite" })
        const pip = await app.openPip(await app.openChannel(), { width, height: layout === "below" ? 520 : 300 })
        const { toolbar, buttons } = await rowOf(pip)
        expect(toolbar.height).toBeLessThan(46)
        expect(Math.max(...buttons.map((b) => b.top)) - Math.min(...buttons.map((b) => b.top))).toBeLessThan(2)
        expect(toolbar.x).toBeGreaterThanOrEqual(0)
        expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(width)
        await expect(tid(pip, "pip-back")).toBeVisible()
        await expect(tid(pip, "pip-play")).toBeVisible()
      })
    }
  }

  for (const width of [320, 420, 480, 760]) {
    test(`at ${width}px in the side layout the toolbar stays over the video and never covers the chat`, async ({ app }) => {
      await app.setSettings({ layout: "side", chatSource: "lite" })
      const pip = await app.openPip(await app.openChannel(), { width, height: 300 })
      const { toolbar, buttons } = await rowOf(pip)
      const stage = (await tid(pip, "pip-stage").boundingBox())!
      const chat = (await tid(pip, "pip-chat").boundingBox())!
      expect(stage.width).toBeGreaterThanOrEqual(Math.min(width * 0.5, 400))
      expect(chat.width).toBeGreaterThanOrEqual(159)
      expect(toolbar.height).toBeLessThan(46)
      expect(Math.max(...buttons.map((b) => b.top)) - Math.min(...buttons.map((b) => b.top))).toBeLessThan(2)
      expect(toolbar.x).toBeGreaterThanOrEqual(0)
      expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(stage.x + stage.width)
      for (const id of ["pip-play", "pip-back"]) await expect(tid(pip, id)).toBeVisible()
    })
  }

  test("the toolbar is centered over the video, not the chat panel, in the side layout", async ({ app }) => {
    await app.setSettings({ layout: "side" })
    const pip = await app.openPip(await app.openChannel(), { width: 900, height: 320 })
    await reveal(pip)
    const stage = (await tid(pip, "pip-stage").boundingBox())!
    const chat = (await tid(pip, "pip-chat").boundingBox())!
    const bar = (await tid(pip, "pip-toolbar").boundingBox())!
    expect(bar.x + bar.width / 2).toBeCloseTo(stage.x + stage.width / 2, 0)
    expect(bar.x + bar.width).toBeLessThanOrEqual(chat.x)
  })
})

test.describe("toolbar controls collapse into popovers", () => {
  test("wide windows show every control inline", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), { width: 1400, height: 400 })
    await reveal(pip)
    for (const id of ["pip-volume", "pip-layout-video", "pip-layout-side", "pip-layout-below", "pip-layout-overlay", "pip-font-down", "pip-font-up"]) {
      await expect(tid(pip, id)).toBeVisible()
    }
    await expect(tid(pip, "pip-layout-menu")).toBeHidden()
    await expect(tid(pip, "pip-chat-menu")).toBeHidden()
  })

  test("the volume slider opens on hover of the mute button", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 520 })
    await reveal(pip)
    await expect(tid(pip, "pip-volume")).toBeHidden()
    await tid(pip, "pip-mute").hover()
    await expect(tid(pip, "pip-volume")).toBeVisible()
    await tid(pip, "pip-volume").fill("0.2")
    await expect.poll(() => pip.evaluate(() => document.querySelector("video")!.volume)).toBeCloseTo(0.2, 2)
  })

  test("the volume slider opens on keyboard focus of the mute button", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 520 })
    await tid(pip, "pip-mute").focus()
    await expect(tid(pip, "pip-volume")).toBeVisible()
  })

  test("the layout buttons collapse into one layout menu", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 520 })
    await reveal(pip)
    await expect(tid(pip, "pip-layout-menu")).toBeVisible()
    await expect(tid(pip, "pip-layout-overlay")).toBeHidden()
    await tid(pip, "pip-layout-menu").hover()
    for (const layout of ["video", "side", "below", "overlay"]) await expect(tid(pip, `pip-layout-${layout}`)).toBeVisible()
  })

  test("choosing a layout in the menu applies it and closes the menu", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 520 })
    await click(pip, "pip-layout-overlay")
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-layout", "overlay")
    await expect(tid(pip, "pip-layout-video")).toBeHidden()
  })

  test("font and opacity controls collapse into a chat popover", async ({ app }) => {
    await app.setSettings({ layout: "overlay", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 300 })
    await reveal(pip)
    await expect(tid(pip, "pip-chat-menu")).toBeVisible()
    await expect(tid(pip, "pip-font-up")).toBeHidden()
    await tid(pip, "pip-chat-menu").hover()
    for (const id of ["pip-font-down", "pip-font-up", "pip-opacity"]) await expect(tid(pip, id)).toBeVisible()
  })

  test("a control inside the chat popover works", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 520 })
    await click(pip, "pip-font-up")
    await expect.poll(async () => (await app.getSettings())["chatFontSize"]).toBe(14)
  })

  test("pressing a control in a pinned chat popover keeps it open", async ({ app }) => {
    await app.setSettings({ layout: "overlay", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 300 })
    await reveal(pip)
    await tid(pip, "pip-chat-menu").click()
    await expect(pip.locator(".pop-chat")).toHaveClass(/open/)
    await tid(pip, "pip-font-up").click()
    await tid(pip, "pip-font-up").click()
    await expect.poll(async () => (await app.getSettings())["chatFontSize"]).toBe(15)
    await expect(pip.locator(".pop-chat")).toHaveClass(/open/)
    await expect(tid(pip, "pip-font-up")).toBeVisible()
  })

  test("Escape closes a popover and returns focus to its button", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 520 })
    await expect(tid(pip, "pip-layout-menu")).toBeVisible()
    await tid(pip, "pip-layout-menu").focus()
    await expect(tid(pip, "pip-layout-side")).toBeVisible()
    await pip.keyboard.press("Escape")
    await expect(tid(pip, "pip-layout-side")).toBeHidden()
    await expect(tid(pip, "pip-layout-menu")).toBeFocused()
  })

  test("Enter on the layout button pins the menu and Tab reaches its items", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel(), { width: 320, height: 520 })
    await expect(tid(pip, "pip-layout-menu")).toBeVisible()
    await tid(pip, "pip-layout-menu").focus()
    await pip.keyboard.press("Tab")
    await expect(tid(pip, "pip-layout-video")).toBeFocused()
    await pip.keyboard.press("Enter")
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-layout", "video")
  })

  test("the popovers stay inside the window at 300px", async ({ app }) => {
    await app.setSettings({ layout: "overlay", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), { width: 300, height: 300 })
    const opacity = await control(pip, "pip-opacity")
    const box = (await opacity.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(300)
  })
})

test.describe("the narrowest toolbar", () => {
  const narrow = { width: 320, height: 300 }

  test("keeps play, layout, a more menu and back, and tucks everything else away", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), narrow)
    await reveal(pip)
    for (const id of ["pip-play", "pip-layout-menu", "pip-more-menu", "pip-back"]) await expect(tid(pip, id)).toBeVisible()
    for (const id of ["pip-mute", "pip-volume", "pip-chat-source", "pip-font-up", "pip-font-down", "pip-chat-menu"]) {
      await expect(tid(pip, id)).toBeHidden()
    }
  })

  test("the more menu holds mute, volume, chat source and text size, and they work", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "twitch" })
    const pip = await app.openPip(await app.openChannel(), narrow)
    await tid(pip, "pip-more-menu").focus()
    for (const id of ["pip-mute", "pip-volume", "pip-chat-source", "pip-font-down", "pip-font-up"]) {
      await expect(tid(pip, id)).toBeVisible()
    }
    await tid(pip, "pip-volume").fill("0.25")
    await expect.poll(() => pip.evaluate(() => document.querySelector("video")!.volume)).toBeCloseTo(0.25, 2)
    await tid(pip, "pip-font-up").click()
    await expect.poll(async () => (await app.getSettings())["chatFontSize"]).toBe(14)
    await tid(pip, "pip-chat-source").click()
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "lite")
    await tid(pip, "pip-mute").click()
    await expect(tid(pip, "pip-mute")).toHaveAttribute("aria-label", /Mute|Unmute/)
  })

  test("the overlay opacity slider is in the more menu in the overlay layout", async ({ app }) => {
    await app.setSettings({ layout: "overlay", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), { width: 200, height: 260 })
    const slider = await control(pip, "pip-opacity")
    await slider.fill("0.5")
    await expect.poll(async () => (await app.getSettings())["overlayOpacity"]).toBeCloseTo(0.5, 2)
  })

  test("the more menu stays open while its controls are used", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), narrow)
    await reveal(pip)
    await tid(pip, "pip-more-menu").click()
    await tid(pip, "pip-font-up").click()
    await tid(pip, "pip-font-up").click()
    await expect.poll(async () => (await app.getSettings())["chatFontSize"]).toBe(15)
    await expect(tid(pip, "pip-font-up")).toBeVisible()
    await expect(pip.locator(".pop-more")).toHaveClass(/open/)
  })

  test("widening the window brings the controls back inline", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), narrow)
    await reveal(pip)
    await expect(tid(pip, "pip-more-menu")).toBeVisible()
    await pip.setViewportSize({ width: 1400, height: 300 })
    await reveal(pip)
    await expect(tid(pip, "pip-more-menu")).toBeHidden()
    for (const id of ["pip-mute", "pip-volume", "pip-chat-source", "pip-font-up", "pip-font-down"]) {
      await expect(tid(pip, id)).toBeVisible()
    }
  })
})
