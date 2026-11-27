import { Cause, Effect, Exit, Layer, ManagedRuntime, Scope, Stream } from "effect"
import { parseRoute } from "../domain/channel.ts"
import { matches, parseHotkey } from "../domain/hotkey.ts"
import { type Settings } from "../domain/settings.ts"
import { LiteChat } from "../services/LiteChat.ts"
import { PipSession, requestPipWindow } from "../services/PipSession.ts"
import { SettingsStore } from "../services/SettingsStore.ts"
import { SocketFactory } from "../services/SocketFactory.ts"
import { TwitchPage } from "../services/TwitchPage.ts"

const isEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable]") !== null
}

interface MediaSessionLike {
  setActionHandler(action: string, handler: (() => void) | null): void
}

const main = Effect.gen(function*() {
  const store = yield* SettingsStore
  const page = yield* TwitchPage
  const session = yield* PipSession
  const services = yield* Effect.context<never>()
  const runFork = Effect.runForkWith(services)

  let settings: Settings = yield* store.get

  const toggle = () => {
    switch (session.stateUnsafe()) {
      case "opening":
        return
      case "open":
        runFork(session.close)
        return
      case "idle": {
        const route = parseRoute(window.location.href)
        if (route._tag !== "Channel") return
        const pending = requestPipWindow(settings.windowSizes[settings.layout])
        runFork(
          session.open(route.channel, pending).pipe(
            Effect.catch((error) => Effect.logWarning("twitch-pip: could not open", error)),
          ),
        )
      }
    }
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (event.repeat || isEditable(event.target)) return
    const hotkey = parseHotkey(settings.hotkey)
    if (hotkey === undefined || !matches(hotkey, event)) return
    if (parseRoute(window.location.href)._tag !== "Channel") return
    event.preventDefault()
    event.stopPropagation()
    toggle()
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => window.addEventListener("keydown", onKeydown, true)),
    () => Effect.sync(() => window.removeEventListener("keydown", onKeydown, true)),
  )

  const mediaSession = (navigator as unknown as { readonly mediaSession?: MediaSessionLike }).mediaSession
  const syncAutoPip = () => {
    if (mediaSession === undefined) return
    const wanted = settings.autoPip && session.stateUnsafe() === "idle"
    try {
      mediaSession.setActionHandler("enterpictureinpicture", wanted ? toggle : null)
    } catch {
      // unsupported action in this browser
    }
  }
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      try {
        mediaSession?.setActionHandler("enterpictureinpicture", null)
      } catch {
        // unsupported action in this browser
      }
    })
  )
  syncAutoPip()

  yield* store.changes.pipe(
    Stream.runForEach((next) =>
      Effect.sync(() => {
        settings = next
        syncAutoPip()
      })
    ),
    Effect.forkScoped,
  )
  yield* session.states.pipe(Stream.runForEach(() => Effect.sync(syncAutoPip)), Effect.forkScoped)

  let buttonScope: Scope.Closeable | undefined
  const releaseButton = Effect.suspend(() => {
    const current = buttonScope
    buttonScope = undefined
    return current === undefined ? Effect.void : Scope.close(current, Exit.void)
  })
  yield* Effect.addFinalizer(() => releaseButton)
  yield* page.routeChanges.pipe(
    Stream.runForEach((route) =>
      Effect.gen(function*() {
        yield* releaseButton
        if (route._tag !== "Channel") return
        const next = yield* Scope.make()
        buttonScope = next
        yield* page.injectButton(toggle).pipe(Scope.provide(next))
      })
    ),
    Effect.forkScoped,
  )
}).pipe(
  Effect.catchCause((cause) => Effect.logError("twitch-pip: content script failed", Cause.pretty(cause))),
)

const base = Layer.mergeAll(SettingsStore.layer, TwitchPage.layer, SocketFactory.browser)
const services = LiteChat.layer.pipe(Layer.provideMerge(base))
const sessionLayer = PipSession.layer.pipe(Layer.provideMerge(services))
const appLayer = Layer.effectDiscard(main).pipe(Layer.provideMerge(sessionLayer))

const runtime = ManagedRuntime.make(appLayer)

void runtime.runPromise(Effect.void)
window.addEventListener("pagehide", () => void runtime.dispose())
