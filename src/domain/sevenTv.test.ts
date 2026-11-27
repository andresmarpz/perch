import { describe, expect, test } from "bun:test"
import { segments, withSevenTv, type Segment } from "./chat.ts"
import { decodeGlobalSet, decodeUserSet, mergeEmotes } from "./sevenTv.ts"

const emote = (id: string, name: string, flags = 0, extra: object = {}) => ({
  id,
  name,
  flags,
  data: { flags: 0, host: { files: [{ name: "1x.webp", width: 28, height: 32 }] }, ...extra },
})

describe("decode", () => {
  test("keeps good emotes and drops bad ones", () => {
    const set = decodeGlobalSet({
      emotes: [emote("AAA", "Good"), { id: 5 }, null, emote("BBB", "has space"), emote("../x", "Bad"), emote("CCC", "Flag", 1)],
    })
    expect([...set.keys()]).toEqual(["Good", "Flag"])
    expect(set.get("Good")).toEqual({ id: "AAA", url: "https://cdn.7tv.app/emote/AAA/2x.webp", width: 28, height: 32, zeroWidth: false })
    expect(set.get("Flag")?.zeroWidth).toBe(true)
  })

  test("data flags mark zero width; missing files fall back to 32x32", () => {
    const set = decodeGlobalSet({ emotes: [{ id: "ZZ", name: "ZW", data: { flags: 256 } }] })
    expect(set.get("ZW")).toMatchObject({ zeroWidth: true, width: 32, height: 32 })
  })

  test("garbage in gives an empty set", () => {
    expect(decodeGlobalSet(undefined).size).toBe(0)
    expect(decodeUserSet({ emote_set: null }).size).toBe(0)
    expect(decodeUserSet({ emote_set: { emotes: "no" } }).size).toBe(0)
  })

  test("channel emote wins over a global one", () => {
    const merged = mergeEmotes(
      decodeGlobalSet({ emotes: [emote("G1", "Same"), emote("G2", "Only")] }),
      decodeUserSet({ emote_set: { emotes: [emote("C1", "Same")] } }),
    )
    expect(merged.get("Same")?.id).toBe("C1")
    expect(merged.get("Only")?.id).toBe("G2")
  })
})

describe("withSevenTv", () => {
  const emotes = decodeGlobalSet({ emotes: [emote("A1", "KEKW"), emote("Z1", "Wide", 1), emote("A2", "Kappa")] })
  const run = (text: string, tag = ""): ReadonlyArray<Segment> => withSevenTv(segments(text, tag), emotes)

  test("matches whole space-separated tokens only", () => {
    const out = run("hi KEKW KEKWs")
    expect(out.map((s) => s.kind)).toEqual(["text", "sevenTv", "text"])
    expect(out[0]).toEqual({ kind: "text", text: "hi " })
    expect(out[2]).toEqual({ kind: "text", text: " KEKWs" })
  })

  test("Twitch emote ranges keep priority", () => {
    const out = run("Kappa KEKW", "25:0-4")
    expect(out.map((s) => s.kind)).toEqual(["emote", "text", "sevenTv"])
  })

  test("zero-width emote stacks on the previous emote, twitch or 7TV", () => {
    const out = run("KEKW Wide Wide")
    expect(out).toHaveLength(1)
    expect(out[0]?.kind === "stack" && out[0].overlays).toHaveLength(2)
    const onTwitch = run("Kappa Wide", "25:0-4")
    expect(onTwitch[0]).toMatchObject({ kind: "stack", base: { kind: "emote" } })
  })

  test("zero-width emote with no emote before it stands alone", () => {
    expect(run("hello Wide").map((s) => s.kind)).toEqual(["text", "sevenTv"])
    expect(run("Wide")[0]?.kind).toBe("sevenTv")
  })

  test("empty set returns the input untouched", () => {
    const input = segments("KEKW", "")
    expect(withSevenTv(input, new Map())).toBe(input)
  })
})
