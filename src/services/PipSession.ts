import { Context, Effect, Exit, Fiber, Latch, Layer, Option, Queue, Scope, Stream, SubscriptionRef } from "effect"
import type { ChatEvent } from "../domain/chat.ts"
import { chatSourceFor, type WindowSize } from "../domain/layout.ts"
import type { Settings } from "../domain/settings.ts"
import { mountPipUi } from "../ui/pip/index.ts"
import { PipOpenFailed, PipUnsupported, PlayerNotFound } from "./errors.ts"
import { LiteChat } from "./LiteChat.ts"
import { SevenTv } from "./SevenTv.ts"
import { setPageBoost } from "./pageBridge.ts"
import { SettingsStore } from "./SettingsStore.ts"
import { TwitchPage } from "./TwitchPage.ts"
import { type Handoff, moveVideoIn, playerOf } from "./videoHandoff.ts"

export type SessionState = "idle" | "opening" | "open"

interface DocumentPipApi {
  requestWindow(options?: { readonly width: number; readonly height: number }): Promise<Window>
}

export const requestPipWindow = (size: WindowSize | undefined): Promise<Window> => {
  const api = (window as unknown as { readonly documentPictureInPicture?: DocumentPipApi }).documentPictureInPicture
  return api === undefined ? Promise.reject(new PipUnsupported()) : api.requestWindow(size)
}

export interface SessionOptions {
  readonly settings: Settings
  readonly onKeydown: (event: KeyboardEvent) => void
}

export const superviseEnd = (rootScope: Scope.Scope, scope: Scope.Closeable, ended: Latch.Latch) =>
  Effect.gen(function*() {
    yield* Scope.addFinalizer(scope, Latch.open(ended))
    yield* Effect.gen(function*() {
      yield* ended.await
      yield* Effect.yieldNow
      yield* Scope.close(scope, Exit.void)
    }).pipe(Effect.forkIn(rootScope))
  })

