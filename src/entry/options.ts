import { Effect, ManagedRuntime, Stream } from "effect"
import { defaultWindowSize } from "../domain/layout.ts"
import { defaults } from "../domain/settings.ts"
import { SettingsStore } from "../services/SettingsStore.ts"
import { mountOptions } from "../ui/options/index.ts"

const runtime = ManagedRuntime.make(SettingsStore.layer)

const run = <A, E>(effect: Effect.Effect<A, E, SettingsStore>) =>
  runtime.runPromise(effect.pipe(Effect.tapCause((cause) => Effect.logError("twitch-pip options: task failed", cause))))

const program = Effect.gen(function*() {
  const root = document.getElementById("root")
  if (root === null) return
  const store = yield* SettingsStore
  const view = mountOptions(root, yield* store.get, {
    patch: (patch) => run(store.set(patch)),
    resetSizes: () => run(store.set({ windowSize: defaultWindowSize })),
    resetAll: () => run(store.set(defaults)),
  })
  yield* store.changes.pipe(Stream.runForEach((settings) => Effect.sync(() => view.update(settings))))
})

runtime.runFork(program)
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) void runtime.dispose()
})
