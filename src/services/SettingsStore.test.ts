import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { defaults, type Settings } from "../domain/settings.ts"
import { SettingsStore } from "./SettingsStore.ts"

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const makeArea = (options: { readonly failReads?: boolean } = {}) => {
  const state: { stored: unknown; writes: number } = { stored: undefined, writes: 0 }
  const area = {
    get: async (key: string) => {
      await wait(5)
      if (options.failReads === true) throw new Error("storage unavailable")
      return state.stored === undefined ? {} : { [key]: state.stored }
    },
    set: async (items: Record<string, unknown>) => {
      await wait(5)
      state.writes += 1
      state.stored = items["settings"]
    },
    onChanged: { addListener: () => undefined, removeListener: () => undefined },
  } as unknown as chrome.storage.SyncStorageArea
  return { state, area }
}

const withStore = <A, E>(area: chrome.storage.SyncStorageArea, body: (store: SettingsStore["Service"]) => Effect.Effect<A, E>) =>
  Effect.runPromiseExit(
    Effect.gen(function*() {
      return yield* body(yield* SettingsStore)
    }).pipe(Effect.provide(SettingsStore.layerWith(area))),
  )

describe("SettingsStore", () => {
  test("concurrent patches of different fields all survive", async () => {
    const { area, state } = makeArea()
    await withStore(area, (store) =>
      Effect.all([store.set({ layout: "below" }), store.set({ chatSource: "lite" }), store.set({ autoPip: true })], {
        concurrency: "unbounded",
      }))
    const stored = state.stored as Settings
    expect([stored.layout, stored.chatSource, stored.autoPip]).toEqual(["below", "lite", true])
  })

  test("concurrent updates each see the previous result", async () => {
    const { area, state } = makeArea()
    await withStore(area, (store) =>
      Effect.all(
        Array.from({ length: 5 }, () => store.update((s) => ({ ...s, chatFontSize: s.chatFontSize + 1 }))),
        { concurrency: "unbounded" },
      ))
    expect((state.stored as Settings).chatFontSize).toBe(defaults.chatFontSize + 5)
  })

  test("set and update fail without writing when the read fails", async () => {
    const { area, state } = makeArea({ failReads: true })
    const set = await withStore(area, (store) => store.set({ layout: "below" }))
    const update = await withStore(area, (store) => store.update((s) => s))
    expect(Exit.isFailure(set)).toBe(true)
    expect(Exit.isFailure(update)).toBe(true)
    expect(state.writes).toBe(0)
  })

  test("get falls back to defaults when the read fails", async () => {
    const { area } = makeArea({ failReads: true })
    const exit = await withStore(area, (store) => store.get)
    expect(Exit.isSuccess(exit) && exit.value).toEqual(defaults)
  })
})
