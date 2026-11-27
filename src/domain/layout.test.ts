import { describe, expect, test } from "bun:test"
import { chatSourceFor } from "./layout.ts"

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
