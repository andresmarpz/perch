import { describe, expect, test } from "bun:test"
import { pickHighest } from "./quality.ts"

describe("pickHighest", () => {
  test("Source (chunked) wins even when another entry looks taller", () => {
    const list = [
      { group: "720p60", height: 720 },
      { group: "chunked", height: 1080 },
      { group: "1440p60", height: 1440 },
    ]
    expect(pickHighest(list)?.group).toBe("chunked")
  })

  test("without Source the tallest wins, then the higher frame rate", () => {
    const list = [
      { group: "720p30", height: 720, framerate: 30 },
      { group: "720p60", height: 720, framerate: 60 },
      { group: "480p30", height: 480, framerate: 30 },
    ]
    expect(pickHighest(list)?.group).toBe("720p60")
  })

  test("auto and audio-only entries are never picked", () => {
    expect(pickHighest([{ group: "auto", height: 9999 }, { group: "audio_only", height: 0 }])).toBeUndefined()
    expect(pickHighest([{ group: "audio_only" }, { group: "160p30", height: 160 }])?.group).toBe("160p30")
  })

  test("an empty list gives nothing", () => {
    expect(pickHighest([])).toBeUndefined()
  })
})
