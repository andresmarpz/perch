import { describe, expect, test } from "bun:test"
import { formatHotkey, matches, parseHotkey, type KeyEventLike } from "./hotkey.ts"

const event = (over: Partial<KeyEventLike>): KeyEventLike => ({
  key: "",
  code: "",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
})

describe("parseHotkey", () => {
  test("default hotkey", () => {
    expect(parseHotkey("Alt+Shift+P")).toEqual({ ctrl: false, alt: true, shift: true, meta: false, key: "P" })
  })

  test("case, order and aliases are normalized", () => {
    expect(parseHotkey("shift+option+p")).toEqual(parseHotkey("Alt+Shift+P"))
    expect(parseHotkey("cmd+k")).toEqual({ ctrl: false, alt: false, shift: false, meta: true, key: "K" })
    expect(parseHotkey(" Ctrl + 1 ")).toEqual({ ctrl: true, alt: false, shift: false, meta: false, key: "1" })
  })

  test("function and named keys", () => {
    expect(parseHotkey("Alt+F5")?.key).toBe("F5")
    expect(parseHotkey("Ctrl+space")?.key).toBe("Space")
    expect(parseHotkey("Alt+ArrowUp")?.key).toBe("ArrowUp")
  })

  test("rejects hotkeys without a modifier", () => {
    expect(parseHotkey("P")).toBeUndefined()
    expect(parseHotkey("F5")).toBeUndefined()
  })

  test("rejects Shift-only because it would hijack typing", () => {
    expect(parseHotkey("Shift+P")).toBeUndefined()
  })

  test("rejects garbage, duplicates and unknown keys", () => {
    for (const bad of ["", "+", "Alt+", "Alt+Alt+P", "Foo+P", "Alt+PP", "Alt+F13", "Alt+Shift", "Alt++P"]) {
      expect(parseHotkey(bad)).toBeUndefined()
    }
  })
})

describe("formatHotkey", () => {
  test("canonical order and round trip", () => {
    const hotkey = parseHotkey("meta+shift+ctrl+alt+x")
    expect(hotkey && formatHotkey(hotkey)).toBe("Ctrl+Alt+Shift+Meta+X")
    const again = parseHotkey("Alt+Shift+P")
    expect(again && formatHotkey(again)).toBe("Alt+Shift+P")
  })
})

describe("matches", () => {
  const hotkey = parseHotkey("Alt+Shift+P")!

  test("uses code so macOS Alt (which changes key) still matches", () => {
    expect(matches(hotkey, event({ key: "∏", code: "KeyP", altKey: true, shiftKey: true }))).toBe(true)
    expect(matches(hotkey, event({ key: "P", code: "KeyP", altKey: true, shiftKey: true }))).toBe(true)
  })

  test("modifiers must match exactly", () => {
    expect(matches(hotkey, event({ code: "KeyP", altKey: true }))).toBe(false)
    expect(matches(hotkey, event({ code: "KeyP", altKey: true, shiftKey: true, ctrlKey: true }))).toBe(false)
    expect(matches(hotkey, event({ code: "KeyP", shiftKey: true }))).toBe(false)
  })

  test("other keys do not match", () => {
    expect(matches(hotkey, event({ code: "KeyO", altKey: true, shiftKey: true }))).toBe(false)
  })

  test("digits, function keys and named keys", () => {
    expect(matches(parseHotkey("Ctrl+1")!, event({ code: "Digit1", ctrlKey: true }))).toBe(true)
    expect(matches(parseHotkey("Alt+F5")!, event({ code: "F5", altKey: true }))).toBe(true)
    expect(matches(parseHotkey("Alt+Space")!, event({ code: "Space", altKey: true }))).toBe(true)
  })

  test("falls back to key when code is empty", () => {
    expect(matches(hotkey, event({ key: "p", altKey: true, shiftKey: true }))).toBe(true)
  })
})
