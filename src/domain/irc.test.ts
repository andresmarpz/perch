import { describe, expect, test } from "bun:test"
import { nickOf, parseLine, splitFrame, unescapeTag } from "./irc.ts"

const privmsg =
  "@badge-info=subscriber/12;badges=subscriber/12,campaign-39276140-822e14bb-3596-4a88-b934-d4dfa4bb8549-mw/1;client-nonce=574d5c4ceb164c9b8cd9c524c85a00ed;color=#FFA8E7;display-name=Lala_notz;emotes=;first-msg=0;flags=;id=a678c65d-88a1-47a2-bf0e-912b85a11ed8;mod=0;returning-chatter=0;room-id=39276140;subscriber=1;tmi-sent-ts=1795746055686;turbo=0;user-id=705364612;user-type= :lala_notz!lala_notz@lala_notz.tmi.twitch.tv PRIVMSG #rubius :adios"

describe("parseLine", () => {
  test("tagged PRIVMSG from a real frame", () => {
    const line = parseLine(privmsg)
    expect(line?.command).toBe("PRIVMSG")
    expect(line?.params).toEqual(["#rubius"])
    expect(line?.trailing).toBe("adios")
    expect(line?.prefix).toBe("lala_notz!lala_notz@lala_notz.tmi.twitch.tv")
    expect(line?.tags["display-name"]).toBe("Lala_notz")
    expect(line?.tags["color"]).toBe("#FFA8E7")
    expect(line?.tags["emotes"]).toBe("")
    expect(line?.tags["user-type"]).toBe("")
  })

  test("untagged server lines", () => {
    const line = parseLine(":tmi.twitch.tv CAP * ACK :twitch.tv/tags twitch.tv/commands")
    expect(line).toEqual({
      tags: {},
      prefix: "tmi.twitch.tv",
      command: "CAP",
      params: ["*", "ACK"],
      trailing: "twitch.tv/tags twitch.tv/commands",
    })
    expect(parseLine(":tmi.twitch.tv 001 justinfan77450 :Welcome, GLHF!")?.params).toEqual(["justinfan77450"])
  })

  test("ROOMSTATE has tags and no trailing", () => {
    const line = parseLine(
      "@emote-only=0;followers-only=43200;r9k=0;room-id=39276140;slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #rubius",
    )
    expect(line?.command).toBe("ROOMSTATE")
    expect(line?.trailing).toBeUndefined()
    expect(line?.tags["followers-only"]).toBe("43200")
  })

  test("PING without prefix", () => {
    expect(parseLine("PING :tmi.twitch.tv")).toEqual({
      tags: {},
      prefix: undefined,
      command: "PING",
      params: [],
      trailing: "tmi.twitch.tv",
    })
  })

  test("colon inside the trailing text stays", () => {
    const line = parseLine(":a!a@a.tmi.twitch.tv PRIVMSG #c :hello :) a :b")
    expect(line?.trailing).toBe("hello :) a :b")
  })

  test("trailing CRLF is dropped", () => {
    expect(parseLine("PING :x\r\n")?.trailing).toBe("x")
  })

  test("malformed input returns undefined and never throws", () => {
    for (const bad of ["", "   ", "@tags-only", ":prefix-only", "@a=b", ":", "@"]) {
      expect(parseLine(bad)).toBeUndefined()
    }
  })
})

describe("unescapeTag", () => {
  test("handles the five IRCv3 escapes", () => {
    expect(unescapeTag("a\\sb\\:c\\\\d\\re\\nf")).toBe("a b;c\\d\re\nf")
  })

  test("drops a lone trailing backslash and keeps unknown escapes", () => {
    expect(unescapeTag("a\\")).toBe("a")
    expect(unescapeTag("a\\xb")).toBe("axb")
  })

  test("applies inside parsed tags", () => {
    const line = parseLine("@reply-parent-msg-body=hi\\sthere\\:\\sfriend :t PRIVMSG #c :x")
    expect(line?.tags["reply-parent-msg-body"]).toBe("hi there; friend")
  })
})

describe("splitFrame", () => {
  test("splits on CRLF and drops empties", () => {
    expect(splitFrame("PING :a\r\n:tmi.twitch.tv 001 x :hi\r\n")).toEqual(["PING :a", ":tmi.twitch.tv 001 x :hi"])
    expect(splitFrame("")).toEqual([])
    expect(splitFrame("\r\n\r\n")).toEqual([])
  })

  test("multi-line frame parses into separate lines", () => {
    const frame = `${privmsg}\r\n:tmi.twitch.tv 001 justinfan77450 :Welcome, GLHF!\r\n`
    const parsed = splitFrame(frame).map(parseLine)
    expect(parsed.map((l) => l?.command)).toEqual(["PRIVMSG", "001"])
  })
})

describe("nickOf", () => {
  test("extracts the nick before the bang", () => {
    expect(nickOf("lala_notz!lala_notz@lala_notz.tmi.twitch.tv")).toBe("lala_notz")
    expect(nickOf("tmi.twitch.tv")).toBeUndefined()
    expect(nickOf(undefined)).toBeUndefined()
  })
})
