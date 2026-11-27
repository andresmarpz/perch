import { Effect, ManagedRuntime, Stream } from "effect"
import { defaultWindowSizes } from "../domain/layout.ts"
import { defaults } from "../domain/settings.ts"
import { SettingsStore } from "../services/SettingsStore.ts"
import { mountOptions } from "../ui/options/index.ts"

const runtime = ManagedRuntime.make(SettingsStore.layer)

const program = Effect.gen(function*() {
  const root = document.getElementById("root")
  if (root === null) return
  const store = yield* SettingsStore
  const view = mountOptions(root, yield* store.get, {
    patch: (patch) => Effect.runPromise(store.set(patch)),
    resetSizes: () => Effect.runPromise(store.set({ windowSizes: defaultWindowSizes })),
    resetAll: () => Effect.runPromise(store.set(defaults)),
  })
  yield* store.changes.pipe(Stream.runForEach((settings) => Effect.sync(() => view.update(settings))))
})

runtime.runFork(program)
window.addEventListener("pagehide", () => void runtime.dispose())
