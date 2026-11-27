import { describe, expect, test } from "bun:test"
import type { ChatMessage } from "./chat.ts"
import { applyChatEvent, isNearBottom, removedIds } from "./chatLog.ts"

const msg = (id: string, login = "alice"): ChatMessage => ({
  id,
  channel: "c",
  login,
  displayName: login,
  color: undefined,
  text: id,
  segments: [{ kind: "text", text: id }],
  badges: [],
  isAction: false,
  timestamp: 0,
})

const add = (log: ReadonlyArray<ChatMessage>, m: ChatMessage, max?: number) =>
  applyChatEvent(log, { _tag: "Message", message: m }, max)

describe("applyChatEvent", () => {
  test("appends messages and keeps order", () => {
    expect(add(add([], msg("1")), msg("2")).map((m) => m.id)).toEqual(["1", "2"])
  })

  test("keeps only the newest max lines", () => {
    let log: ReadonlyArray<ChatMessage> = []
    for (let i = 0; i < 160; i++) log = add(log, msg(String(i)))
    expect(log).toHaveLength(150)
    expect(log[0]?.id).toBe("10")
    expect(log[149]?.id).toBe("159")
  })

  test("ignores a repeated message id", () => {
    const log = add([], msg("1"))
    expect(add(log, msg("1"))).toBe(log)
  })

  test("ClearChat without a login empties the log", () => {
    const log = add(add([], msg("1")), msg("2", "bob"))
    expect(applyChatEvent(log, { _tag: "ClearChat", channel: "c", login: undefined })).toEqual([])
  })

  test("ClearChat with a login removes only that user", () => {
    const log = add(add(add([], msg("1")), msg("2", "bob")), msg("3"))
    const next = applyChatEvent(log, { _tag: "ClearChat", channel: "c", login: "alice" })
    expect(next.map((m) => m.id)).toEqual(["2"])
  })

  test("ClearMsg removes one message", () => {
    const log = add(add([], msg("1")), msg("2"))
    const next = applyChatEvent(log, { _tag: "ClearMsg", channel: "c", messageId: "1" })
    expect(next.map((m) => m.id)).toEqual(["2"])
  })
})

describe("removedIds", () => {
  test("lists lines that dropped out", () => {
    const before = [msg("1"), msg("2"), msg("3")]
    expect(removedIds(before, [msg("3")])).toEqual(["1", "2"])
  })
})

describe("isNearBottom", () => {
  test("true within the slack", () => {
    expect(isNearBottom({ scrollTop: 480, clientHeight: 100, scrollHeight: 600 })).toBe(true)
  })
  test("false when scrolled up", () => {
    expect(isNearBottom({ scrollTop: 100, clientHeight: 100, scrollHeight: 600 })).toBe(false)
  })
})
