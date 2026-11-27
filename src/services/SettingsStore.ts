import { Context, Effect, Layer, Queue, Semaphore, Stream } from "effect"
import { decodeSettings, defaults, type Settings } from "../domain/settings.ts"
import { SettingsReadFailed, SettingsWriteFailed } from "./errors.ts"

const storageKey = "settings"

export class SettingsStore extends Context.Service<SettingsStore, {
  readonly get: Effect.Effect<Settings>
  set(patch: Partial<Settings>): Effect.Effect<Settings, SettingsReadFailed | SettingsWriteFailed>
  update(f: (settings: Settings) => Settings): Effect.Effect<Settings, SettingsReadFailed | SettingsWriteFailed>
  readonly changes: Stream.Stream<Settings>
}>()("twitch-pip/services/SettingsStore") {
  static readonly layerWith = (area: chrome.storage.SyncStorageArea) =>
    Layer.succeed(SettingsStore, makeStore(area))

  static readonly layer = Layer.suspend(() => SettingsStore.layerWith(chrome.storage.sync))
}

const makeStore = (area: chrome.storage.SyncStorageArea) => {
  const read = Effect.tryPromise({
    try: () => area.get(storageKey),
    catch: (cause) => new SettingsReadFailed({ cause }),
  }).pipe(Effect.map((items) => decodeSettings(items[storageKey])))

  const get = read.pipe(
    Effect.catch((error) => Effect.logWarning("settings read failed, showing defaults", error).pipe(Effect.as(defaults))),
  )

  const lock = Semaphore.makeUnsafe(1)

  const update = (f: (settings: Settings) => Settings) =>
    lock.withPermits(1)(
      Effect.gen(function*() {
        const next = decodeSettings(f(yield* read))
        yield* Effect.tryPromise({
          try: () => area.set({ [storageKey]: next }),
          catch: (cause) => new SettingsWriteFailed({ cause }),
        })
        return next
      }),
    )

  const set = (patch: Partial<Settings>) => update((current) => ({ ...current, ...patch }))

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

  return SettingsStore.of({ get, set, update, changes })
}
