import { describe, expect, test } from "bun:test"
import { cancelReplay, keepPlaying, moveVideoIn } from "./videoHandoff.ts"

class FakeVideo extends EventTarget {
  parentElement = null
  nextSibling = null
  removed = false
  paused = true
  plays = 0
  stubborn = false
  play() {
    this.plays += 1
    if (!this.stubborn) {
      this.paused = false
      this.dispatchEvent(new Event("playing"))
    }
    return Promise.resolve()
  }
  remove() {
    this.removed = true
  }
  userPause() {
    this.paused = true
    this.dispatchEvent(new Event("pause"))
  }
}

const asVideo = (video: FakeVideo) => video as unknown as HTMLVideoElement
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe("keepPlaying", () => {
  test("replays at every delay while the video stays paused", async () => {
    const video = new FakeVideo()
    video.stubborn = true
    keepPlaying(asVideo(video), [0, 15, 30])
    await wait(80)
    expect(video.plays).toBe(3)
  })

  test("stops replaying once the video resumed and then paused", async () => {
    const video = new FakeVideo()
    keepPlaying(asVideo(video), [0, 20, 40])
    await wait(5)
    expect(video.plays).toBe(1)
    video.userPause()
    await wait(80)
    expect(video.plays).toBe(1)
    expect(video.paused).toBe(true)
  })

  test("a pause before the first resume does not cancel the replays", async () => {
    const video = new FakeVideo()
    video.stubborn = true
    keepPlaying(asVideo(video), [10, 20])
    video.dispatchEvent(new Event("pause"))
    await wait(60)
    expect(video.plays).toBe(2)
  })

  test("cancelReplay drops the replays that have not run", async () => {
    const video = new FakeVideo()
    video.stubborn = true
    keepPlaying(asVideo(video), [0, 20, 40])
    await wait(5)
    cancelReplay(asVideo(video))
    await wait(80)
    expect(video.plays).toBe(1)
  })

  test("a new run replaces the previous one for the same video", async () => {
    const video = new FakeVideo()
    video.stubborn = true
    keepPlaying(asVideo(video), [20, 40])
    keepPlaying(asVideo(video), [20])
    await wait(80)
    expect(video.plays).toBe(1)
  })
})

describe("moveVideoIn", () => {
  test("ending the session drops the replays that have not run yet", async () => {
    const globals = globalThis as unknown as { document?: unknown }
    globals.document = { querySelector: () => null, querySelectorAll: () => [] }
    try {
      const video = new FakeVideo()
      video.paused = false
      video.stubborn = true
      const stage = { append: () => undefined } as unknown as HTMLElement
      const handoff = moveVideoIn(asVideo(video), stage)
      video.paused = true
      handoff.restore()
      await wait(80)
      expect(video.plays).toBe(0)
      expect(video.removed).toBe(true)
    } finally {
      delete globals.document
    }
  })
})
