import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, reveal, test, tid } from "../support/fixtures.ts"

const dir = process.env["SHOTS_DIR"]
const widths = [320, 420, 480, 760] as const

const chatter = [
  ["LadyZoe", "#1E90FF", "lol that was close"],
  ["Nathcreep", "#FF7F50", "BAD!"],
  ["EscheroOfficial", "#00FF7F", "oh shit i missed a game over"],
  ["sealphur", "#DAA520", "HUHH"],
  ["Pan__cha", "#2E8B57", "BAD!"],
  ["thundercatmo", "#9146FF", "San Diego under water now"],
] as const

test.describe("screenshots", () => {
  test.skip(dir === undefined, "set SHOTS_DIR to take screenshots")

  for (const width of widths) {
    for (const [name, layout, source, height, channel] of [
      ["overlay-lite", "overlay", "lite", 270, "fixture"],
      ["below-lite", "below", "lite", 560, "fixture"],
      ["below-lite-4x3", "below", "lite", 560, "fixture43"],
      ["side-twitch", "side", "twitch", 300, "fixture"],
      ["side-lite", "side", "lite", 300, "fixture"],
    ] as const) {
      test(`${name} at ${width}`, async ({ app }) => {
        mkdirSync(dir!, { recursive: true })
        await app.setSettings({ layout, chatSource: source })
        const page = await app.openChannel(channel)
        const pip = await app.openPip(page, { width, height })
        if (source === "lite") {
          await expect.poll(() => app.irc.connections).toBe(1)
          for (const [login, color, text] of chatter) app.irc.say({ login: login.toLowerCase(), name: login, color, text })
          await expect(tid(pip, "chat-line")).toHaveCount(chatter.length)
        } else {
          await expect(tid(pip, "chat-embed")).toBeVisible()
        }
        await reveal(pip)
        await expect.poll(() => tid(pip, "pip-toolbar").evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
        await pip.waitForTimeout(250)
        await pip.screenshot({ path: join(dir!, `${name}-w${width}.png`) })
      })
    }
  }
})
