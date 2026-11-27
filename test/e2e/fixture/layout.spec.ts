import { defaultSizes, expect, test, tid } from "../support/fixtures.ts"

test.describe("layouts", () => {
  test("the video layout shows only the video", async ({ app }) => {
    await app.setSettings({ layout: "video" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.video)
    await expect(tid(pip, "pip-chat")).toBeHidden()
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "none")
  })

  test("the side layout puts the chat to the right of the video", async ({ app }) => {
    await app.setSettings({ layout: "side" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.side)
    const stage = (await tid(pip, "pip-stage").boundingBox())!
    const chat = (await tid(pip, "pip-chat").boundingBox())!
    expect(chat.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1)
    expect(chat.height).toBeCloseTo(stage.height, 0)
  })

  test("the below layout puts the chat under the video", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.below)
    const stage = (await tid(pip, "pip-stage").boundingBox())!
    const chat = (await tid(pip, "pip-chat").boundingBox())!
    expect(chat.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1)
    expect(chat.y + chat.height).toBeCloseTo(defaultSizes.below.height, 0)
  })

  test("the overlay layout draws the chat over the video", async ({ app }) => {
    await app.setSettings({ layout: "overlay" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.overlay)
    const stage = (await tid(pip, "pip-stage").boundingBox())!
    const chat = (await tid(pip, "pip-chat").boundingBox())!
    expect(stage.width).toBe(defaultSizes.overlay.width)
    expect(chat.x).toBeLessThan(stage.width / 2)
    expect(chat.y + chat.height).toBeLessThanOrEqual(stage.height)
  })

  test("the overlay layout lets clicks through to the video except on the toolbar", async ({ app }) => {
    await app.setSettings({ layout: "overlay", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.overlay)
    const chat = (await tid(pip, "pip-chat").boundingBox())!
    const hit = await pip.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: chat.x + 20, y: chat.y + 20 })
    expect(hit).toBe("VIDEO")
  })
})

test.describe("chat sources", () => {
  test("Twitch chat loads the embed for the channel with the page host as parent", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "twitch" })
    const pip = await app.openPip(await app.openChannel("fixture"), defaultSizes.side)
    const embed = tid(pip, "chat-embed")
    await expect(embed).toBeVisible()
    await expect(embed).toHaveAttribute("src", "https://www.twitch.tv/embed/fixture/chat?parent=www.twitch.tv&darkpopout")
    await expect(pip.frameLocator('[data-testid="chat-embed"]').getByText("Welcome to the chat room!")).toBeVisible()
  })

  test("the Twitch chat embed gets a real size next to the video", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "twitch" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.side)
    const box = (await tid(pip, "chat-embed").boundingBox())!
    expect(box.width).toBeGreaterThan(150)
    expect(box.height).toBeGreaterThan(150)
  })

  test("lite chat does not load the Twitch embed", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "lite" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.side)
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "lite")
    await expect(tid(pip, "chat-embed")).toHaveCount(0)
  })

  test("the overlay layout forces lite chat even when Twitch chat is chosen", async ({ app }) => {
    await app.setSettings({ layout: "overlay", chatSource: "twitch" })
    const pip = await app.openPip(await app.openChannel(), defaultSizes.overlay)
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "lite")
    await expect(tid(pip, "chat-embed")).toHaveCount(0)
    await expect.poll(() => app.irc.connections).toBe(1)
  })

  test("the video layout opens no IRC connection", async ({ app }) => {
    await app.setSettings({ layout: "video", chatSource: "lite" })
    await app.openPip(await app.openChannel(), defaultSizes.video)
    await app.ctx.pages()[0]!.waitForTimeout(800)
    expect(app.irc.connections).toBe(0)
  })

  test("switching away from lite chat closes the IRC connection", async ({ app }) => {
    await app.setSettings({ layout: "side", chatSource: "lite" })
    await app.openPip(await app.openChannel(), defaultSizes.side)
    await expect.poll(() => app.irc.clients.size).toBe(1)
    await app.setSettings({ chatSource: "twitch" })
    await expect.poll(() => app.irc.clients.size).toBe(0)
  })
})

test.describe("video fills its area", () => {
  for (const layout of ["video", "side", "below", "overlay"] as const) {
    test(`in the ${layout} layout the video covers the stage with object-fit contain`, async ({ app }) => {
      await app.setSettings({ layout })
      const pip = await app.openPip(await app.openChannel(), defaultSizes[layout])
      const stage = (await tid(pip, "pip-stage").boundingBox())!
      const video = pip.locator("video")
      const box = (await video.boundingBox())!
      expect(box.width).toBeCloseTo(stage.width, 0)
      expect(box.height).toBeCloseTo(stage.height, 0)
      expect(await video.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain")
    })
  }

  test("in the below layout a 16:9 video gets a 16:9 row and the chat takes the rest", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel("fixture"), { width: 400, height: 560 })
    const stage = (await tid(pip, "pip-stage").boundingBox())!
    const chat = (await tid(pip, "pip-chat").boundingBox())!
    expect(stage.height).toBeCloseTo((400 * 9) / 16, 0)
    expect(chat.y + chat.height).toBeCloseTo(560, 0)
    expect(chat.y).toBeCloseTo(stage.y + stage.height, 0)
  })

  test("in the below layout a 4:3 video gets a 4:3 row", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel("fixture43"), { width: 400, height: 560 })
    await expect.poll(async () => (await tid(pip, "pip-stage").boundingBox())!.height).toBeCloseTo(300, 0)
  })

  test("in the below layout the video row follows the window width", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel("fixture"), { width: 400, height: 560 })
    await pip.setViewportSize({ width: 320, height: 560 })
    await expect.poll(async () => (await tid(pip, "pip-stage").boundingBox())!.height).toBeCloseTo((320 * 9) / 16, 0)
  })

  test("in the below layout a tall video leaves room for the chat", async ({ app }) => {
    await app.setSettings({ layout: "below" })
    const pip = await app.openPip(await app.openChannel("fixture43"), { width: 900, height: 500 })
    const stage = (await tid(pip, "pip-stage").boundingBox())!
    const chat = (await tid(pip, "pip-chat").boundingBox())!
    expect(chat.height).toBeGreaterThanOrEqual(100)
    expect(stage.height).toBeLessThanOrEqual(500 * 0.7 + 1)
  })
})
