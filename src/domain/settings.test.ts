import { describe, expect, test } from "bun:test"
import { defaults, decodeSettings, limits, type Settings } from "./settings.ts"

describe("decodeSettings", () => {
  test("non-objects give the defaults", () => {
    for (const input of [undefined, null, 42, "x", [], true]) expect(decodeSettings(input)).toEqual(defaults)
  })

  test("empty object gives the defaults", () => {
    expect(decodeSettings({})).toEqual(defaults)
  })

  test("a full valid value round trips", () => {
    const value: Settings = {
      layout: "overlay",
      chatSource: "lite",
      chatFontSize: 18,
      overlayOpacity: 0.5,
      hotkey: "Ctrl+Alt+K",
      autoPip: true,
      pipQuality: "twitch",
      sevenTv: false,
      windowSize: { width: 800, height: 320 },
    }
    expect(decodeSettings(value)).toEqual(value)
  })

  test("one corrupt field never discards the others", () => {
    const result = decodeSettings({ layout: "sideways", chatSource: "lite", chatFontSize: "big", autoPip: true })
    expect(result.layout).toBe(defaults.layout)
    expect(result.chatSource).toBe("lite")
    expect(result.chatFontSize).toBe(defaults.chatFontSize)
    expect(result.autoPip).toBe(true)
  })

  test("pipQuality defaults to max and falls back when invalid", () => {
    expect(defaults.pipQuality).toBe("max")
    expect(decodeSettings({ pipQuality: "twitch" }).pipQuality).toBe("twitch")
    expect(decodeSettings({ pipQuality: "ultra" }).pipQuality).toBe("max")
    expect(decodeSettings({ pipQuality: 3 }).pipQuality).toBe("max")
  })

  test("numbers are clamped into range", () => {
    expect(decodeSettings({ chatFontSize: 2 }).chatFontSize).toBe(limits.chatFontSize.min)
    expect(decodeSettings({ chatFontSize: 99 }).chatFontSize).toBe(limits.chatFontSize.max)
    expect(decodeSettings({ chatFontSize: 13.6 }).chatFontSize).toBe(14)
    expect(decodeSettings({ overlayOpacity: 0 }).overlayOpacity).toBe(limits.overlayOpacity.min)
    expect(decodeSettings({ overlayOpacity: 5 }).overlayOpacity).toBe(limits.overlayOpacity.max)
    expect(decodeSettings({ chatFontSize: Number.NaN }).chatFontSize).toBe(defaults.chatFontSize)
    expect(decodeSettings({ overlayOpacity: Infinity }).overlayOpacity).toBe(defaults.overlayOpacity)
  })

  test("invalid hotkey falls back; valid one is normalized", () => {
    expect(decodeSettings({ hotkey: "P" }).hotkey).toBe(defaults.hotkey)
    expect(decodeSettings({ hotkey: 5 }).hotkey).toBe(defaults.hotkey)
    expect(decodeSettings({ hotkey: "shift+alt+k" }).hotkey).toBe("Alt+Shift+K")
  })

  test("window size decodes per dimension and is clamped", () => {
    expect(decodeSettings({ windowSize: { width: 900, height: "tall" } }).windowSize).toEqual({
      width: 900,
      height: defaults.windowSize.height,
    })
    expect(decodeSettings({ windowSize: { width: 1, height: 99999 } }).windowSize).toEqual({
      width: limits.windowWidth.min,
      height: limits.windowHeight.max,
    })
  })

  test("an old per-layout value migrates its side entry", () => {
    const old = { windowSizes: { video: { width: 480, height: 270 }, side: { width: 900, height: 400 } } }
    expect(decodeSettings(old).windowSize).toEqual({ width: 900, height: 400 })
    expect(decodeSettings({ windowSizes: "nope" }).windowSize).toEqual(defaults.windowSize)
  })

  test("unknown fields are dropped", () => {
    expect("extra" in decodeSettings({ extra: 1 })).toBe(false)
  })
})
