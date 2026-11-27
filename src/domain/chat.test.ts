import { describe, expect, test } from "bun:test"
import { fromPrivmsg, readableColor, segments, toChatEvent } from "./chat.ts"
import { parseLine } from "./irc.ts"

const lala =
  "@badge-info=subscriber/12;badges=subscriber/12,campaign-39276140-822e14bb-3596-4a88-b934-d4dfa4bb8549-mw/1;client-nonce=574d5c4ceb164c9b8cd9c524c85a00ed;color=#FFA8E7;display-name=Lala_notz;emotes=;first-msg=0;flags=;id=a678c65d-88a1-47a2-bf0e-912b85a11ed8;mod=0;returning-chatter=0;room-id=39276140;subscriber=1;tmi-sent-ts=1795746055686;turbo=0;user-id=705364612;user-type= :lala_notz!lala_notz@lala_notz.tmi.twitch.tv PRIVMSG #rubius :adios"
const jrobert =
  "@badge-info=;badges=miami-chain/1;color=#FF4500;display-name=jrobert03;emotes=;first-msg=0;id=7d276d9c-407a-490a-aa9a-116fcae1a375;mod=0;room-id=39276140;subscriber=0;tmi-sent-ts=1795746055680;user-id=446470893;user-type= :jrobert03!jrobert03@jrobert03.tmi.twitch.tv PRIVMSG #rubius :BYE"

const line = (raw: string) => {
  const parsed = parseLine(raw)
  if (parsed === undefined) throw new Error(`unparsable: ${raw}`)
  return parsed
}

describe("fromPrivmsg", () => {
  test("real line with color", () => {
    expect(fromPrivmsg(line(lala))).toEqual({
      id: "a678c65d-88a1-47a2-bf0e-912b85a11ed8",
      login: "lala_notz",
      displayName: "Lala_notz",
      color: "#FFA8E7",
      segments: [{ kind: "text", text: "adios" }],
      isAction: false,
    })
  })

  test("second real line", () => {
    const message = fromPrivmsg(line(jrobert))
    expect(message?.displayName).toBe("jrobert03")
    expect(message?.segments).toEqual([{ kind: "text", text: "BYE" }])
  })

  test("/me ACTION is unwrapped", () => {
    const message = fromPrivmsg(line(":a!a@a.tmi.twitch.tv PRIVMSG #c :\u0001ACTION waves hello\u0001"))
    expect(message?.isAction).toBe(true)
    expect(message?.segments).toEqual([{ kind: "text", text: "waves hello" }])
  })

  test("invalid or missing color becomes undefined; empty display name falls back to login", () => {
    const bad = fromPrivmsg(line("@color=red;display-name=;id=1 :a!a@a.tmi.twitch.tv PRIVMSG #c :hi"))
    expect(bad?.color).toBeUndefined()
    expect(bad?.displayName).toBe("a")
    expect(fromPrivmsg(line("@color=#12345 :a!a@a.tmi.twitch.tv PRIVMSG #c :hi"))?.color).toBeUndefined()
    expect(fromPrivmsg(line("@color=#abcdef :a!a@a.tmi.twitch.tv PRIVMSG #c :hi"))?.color).toBe("#ABCDEF")
  })

  test("non PRIVMSG and incomplete lines give undefined", () => {
    expect(fromPrivmsg(line(":tmi.twitch.tv 001 x :Welcome"))).toBeUndefined()
    expect(fromPrivmsg(line("PRIVMSG #c :no prefix"))).toBeUndefined()
    expect(fromPrivmsg(line(":a!a@a PRIVMSG #c"))).toBeUndefined()
  })

  test("emotes tag drives segments", () => {
    const message = fromPrivmsg(line("@emotes=25:0-4,12-16;id=1 :a!a@a PRIVMSG #c :Kappa hello Kappa"))
    expect(message?.segments).toEqual([
      { kind: "emote", id: "25", name: "Kappa" },
      { kind: "text", text: " hello " },
      { kind: "emote", id: "25", name: "Kappa" },
    ])
  })
})

