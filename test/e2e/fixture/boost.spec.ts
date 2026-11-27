import { click, closed, expect, fakePlayer, hideTab, pageSees, test, boostAttribute } from "../support/fixtures.ts"

const closePip = async (pip: Parameters<typeof click>[0]) => {
  const gone = closed(pip)
  await click(pip, "pip-back")
  await gone
}

test.describe("PiP boost: tab looks visible, quality stays at the top", () => {
  test("a hidden tab reads visible during a session and its real state comes back after", async ({ app }) => {
    const page = await app.openChannel()
    await hideTab(page, true)
    expect(await pageSees(page)).toEqual({ state: "hidden", hidden: true, webkitHidden: true, events: 1 })

    const pip = await app.openPip(page)
    await expect.poll(() => pageSees(page)).toEqual({ state: "visible", hidden: false, webkitHidden: false, events: 2 })

    await hideTab(page, true)
    expect(await pageSees(page)).toEqual({ state: "visible", hidden: false, webkitHidden: false, events: 2 })

    await closePip(pip)
    await expect.poll(() => pageSees(page)).toEqual({ state: "hidden", hidden: true, webkitHidden: true, events: 3 })
    expect(await boostAttribute(page)).toBe(false)
  })

  test("a visible tab sees no extra visibilitychange when a session starts or ends", async ({ app }) => {
    const page = await app.openChannel()
    const pip = await app.openPip(page)
    await expect.poll(() => boostAttribute(page)).toBe(true)
    await closePip(pip)
    await expect.poll(() => boostAttribute(page)).toBe(false)
    expect(await pageSees(page)).toEqual({ state: "visible", hidden: false, webkitHidden: false, events: 0 })
  })

  test("the player is set to the highest quality with auto off, then restored exactly", async ({ app }) => {
    const page = await app.openChannel()
    await page.evaluate(() => localStorage.setItem("video-quality", '{"default":"480p30"}'))
    expect(await fakePlayer(page)).toMatchObject({ group: "480p30", auto: true, calls: [] })

    const pip = await app.openPip(page)
    await expect.poll(() => fakePlayer(page)).toMatchObject({ group: "chunked", auto: false })
    expect((await fakePlayer(page)).calls).toEqual([["setAutoQualityMode", false], ["setQuality", "chunked"]])

    await closePip(pip)
    await expect.poll(() => fakePlayer(page)).toMatchObject({ group: "480p30", auto: true, stored: '{"default":"480p30"}' })
  })

  test("quality is enforced again when the player drifts during the session", async ({ app }) => {
    const page = await app.openChannel()
    await app.openPip(page)
    await expect.poll(() => fakePlayer(page).then((p) => p.group)).toBe("chunked")
    await page.evaluate(() => {
      window.__fakePlayer.auto = true
    })
    await expect.poll(() => fakePlayer(page), { timeout: 6000 }).toMatchObject({ group: "chunked", auto: false })
  })

  test("with pipQuality twitch neither the visibility nor the quality is touched", async ({ app }) => {
    await app.setSettings({ pipQuality: "twitch" })
    const page = await app.openChannel()
    await hideTab(page, true)
    const pip = await app.openPip(page)
    await page.waitForTimeout(2500)
    expect(await boostAttribute(page)).toBe(false)
    expect(await pageSees(page)).toEqual({ state: "hidden", hidden: true, webkitHidden: true, events: 1 })
    expect(await fakePlayer(page)).toMatchObject({ group: "480p30", auto: true, calls: [] })
    await closePip(pip)
    await page.waitForTimeout(500)
    expect(await fakePlayer(page)).toMatchObject({ calls: [] })
  })

  test("switching pipQuality during a session turns the boost off and on", async ({ app }) => {
    const page = await app.openChannel()
    await app.openPip(page)
    await expect.poll(() => fakePlayer(page).then((p) => p.group)).toBe("chunked")
    await app.setSettings({ pipQuality: "twitch" })
    await expect.poll(() => fakePlayer(page)).toMatchObject({ group: "480p30", auto: true })
    await app.setSettings({ pipQuality: "max" })
    await expect.poll(() => fakePlayer(page)).toMatchObject({ group: "chunked", auto: false })
  })

  test("a page without Twitch's player instance is left alone", async ({ app }) => {
    const page = await app.openChannel()
    await page.evaluate(() => {
      const element = document.querySelector(".video-player")!
      for (const key of Object.keys(element)) if (key.startsWith("__reactFiber$")) delete (element as unknown as Record<string, unknown>)[key]
    })
    const pip = await app.openPip(page)
    await page.waitForTimeout(1500)
    expect(await fakePlayer(page)).toMatchObject({ group: "480p30", auto: true, calls: [] })
    await closePip(pip)
    await expect.poll(() => app.tabVideo(page).then((v) => v?.count)).toBe(1)
  })
})