export class PipSession extends Context.Service<PipSession, {
  readonly stateUnsafe: () => SessionState
  readonly states: Stream.Stream<SessionState>
  open(
    channel: string,
    pending: Promise<Window>,
    options: SessionOptions,
  ): Effect.Effect<void, PipUnsupported | PipOpenFailed | PlayerNotFound>
  readonly close: Effect.Effect<void>
}>()("twitch-pip/services/PipSession") {
  static readonly layer = Layer.effect(
    PipSession,
    Effect.gen(function*() {
      const store = yield* SettingsStore
      const page = yield* TwitchPage
      const liteChat = yield* LiteChat
      const sevenTv = yield* SevenTv
      const rootScope = yield* Effect.scope
      const stateRef = yield* SubscriptionRef.make<SessionState>("idle")

      let state: SessionState = "idle"
      let live: { readonly scope: Scope.Closeable; readonly ended: Latch.Latch } | undefined

      const setState = (next: SessionState) =>
        Effect.suspend(() => {
          state = next
          return SubscriptionRef.set(stateRef, next)
        })

      const session = (channel: string, pending: Promise<Window>, options: SessionOptions, ended: Latch.Latch) =>
        Effect.gen(function*() {
          const initial = options.settings
          const pip = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => pending,
              catch: (cause) => (cause instanceof PipUnsupported ? cause : new PipOpenFailed({ cause })),
            }),
            (win) => Effect.sync(() => win.close()),
          )

          let handoff: Handoff | undefined
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const onHide = () => {
                handoff?.restore()
                Latch.openUnsafe(ended)
              }
              pip.addEventListener("pagehide", onHide)
              return onHide
            }),
            (onHide) => Effect.sync(() => pip.removeEventListener("pagehide", onHide)),
          )
          if (pip.closed) {
            return yield* new PipOpenFailed({ cause: new Error("the PiP window closed before the session started") })
          }

          const video = yield* page.findVideo.pipe(
            Effect.flatMap(Option.match({
              onNone: () => Effect.fail(new PlayerNotFound({ what: "video" })),
              onSome: Effect.succeed,
            })),
          )

          const player = playerOf(video)
          const patches = yield* Queue.unbounded<Partial<Settings>>()
          const savePatch = (patch: Partial<Settings>) =>
            store.set(patch).pipe(
              Effect.catchCause((cause) => Effect.logError("twitch-pip: could not save settings", cause)),
              Effect.uninterruptible,
            )
          yield* Effect.addFinalizer(() =>
            Queue.clear(patches).pipe(Effect.flatMap((rest) => Effect.forEach(rest, savePatch, { discard: true })))
          )
          const ui = yield* Effect.acquireRelease(
            Effect.sync(() =>
              mountPipUi(pip, {
                channel,
                parentHost: window.location.hostname,
                video,
                settings: initial,
                callbacks: {
                  patch: (patch) => void Queue.offerUnsafe(patches, patch),
                  back: () => void Latch.openUnsafe(ended),
                },
              })
            ),
            (ui) => Effect.sync(() => ui.dispose()),
          )

          yield* Effect.acquireRelease(
            Effect.sync(() => setPageBoost(initial.pipQuality === "max")),
            () => Effect.sync(() => setPageBoost(false)),
          )

          handoff = yield* Effect.acquireRelease(
            Effect.sync(() => moveVideoIn(video, ui.stage)),
            (moved) => Effect.sync(moved.restore),
          )

          yield* Effect.acquireRelease(
            Effect.sync(() => pip.document.addEventListener("keydown", options.onKeydown, true)),
            () => Effect.sync(() => pip.document.removeEventListener("keydown", options.onKeydown, true)),
          )

          yield* page.watchForeignVideo(player, () => {
            console.warn("twitch-pip: session ended, Twitch mounted another video")
            Latch.openUnsafe(ended)
          })

          yield* Stream.fromQueue(patches).pipe(Stream.runForEach(savePatch), Effect.forkScoped)

          let applied = initial

          let roomId: string | undefined
          let emotesRequested = false
          const syncEmotes = (settings: Settings) =>
            Effect.gen(function*() {
              if (!settings.sevenTv || roomId === undefined || emotesRequested) return
              emotesRequested = true
              const channelId = roomId
              yield* sevenTv.emotes(channelId).pipe(
                Effect.flatMap((emotes) => Effect.sync(() => ui.setEmotes(emotes))),
                Effect.forkScoped,
              )
            })
          const onChatEvent = (event: ChatEvent) =>
            Effect.gen(function*() {
              if (event._tag === "Room") {
                if (roomId === undefined) {
                  roomId = event.channelId
                  yield* syncEmotes(applied)
                }
                return
              }
              ui.chat(event)
            })

          let chatFiber: Fiber.Fiber<void> | undefined
          const syncChat = (settings: Settings) =>
            Effect.gen(function*() {
              const wantLite = chatSourceFor(settings.layout, settings.chatSource) === "lite"
              if (wantLite && chatFiber === undefined) {
                chatFiber = yield* liteChat.messages(channel).pipe(
                  Stream.runForEach(onChatEvent),
                  Effect.forkScoped,
                )
              } else if (!wantLite && chatFiber !== undefined) {
                const fiber = chatFiber
                chatFiber = undefined
                yield* Fiber.interrupt(fiber)
              }
            })
          yield* syncChat(initial)

          yield* store.changes.pipe(
            Stream.runForEach((next) =>
              Effect.gen(function*() {
                if (next.pipQuality !== applied.pipQuality) setPageBoost(next.pipQuality === "max")
                applied = next
                ui.update(next)
                yield* syncChat(next)
                yield* syncEmotes(next)
              })
            ),
            Effect.forkScoped,
          )

          const resizes = Stream.callback<WindowSize>(
            Effect.fn(function*(queue) {
              const listener = () =>
                void Queue.offerUnsafe(queue, { width: pip.innerWidth, height: pip.innerHeight })
              yield* Effect.acquireRelease(
                Effect.sync(() => pip.addEventListener("resize", listener)),
                () => Effect.sync(() => pip.removeEventListener("resize", listener)),
              )
            }),
            { bufferSize: 4, strategy: "sliding" },
          )
          yield* resizes.pipe(
            Stream.debounce("500 millis"),
            Stream.runForEach((size) =>
              store.update((current) => ({ ...current, windowSize: size })).pipe(Effect.ignore)
            ),
            Effect.forkScoped,
          )

          yield* page.routeChanges.pipe(
            Stream.filter((route) => !(route._tag === "Channel" && route.channel === channel)),
            Stream.take(1),
            Stream.runDrain,
            Effect.andThen(Latch.open(ended)),
            Effect.forkScoped,
          )
        })

      const open = (channel: string, pending: Promise<Window>, options: SessionOptions) =>
        Effect.gen(function*() {
          const scope = yield* Scope.make()
          const ended = yield* Latch.make(false)
          live = { scope, ended }
          yield* setState("opening")
          yield* Scope.addFinalizer(
            scope,
            Effect.suspend(() => {
              live = undefined
              return setState("idle")
            }),
          )
          const exit = yield* Effect.exit(session(channel, pending, options, ended).pipe(Scope.provide(scope)))
          if (Exit.isFailure(exit)) {
            yield* Scope.close(scope, exit)
            return yield* Effect.failCause(exit.cause)
          }
          yield* setState("open")
          yield* superviseEnd(rootScope, scope, ended)
        })

      const close = Effect.suspend(() => (live === undefined ? Effect.void : Scope.close(live.scope, Exit.void)))

      yield* Effect.addFinalizer(() => close)

      return PipSession.of({
        stateUnsafe: () => state,
        states: SubscriptionRef.changes(stateRef),
        open,
        close,
      })
    }),
  )
}
