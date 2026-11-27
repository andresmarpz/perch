import { expect, openLite, test, tid } from "../support/fixtures.ts"

const lines = (pip: import("@playwright/test").Page) => tid(pip, "chat-line")

test.describe("lite chat connection", () => {
  test("connects anonymously and joins the channel", async ({ app }) => {
    await openLite(app)
    expect(app.irc.received).toContain("CAP REQ :twitch.tv/tags twitch.tv/commands")
    expect(app.irc.received).toContain("PASS SCHMOOPIIE")
    expect(app.irc.received.some((l) => /^NICK justinfan\d{5}$/.test(l))).toBe(true)
    expect(app.irc.received).toContain("JOIN #fixture")
  })

  test("answers a server PING with a PONG", async ({ app }) => {
    await openLite(app)
    app.irc.ping()
    await expect.poll(() => app.irc.received).toContain("PONG :tmi.twitch.tv")
  })

  test("reconnects after the server closes the socket and keeps showing messages", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ text: "before" })
    await expect(lines(pip)).toHaveCount(1)
    app.irc.dropAll()
    await expect.poll(() => app.irc.connections, { timeout: 10_000 }).toBe(2)
    await expect.poll(() => app.irc.received.filter((l) => l.startsWith("JOIN #")).length).toBe(2)
    app.irc.say({ text: "after" })
    await expect(lines(pip).last()).toContainText("after")
  })
})

test.describe("lite chat status", () => {
  test("hides the status once joined, shows Reconnecting while the socket is down, and hides it again", async ({ app }) => {
    const { pip } = await openLite(app)
    await expect(tid(pip, "chat-status")).toBeHidden()
    app.irc.say({ text: "one line" })
    await expect(lines(pip)).toHaveCount(1)
    app.irc.dropAll()
    await expect(tid(pip, "chat-status")).toHaveText("Reconnecting\u2026")
    await expect(tid(pip, "chat-status")).toBeHidden({ timeout: 10_000 })
    app.irc.say({ text: "back" })
    await expect(lines(pip).last()).toContainText("back")
  })
})

test.describe("lite chat rendering", () => {
  test("shows the display name and the message", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ login: "lala_notz", name: "Lala_notz", text: "adios" })
    await expect(lines(pip)).toHaveText("Lala_notz: adios")
  })

  test("colours the name from the color tag", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ name: "Bob", color: "#FF4500", text: "hi" })
    await expect(lines(pip).locator(".name")).toHaveCSS("color", "rgb(255, 69, 0)")
  })

  test("lightens a name colour that is too dark to read", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ name: "Dim", color: "#0000FF", text: "hi" })
    const color = await lines(pip).locator(".name").evaluate((el) => getComputedStyle(el).color)
    expect(color).not.toBe("rgb(0, 0, 255)")
  })

  test("renders a Twitch emote as an image from the emote CDN", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ text: "Kappa nice", emotes: "25:0-4" })
    const emote = lines(pip).locator("img.emote")
    await expect(emote).toHaveAttribute("src", "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0")
    await expect(emote).toHaveAttribute("alt", "Kappa")
    await expect.poll(() => app.irc.emoteRequests).toContain("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0")
  })

  test("renders a /me action in italics without a colon", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ name: "Bob", text: "waves", action: true })
    const line = lines(pip)
    await expect(line).toHaveClass(/action/)
    await expect(line).toHaveText("Bob waves")
    await expect(line.locator(".text")).toHaveCSS("font-style", "italic")
  })

  test("renders HTML in a message as text and runs no script", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ text: "<img src=x onerror=window.__xss=1> <script>window.__xss=2</script>" })
    await expect(lines(pip)).toContainText("<img src=x onerror=window.__xss=1>")
    await expect(pip.locator('img[src="x"]')).toHaveCount(0)
    await pip.waitForTimeout(300)
    expect(await pip.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  })

  test("renders HTML in a display name as text", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ name: "<b>x</b>", text: "hi" })
    await expect(lines(pip).locator(".name")).toHaveText("<b>x</b>")
    await expect(lines(pip).locator("b")).toHaveCount(0)
  })
})

