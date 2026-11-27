import { expect, openLite, test, tid } from "../support/fixtures.ts"
import type { Harness } from "../support/fixtures.ts"

const openOptions = async (app: Harness) => {
  const page = await app.ctx.newPage()
  await page.goto(`chrome-extension://${app.extId}/options.html`)
  await page.waitForSelector('[data-testid="opt-hotkey"]')
  return page
}

test.describe("options page", () => {
  test("choosing a layout saves it and it survives a reload", async ({ app }) => {
    const options = await openOptions(app)
    await tid(options, "opt-layout-below").check({ force: true })
    await expect.poll(async () => (await app.getSettings())["layout"]).toBe("below")
    await options.reload()
    await expect(tid(options, "opt-layout-below")).toBeChecked()
  })

  test("choosing a chat source saves it", async ({ app }) => {
    const options = await openOptions(app)
    await tid(options, "opt-chat-lite").check({ force: true })
    await expect.poll(async () => (await app.getSettings())["chatSource"]).toBe("lite")
  })

  test("the font size and automatic PiP save", async ({ app }) => {
    const options = await openOptions(app)
    await tid(options, "opt-font-size").fill("18")
    await tid(options, "opt-auto-pip").check({ force: true })
    await expect.poll(async () => {
      const s = await app.getSettings()
      return [s["chatFontSize"], s["autoPip"]]
    }).toEqual([18, true])
  })

  test("the shortcut recorder rejects a combination without Alt, Ctrl or Meta", async ({ app }) => {
    const options = await openOptions(app)
    await tid(options, "opt-hotkey").click()
    await options.keyboard.press("Shift+KeyK")
    await expect(tid(options, "opt-hotkey-error")).not.toBeEmpty()
    expect((await app.getSettings())["hotkey"]).toBeUndefined()
  })

  test("the shortcut recorder accepts Alt+Shift+K and saves it", async ({ app }) => {
    const options = await openOptions(app)
    await tid(options, "opt-hotkey").click()
    await options.keyboard.press("Alt+Shift+KeyK")
    await expect(tid(options, "opt-hotkey")).toHaveText("Alt+Shift+K")
    await expect.poll(async () => (await app.getSettings())["hotkey"]).toBe("Alt+Shift+K")
  })

  test("a new shortcut works on an open Twitch tab and the old one stops", async ({ app }) => {
    const page = await app.openChannel()
    await app.setSettings({ hotkey: "Alt+Shift+K" })
    await expect(tid(page, "pip-open")).toHaveAttribute("aria-label", "Picture-in-picture with chat (Alt+Shift+K)")
    await page.bringToFront()
    await page.keyboard.press("Alt+Shift+KeyP")
    await page.waitForTimeout(800)
    expect(app.ctx.pages()).toHaveLength(1)
    const popup = app.ctx.waitForEvent("page")
    await page.keyboard.press("Alt+Shift+KeyK")
    await expect(tid(await popup, "pip-root")).toBeVisible()
  })

  test("reset all restores the defaults", async ({ app }) => {
    await app.setSettings({ hotkey: "Alt+Shift+K", chatFontSize: 20, autoPip: true })
    const options = await openOptions(app)
    await tid(options, "opt-reset-all").click()
    await tid(options, "opt-reset-all").click()
    await expect.poll(async () => {
      const s = await app.getSettings()
      return [s["hotkey"], s["chatFontSize"], s["autoPip"]]
    }).toEqual(["Alt+Shift+P", 13, false])
  })

  test("an open PiP window follows the layout chosen in the options page", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    const options = await openOptions(app)
    await tid(options, "opt-layout-below").check({ force: true })
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-layout", "below")
  })

  test("an open PiP window follows the chat font size chosen in the options page", async ({ app }) => {
    const { pip } = await openLite(app, "side", { width: 1000, height: 400 })
    app.irc.say({ text: "hello" })
    const line = tid(pip, "chat-line")
    await expect(line).toBeVisible()
    const options = await openOptions(app)
    await tid(options, "opt-font-size").fill("20")
    await expect.poll(() => line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(20)
  })

  test("an open PiP window follows the chat source chosen in the options page", async ({ app }) => {
    const pip = await app.openPip(await app.openChannel())
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "twitch")
    const options = await openOptions(app)
    await tid(options, "opt-chat-lite").check({ force: true })
    await expect(tid(pip, "pip-root")).toHaveAttribute("data-chat-source", "lite")
  })
})
