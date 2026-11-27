import { click, closed, control, defaultSizes, expect, pipVideo, reveal, test, tid, toolbarOpacity } from "../support/fixtures.ts"

test.describe("toolbar visibility", () => {
  test("shows on pointer movement", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await reveal(pip)
    await expect.poll(() => toolbarOpacity(pip)).toBe("1")
  })

  test("hides after two idle seconds", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await reveal(pip)
    await expect.poll(() => toolbarOpacity(pip)).toBe("1")
    await expect.poll(() => toolbarOpacity(pip), { timeout: 5000 }).toBe("0")
  })

  test("stays while the pointer is over it", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await reveal(pip)
    const box = (await tid(pip, "pip-toolbar").boundingBox())!
    await pip.mouse.move(box.x + 4, box.y + box.height / 2)
    await pip.waitForTimeout(3000)
    expect(await toolbarOpacity(pip)).toBe("1")
  })

  test("stays while a control has keyboard focus", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await tid(pip, "pip-play").focus()
    await pip.waitForTimeout(2800)
    expect(await toolbarOpacity(pip)).toBe("1")
  })
})

test.describe("toolbar controls", () => {
  test("pause pauses the video and relabels the button", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await click(pip, "pip-play")
    await expect.poll(() => pipVideo(pip).then((v) => v?.paused)).toBe(true)
    await expect(tid(pip, "pip-play")).toHaveAttribute("aria-label", "Play")
  })

  test("play resumes the video and relabels the button", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await click(pip, "pip-play")
    await expect.poll(() => pipVideo(pip).then((v) => v?.paused)).toBe(true)
    await click(pip, "pip-play")
    await expect.poll(() => pipVideo(pip).then((v) => v?.paused)).toBe(false)
    await expect(tid(pip, "pip-play")).toHaveAttribute("aria-label", "Pause")
  })

  test("the play button follows a pause that did not come from the toolbar", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await pip.evaluate(() => document.querySelector("video")!.pause())
    await expect(tid(pip, "pip-play")).toHaveAttribute("aria-label", "Play")
  })

  test("mute mutes the video", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await pip.evaluate(() => (document.querySelector("video")!.muted = false))
    await click(pip, "pip-mute")
    await expect.poll(() => pipVideo(pip).then((v) => v?.muted)).toBe(true)
    await expect(tid(pip, "pip-mute")).toHaveAttribute("aria-label", "Unmute")
  })

  test("unmute unmutes the video", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await pip.evaluate(() => (document.querySelector("video")!.muted = true))
    await click(pip, "pip-mute")
    await expect.poll(() => pipVideo(pip).then((v) => v?.muted)).toBe(false)
    await expect(tid(pip, "pip-mute")).toHaveAttribute("aria-label", "Mute")
  })

  test("the volume slider sets the video volume", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    const slider = await control(pip, "pip-volume")
    await slider.fill("0.3")
    await expect.poll(() => pipVideo(pip).then((v) => v?.volume)).toBeCloseTo(0.3, 2)
  })

  test("volume zero shows the muted state", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    const slider = await control(pip, "pip-volume")
    await slider.fill("0")
    await expect(tid(pip, "pip-mute")).toHaveAttribute("aria-label", "Unmute")
  })

  for (const layout of ["video", "side", "below", "overlay"] as const) {
    test(`the ${layout} layout button sets the layout`, async ({ app }) => {
      await app.setSettings({ layout: layout === "side" ? "below" : "side" })
      const pip = await app.openPip(await app.openChannel(), defaultSizes[layout])
      await click(pip, `pip-layout-${layout}`)
      await expect(tid(pip, "pip-root")).toHaveAttribute("data-layout", layout)
      await expect.poll(async () => (await app.getSettings())["layout"]).toBe(layout)
      await expect(tid(pip, `pip-layout-${layout}`)).toHaveAttribute("aria-pressed", "true")
    })
  }

  test("the chat source button switches from Twitch chat to lite chat", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "twitch")
    await click(pip, "pip-chat-source")
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "lite")
  })

  test("the chat source button switches back to Twitch chat", async ({ app }) => {
    await app.setSettings({ chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel())
    await click(pip, "pip-chat-source")
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "twitch")
  })

  test("the chat source button is hidden in the video layout", async ({ app }) => {
    await app.setSettings({ layout: "video" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.video)
    await reveal(pip)
    await expect(tid(pip, "pip-chat-source")).toBeHidden()
  })

  test("the chat source button is disabled in the overlay layout", async ({ app }) => {
    await app.setSettings({ layout: "overlay" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.overlay)
    await reveal(pip)
    await expect(tid(pip, "pip-chat-source")).toBeDisabled()
  })

  test("the larger and smaller text buttons change the lite chat font size", async ({ app }) => {
    await app.setSettings({ chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), { width: 1000, height: 400 })
    await expect.poll(() => app.irc.received.some((l) => l.startsWith("JOIN #"))).toBe(true)
    app.irc.say({ text: "size check" })
    const line = tid(pip, "chat-line").first()
    const size = () => line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    await expect(line).toBeVisible()
    const before = await size()
    await click(pip, "pip-font-up")
    await click(pip, "pip-font-up")
    await expect.poll(size).toBe(before + 2)
    await click(pip, "pip-font-down")
    await expect.poll(size).toBe(before + 1)
  })

  test("the larger text button scales the Twitch chat embed", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel(), { width: 1000, height: 400 })
    const embed = tid(pip, "chat-embed")
    await expect(embed).toBeVisible()
    await click(pip, "pip-font-up")
    await expect.poll(() => embed.evaluate((el) => (el as HTMLElement).style.transform)).toContain("scale(1.07")
  })

  test("the opacity slider changes the overlay chat background", async ({ app }) => {
    await app.setSettings({ layout: "overlay", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), { width: 1000, height: 400 })
    const slider = await control(pip, "pip-opacity")
    await slider.fill("0.4")
    await expect.poll(() => pip.locator(".lite").evaluate((el) => getComputedStyle(el).backgroundColor)).toContain("0.4")
    await expect.poll(async () => (await app.getSettings())["overlayOpacity"]).toBeCloseTo(0.4, 2)
  })

  test("the opacity slider is hidden outside the overlay layout", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel(), { width: 1000, height: 400 })
    await reveal(pip)
    await expect(tid(pip, "pip-opacity")).toBeHidden()
  })

  test("the back button closes the window and the video returns playing", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    const gone = closed(pip)
    await click(pip, "pip-back")
    await gone
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
    const t0 = (await app.tabVideo(page))!.t
    await expect.poll(() => app.tabVideo(page).then((v) => v!.t)).toBeGreaterThan(t0 + 0.3)
    expect((await app.tabVideo(page))!.paused).toBe(false)
  })
})
