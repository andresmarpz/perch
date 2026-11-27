import { describe, expect, test } from "bun:test"
import { parseRoute, sameRoute, type Route } from "./channel.ts"

const channel = (name: string): Route => ({ _tag: "Channel", channel: name })
const other: Route = { _tag: "Other" }

describe("parseRoute", () => {
  test("channel pages on both hosts", () => {
    expect(parseRoute("https://www.twitch.tv/rubius")).toEqual(channel("rubius"))
    expect(parseRoute("https://twitch.tv/rubius")).toEqual(channel("rubius"))
  })

  test("lowercases, ignores trailing slash, query and hash", () => {
    expect(parseRoute("https://www.twitch.tv/RuBiUs/")).toEqual(channel("rubius"))
    expect(parseRoute("https://www.twitch.tv/rubius?sr=a&foo=1#x")).toEqual(channel("rubius"))
  })

  test("reserved paths are not channels", () => {
    for (const name of ["directory", "videos", "settings", "subscriptions", "inventory", "wallet", "drops", "downloads", "jobs", "p", "search", "turbo", "friends", "messages", "moderator", "popout", "embed", "u"]) {
      expect(parseRoute(`https://www.twitch.tv/${name}`)).toEqual(other)
    }
  })

  test("sub pages are not channel pages", () => {
    expect(parseRoute("https://www.twitch.tv/rubius/videos")).toEqual(other)
    expect(parseRoute("https://www.twitch.tv/rubius/clip/FooBar")).toEqual(other)
    expect(parseRoute("https://www.twitch.tv/rubius/about")).toEqual(other)
    expect(parseRoute("https://www.twitch.tv/videos/12345")).toEqual(other)
    expect(parseRoute("https://www.twitch.tv/directory/all")).toEqual(other)
  })

  test("root, foreign hosts and garbage", () => {
    expect(parseRoute("https://www.twitch.tv/")).toEqual(other)
    expect(parseRoute("https://www.twitch.tv")).toEqual(other)
    expect(parseRoute("https://example.com/rubius")).toEqual(other)
    expect(parseRoute("https://clips.twitch.tv/rubius")).toEqual(other)
    expect(parseRoute("not a url")).toEqual(other)
    expect(parseRoute("")).toEqual(other)
  })

  test("channel names are 1..25 of [a-z0-9_]", () => {
    expect(parseRoute(`https://www.twitch.tv/${"a".repeat(25)}`)).toEqual(channel("a".repeat(25)))
    expect(parseRoute(`https://www.twitch.tv/${"a".repeat(26)}`)).toEqual(other)
    expect(parseRoute("https://www.twitch.tv/bad-name")).toEqual(other)
    expect(parseRoute("https://www.twitch.tv/a")).toEqual(channel("a"))
  })
})

describe("sameRoute", () => {
  test("compares tag and channel", () => {
    expect(sameRoute(channel("a"), channel("a"))).toBe(true)
    expect(sameRoute(channel("a"), channel("b"))).toBe(false)
    expect(sameRoute(other, other)).toBe(true)
    expect(sameRoute(channel("a"), other)).toBe(false)
  })
})