describe("segments", () => {
  test("no emotes is one text segment; empty text is none", () => {
    expect(segments("hello", "")).toEqual([{ kind: "text", text: "hello" }])
    expect(segments("", "")).toEqual([])
  })

  test("multiple emote ids, out of order in the tag", () => {
    expect(segments("Kappa PogChamp Kappa", "88:6-13/25:0-4,15-19")).toEqual([
      { kind: "emote", id: "25", name: "Kappa" },
      { kind: "text", text: " " },
      { kind: "emote", id: "88", name: "PogChamp" },
      { kind: "text", text: " " },
      { kind: "emote", id: "25", name: "Kappa" },
    ])
  })

  test("ranges count code points, not UTF-16 units", () => {
    expect(segments("😀 Kappa", "25:2-6")).toEqual([
      { kind: "text", text: "😀 " },
      { kind: "emote", id: "25", name: "Kappa" },
    ])
    expect(segments("a😀😀Kappa!", "25:3-7")).toEqual([
      { kind: "text", text: "a😀😀" },
      { kind: "emote", id: "25", name: "Kappa" },
      { kind: "text", text: "!" },
    ])
  })

  test("emote at the very end and adjacent emotes", () => {
    expect(segments("ab", "1:0-0/2:1-1")).toEqual([
      { kind: "emote", id: "1", name: "a" },
      { kind: "emote", id: "2", name: "b" },
    ])
  })

  test("bad ranges are ignored without throwing", () => {
    expect(segments("hello", "1:0-99")).toEqual([{ kind: "text", text: "hello" }])
    expect(segments("hello", "1:3-1")).toEqual([{ kind: "text", text: "hello" }])
    expect(segments("hello", "garbage/:1-2/1:a-b/1:")).toEqual([{ kind: "text", text: "hello" }])
    expect(segments("hello", "1:0-2,2:1-3")).toEqual([
      { kind: "emote", id: "1", name: "hel" },
      { kind: "text", text: "lo" },
    ])
  })
})

describe("toChatEvent", () => {
  test("PRIVMSG becomes a Message", () => {
    expect(toChatEvent(line(jrobert))?._tag).toBe("Message")
  })

  test("CLEARCHAT with a target user, and the whole-room variant", () => {
    expect(toChatEvent(line("@ban-duration=600;room-id=1;target-user-id=2 :tmi.twitch.tv CLEARCHAT #rubius :troll"))).toEqual({
      _tag: "ClearChat",
      channel: "rubius",
      login: "troll",
    })
    expect(toChatEvent(line("@room-id=1 :tmi.twitch.tv CLEARCHAT #rubius"))).toEqual({
      _tag: "ClearChat",
      channel: "rubius",
      login: undefined,
    })
  })

  test("CLEARMSG carries the target message id", () => {
    expect(toChatEvent(line("@login=troll;room-id=1;target-msg-id=abc-123 :tmi.twitch.tv CLEARMSG #rubius :bad words"))).toEqual({
      _tag: "ClearMsg",
      channel: "rubius",
      messageId: "abc-123",
    })
    expect(toChatEvent(line(":tmi.twitch.tv CLEARMSG #rubius :no id"))).toBeUndefined()
  })

  test("other commands are ignored", () => {
    expect(toChatEvent(line(":tmi.twitch.tv ROOMSTATE #rubius"))).toBeUndefined()
    expect(toChatEvent(line("PING :tmi.twitch.tv"))).toBeUndefined()
  })
})

describe("readableColor", () => {
  const contrastOf = (hex: string) => {
    const c = (i: number) => {
      const s = parseInt(hex.slice(i, i + 2), 16) / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return (0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5) + 0.05) / (0.0044 + 0.05)
  }

  test("bright colors are untouched (uppercased)", () => {
    expect(readableColor("#ffa8e7", "x")).toBe("#FFA8E7")
    expect(readableColor("#FF4500", "x")).toBe("#FF4500")
  })

  test("dark colors are lightened until readable", () => {
    for (const dark of ["#000000", "#0000FF", "#1A1A1A", "#8A2BE2"]) {
      const result = readableColor(dark, "x")
      expect(contrastOf(result)).toBeGreaterThanOrEqual(4.4)
      expect(result).toMatch(/^#[0-9A-F]{6}$/)
    }
    expect(readableColor("#000000", "x")).not.toBe("#000000")
  })

  test("missing or invalid color falls back deterministically by login", () => {
    expect(readableColor(undefined, "alice")).toBe(readableColor(undefined, "alice"))
    expect(readableColor("nope", "alice")).toBe(readableColor(undefined, "alice"))
    const colors = new Set(["a", "bb", "ccc", "dddd", "eeeee", "f", "g", "h"].map((l) => readableColor(undefined, l)))
    expect(colors.size).toBeGreaterThan(1)
    for (const c of colors) expect(contrastOf(c)).toBeGreaterThanOrEqual(4.4)
  })
})

describe("ROOMSTATE", () => {
  test("gives the room id", () => {
    expect(toChatEvent(line("@room-id=39276140;slow=0 :tmi.twitch.tv ROOMSTATE #rubius"))).toEqual({
      _tag: "Room",
      channelId: "39276140",
    })
  })

  test("without a room id gives nothing", () => {
    expect(toChatEvent(line("@slow=0 :tmi.twitch.tv ROOMSTATE #rubius"))).toBeUndefined()
  })
})
