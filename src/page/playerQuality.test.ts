import { describe, expect, test } from "bun:test"
import type { QualityLike } from "../domain/quality.ts"
import { makeQualityControl, type PlayerLike } from "./playerQuality.ts"

const qualities: ReadonlyArray<QualityLike> = [
  { group: "480p30", height: 480 },
  { group: "chunked", height: 1080 },
]

const fakePlayer = (quality: QualityLike = qualities[0]!, auto = true) => {
  const state = { quality, auto, calls: [] as Array<string> }
  const player: PlayerLike = {
    getQualities: () => qualities,
    getQuality: () => state.quality,
    setQuality: (next) => {
      state.quality = next
      state.calls.push(`quality:${next.group}`)
    },
    isAutoQualityMode: () => state.auto,
    setAutoQualityMode: (next) => {
      state.auto = next
      state.calls.push(`auto:${next}`)
    },
  }
  return { state, player }
}

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

describe("makeQualityControl", () => {
  test("enforce picks the top quality with auto off and restore brings back the old state", () => {
    const { state, player } = fakePlayer()
    const control = makeQualityControl(() => player, memoryStorage())
    expect(control.enforce()).toBe("ok")
    expect(state).toMatchObject({ auto: false, quality: { group: "chunked" } })
    control.restore()
    expect(state).toMatchObject({ auto: true, quality: { group: "480p30" } })
  })

  test("enforce twice only calls the player once", () => {
    const { state, player } = fakePlayer()
    const control = makeQualityControl(() => player, memoryStorage())
    control.enforce()
    const calls = state.calls.length
    control.enforce()
    expect(state.calls.length).toBe(calls)
  })

  test("restore puts back the saved quality key even when the player rewrote it", () => {
    const { player } = fakePlayer()
    const storage = memoryStorage({ "video-quality": "old" })
    const control = makeQualityControl(() => player, storage)
    control.enforce()
    storage.setItem("video-quality", "chunked")
    control.restore()
    expect(storage.getItem("video-quality")).toBe("old")
  })

  test("restore removes a saved quality key that did not exist before", () => {
    const { player } = fakePlayer()
    const storage = memoryStorage()
    const control = makeQualityControl(() => player, storage)
    control.enforce()
    storage.setItem("video-quality", "chunked")
    control.restore()
    expect(storage.data.has("video-quality")).toBe(false)
  })

  test("no player gives no-player and a restore with nothing saved does nothing", () => {
    const control = makeQualityControl(() => null, memoryStorage())
    expect(control.enforce()).toBe("no-player")
    expect(() => control.restore()).not.toThrow()
  })

  test("a player that throws is reported as unsupported", () => {
    const { player } = fakePlayer()
    const broken: PlayerLike = { ...player, getQuality: () => { throw new Error("changed") } }
    expect(makeQualityControl(() => broken, memoryStorage()).enforce()).toBe("unsupported")
  })
})
