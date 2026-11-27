import { describe, expect, test } from "bun:test"
import { chatSourceFor, defaultWindowSizes, layouts, sizeFor } from "./layout.ts"

describe("chatSourceFor", () => {
  test("video has no chat", () => {
    expect(chatSourceFor("video", "twitch")).toBeUndefined()
    expect(chatSourceFor("video", "lite")).toBeUndefined()
  })

  test("overlay forces lite", () => {
    expect(chatSourceFor("overlay", "twitch")).toBe("lite")
    expect(chatSourceFor("overlay", "lite")).toBe("lite")
  })

  test("side and below follow the preference", () => {
    for (const layout of ["side", "below"] as const) {
      expect(chatSourceFor(layout, "twitch")).toBe("twitch")
      expect(chatSourceFor(layout, "lite")).toBe("lite")
    }
  })
})

describe("sizeFor", () => {
  test("reads the saved size for the layout", () => {
    const windowSizes = { ...defaultWindowSizes, side: { width: 900, height: 400 } }
    expect(sizeFor("side", { windowSizes })).toEqual({ width: 900, height: 400 })
    expect(sizeFor("video", { windowSizes })).toEqual({ width: 480, height: 270 })
  })

  test("every layout has a default size", () => {
    for (const layout of layouts) expect(sizeFor(layout, { windowSizes: defaultWindowSizes }).width).toBeGreaterThan(0)
  })
})
