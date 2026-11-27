import { Context, Effect, Layer, Queue, Stream } from "effect"
import { decodeSettings, defaults, type Settings } from "../domain/settings.ts"
import { SettingsWriteFailed } from "./errors.ts"

const storageKey = "settings"

export class SettingsStore extends Context.Service<SettingsStore, {
  readonly get: Effect.Effect<Settings>
  set(patch: Partial<Settings>): Effect.Effect<Settings, SettingsWriteFailed>
  readonly changes: Stream.Stream<Settings>
}>()("twitch-pip/services/SettingsStore") {
  static readonly layerWith = (area: chrome.storage.SyncStorageArea) =>
    Layer.succeed(SettingsStore, makeStore(area))

  static readonly layer = Layer.suspend(() => SettingsStore.layerWith(chrome.storage.sync))
}

const makeStore = (area: chrome.storage.SyncStorageArea) => {
  const get = Effect.tryPromise({
    try: () => area.get(storageKey),
    catch: (cause) => cause,
  }).pipe(
    Effect.map((items) => decodeSettings(items[storageKey])),
    Effect.catch((cause) => Effect.logWarning("settings read failed, using defaults", cause).pipe(Effect.as(defaults))),
  )

  const set = Effect.fn("SettingsStore.set")(function*(patch: Partial<Settings>) {
    const next = decodeSettings({ ...(yield* get), ...patch })
    yield* Effect.tryPromise({
      try: () => area.set({ [storageKey]: next }),
      catch: (cause) => new SettingsWriteFailed({ cause }),
    })
    return next
  })

  const changes = Stream.callback<Settings>(
    Effect.fn(function*(queue) {
      const listener = (changed: { readonly [key: string]: chrome.storage.StorageChange }) => {
        const change = changed[storageKey]
        if (change !== undefined) Queue.offerUnsafe(queue, decodeSettings(change.newValue))
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => area.onChanged.addListener(listener)),
        () => Effect.sync(() => area.onChanged.removeListener(listener)),
      )
    }),
    { bufferSize: 16, strategy: "sliding" },
  )

  return SettingsStore.of({ get, set, changes })
}
