import { Cause, Effect, Exit, Layer, ManagedRuntime, Scope, Stream } from "effect"
import { parseRoute } from "../domain/channel.ts"
import { matches, parseHotkey } from "../domain/hotkey.ts"
import { sizeToRequest } from "../domain/pipSize.ts"
import { type Settings } from "../domain/settings.ts"
import { LiteChat } from "../services/LiteChat.ts"
import { SevenTv } from "../services/SevenTv.ts"
import { PipSession, requestPipWindow } from "../services/PipSession.ts"
import { markOpened, startOpenedFlag } from "../services/openedFlag.ts"
import { SettingsStore } from "../services/SettingsStore.ts"
import { SocketFactory } from "../services/SocketFactory.ts"
import { TwitchPage, type ButtonHandle } from "../services/TwitchPage.ts"
import { isEditable } from "../ui/editable.ts"
import { extensionAlive, makeExtensionLink } from "./extensionLink.ts"

const takeoverEvent = "twitch-pip:takeover"

interface MediaSessionLike {
  setActionHandler(action: string, handler: (() => void) | null): void
}

const main = Effect.gen(function*() {
  const store = yield* SettingsStore
  const page = yield* TwitchPage
  const session = yield* PipSession

  let settings: Settings = yield* store.get

  let openedBefore = false
  const stopOpenedFlag = startOpenedFlag((opened) => void (openedBefore = opened))
  yield* Effect.addFinalizer(() => Effect.sync(stopOpenedFlag))

  const onKeydown = (event: KeyboardEvent) => {
    if (!extensionAlive()) return void runtime.dispose()
    if (event.repeat || isEditable(event.target)) return
    const hotkey = parseHotkey(settings.hotkey)
    if (hotkey === undefined || !matches(hotkey, event)) return
    if (parseRoute(window.location.href)._tag !== "Channel") return
    event.preventDefault()
    event.stopPropagation()
    toggle()
  }

  const toggle = () => {
    if (!extensionAlive()) return void runtime.dispose()
    const state = session.stateUnsafe()
    if (state === "opening") return
    if (state === "open") return run(session.close)
    const route = parseRoute(window.location.href)
    if (route._tag !== "Channel") return
    if (page.videoUnsafe() === null) return run(Effect.logWarning("twitch-pip: no player video on this page"))
    const pending = requestPipWindow(sizeToRequest(openedBefore, settings.windowSize))
    void pending.then(() => markOpened()).then((marked) => void (openedBefore ||= marked), () => undefined)
    run(
      session.open(route.channel, pending, { settings, onKeydown }).pipe(
        Effect.catch((error) => Effect.logWarning("twitch-pip: could not open", error)),
      ),
    )
  }

  yield* Effect.acquireRelease(
    Effect.sync(() => window.addEventListener("keydown", onKeydown, true)),
    () => Effect.sync(() => window.removeEventListener("keydown", onKeydown, true)),
  )

  const onTakeover = () => void runtime.dispose()
  yield* Effect.acquireRelease(
    Effect.sync(() => document.addEventListener(takeoverEvent, onTakeover)),
    () => Effect.sync(() => document.removeEventListener(takeoverEvent, onTakeover)),
  )

  const link = makeExtensionLink(() => void runtime.dispose())
  yield* Effect.addFinalizer(() => Effect.sync(link.stop))

  const mediaSession = (navigator as unknown as { readonly mediaSession?: MediaSessionLike }).mediaSession
  const autoOpen = () => {
    console.info("twitch-pip: Chrome asked for automatic PiP")
    toggle()
  }
  const syncAutoPip = () => {
    if (mediaSession === undefined) return
    const wanted = settings.autoPip && session.stateUnsafe() === "idle"
    try {
      mediaSession.setActionHandler("enterpictureinpicture", wanted ? autoOpen : null)
    } catch {
      return
    }
  }
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      try {
        mediaSession?.setActionHandler("enterpictureinpicture", null)
      } catch {
        return
      }
    })
  )
  syncAutoPip()

  yield* store.changes.pipe(
    Stream.runForEach((next) =>
      Effect.sync(() => {
        settings = next
        button?.setHotkey(next.hotkey)
        syncAutoPip()
      })
    ),
    Effect.forkScoped,
  )
  yield* session.states.pipe(
    Stream.runForEach((state) =>
      Effect.sync(() => {
        if (state === "idle") link.stop()
        else link.start()
        syncAutoPip()
      })
    ),
    Effect.forkScoped,
  )

  let buttonScope: Scope.Closeable | undefined
  let button: ButtonHandle | undefined
  const releaseButton = Effect.suspend(() => {
    const current = buttonScope
    buttonScope = undefined
    button = undefined
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
        button = yield* page.injectButton(toggle, settings.hotkey).pipe(Scope.provide(next))
      })
    ),
    Effect.forkScoped,
  )
}).pipe(
  Effect.catchCause((cause) => Effect.logError("twitch-pip: content script failed", Cause.pretty(cause))),
)

const base = Layer.mergeAll(SettingsStore.layer, TwitchPage.layer, SocketFactory.browser, SevenTv.layer)
const services = LiteChat.layer.pipe(Layer.provideMerge(base))
const sessionLayer = PipSession.layer.pipe(Layer.provideMerge(services))
const appLayer = Layer.effectDiscard(main).pipe(Layer.provideMerge(sessionLayer))

const runtime = ManagedRuntime.make(appLayer)

function run(effect: Effect.Effect<unknown, unknown, Layer.Success<typeof appLayer>>) {
  runtime.runFork(
    effect.pipe(Effect.tapCause((cause) => Effect.logError("twitch-pip: task failed", cause)), Effect.ignore),
  )
}

document.dispatchEvent(new CustomEvent(takeoverEvent))
void runtime.runPromise(Effect.void)
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) void runtime.dispose()
})