test.describe("lite chat moderation and limits", () => {
  test("CLEARCHAT for a user removes only that user's lines", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ login: "spam", text: "buy" })
    app.irc.say({ login: "nice", text: "hello" })
    app.irc.say({ login: "spam", text: "now" })
    await expect(lines(pip)).toHaveCount(3)
    app.irc.clearChat("spam")
    await expect(lines(pip)).toHaveCount(1)
    await expect(lines(pip)).toContainText("hello")
  })

  test("CLEARCHAT without a user clears the whole chat", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ text: "a" })
    app.irc.say({ text: "b" })
    await expect(lines(pip)).toHaveCount(2)
    app.irc.clearChat()
    await expect(lines(pip)).toHaveCount(0)
  })

  test("CLEARMSG removes the one deleted line", async ({ app }) => {
    const { pip } = await openLite(app)
    app.irc.say({ id: "keep-1", text: "stay" })
    const gone = app.irc.say({ id: "gone-1", login: "rude", text: "bad" })
    app.irc.say({ id: "keep-2", text: "also stay" })
    await expect(lines(pip)).toHaveCount(3)
    app.irc.clearMsg("rude", gone)
    await expect(lines(pip)).toHaveCount(2)
    await expect(pip.locator('[data-msg-id="gone-1"]')).toHaveCount(0)
  })

  test("keeps at most 150 lines and drops the oldest", async ({ app }) => {
    const { pip } = await openLite(app)
    for (let i = 0; i < 170; i++) app.irc.say({ text: `m${i}` })
    await expect(lines(pip).last()).toContainText("m169")
    await expect(lines(pip)).toHaveCount(150)
    await expect(lines(pip).first()).toContainText("m20")
  })
})

const scrollUp = (pip: import("@playwright/test").Page) =>
  tid(pip, "lite-chat").evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        el.addEventListener("scroll", () => resolve(), { once: true })
        el.scrollTop = 0
      }),
  )

test.describe("lite chat scrolling", () => {
  const fill = (app: Parameters<typeof openLite>[0], n: number) => {
    for (let i = 0; i < n; i++) app.irc.say({ text: `line ${i}` })
  }

  test("follows new messages while at the bottom", async ({ app }) => {
    const { pip } = await openLite(app)
    fill(app, 60)
    await expect(lines(pip)).toHaveCount(60)
    const gap = () => tid(pip, "lite-chat").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)
    await expect.poll(gap).toBeLessThan(30)
  })

  test("pauses auto-scroll when scrolled up and shows the new-messages pill", async ({ app }) => {
    const { pip } = await openLite(app)
    fill(app, 60)
    await expect(lines(pip)).toHaveCount(60)
    await scrollUp(pip)
    fill(app, 3)
    await expect(lines(pip)).toHaveCount(63)
    await expect(tid(pip, "chat-new-pill")).toHaveClass(/show/)
    expect(await tid(pip, "lite-chat").evaluate((el) => el.scrollTop)).toBeLessThan(40)
  })

  test("the pill jumps to the newest message and hides", async ({ app }) => {
    const { pip } = await openLite(app)
    fill(app, 60)
    await expect(lines(pip)).toHaveCount(60)
    await scrollUp(pip)
    fill(app, 2)
    await tid(pip, "chat-new-pill").click()
    const gap = () => tid(pip, "lite-chat").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)
    await expect.poll(gap).toBeLessThan(30)
    await expect(tid(pip, "chat-new-pill")).not.toHaveClass(/show/)
  })

  test("the overlay layout always follows new messages and never shows the pill", async ({ app }) => {
    const { pip } = await openLite(app, "overlay")
    fill(app, 40)
    await expect(lines(pip)).toHaveCount(40)
    await expect(lines(pip).last()).toBeInViewport()
    await expect(tid(pip, "chat-new-pill")).toBeHidden()
  })
})
