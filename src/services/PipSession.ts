import { Context, Effect, Exit, Fiber, Latch, Layer, Option, Queue, Scope, Stream, SubscriptionRef } from "effect"
import { chatSourceFor, type Layout, type WindowSize } from "../domain/layout.ts"
import type { Settings } from "../domain/settings.ts"
import { mountPipUi } from "../ui/pip/index.ts"
import { PipOpenFailed, PipUnsupported, PlayerNotFound } from "./errors.ts"
import { LiteChat } from "./LiteChat.ts"
import { SettingsStore } from "./SettingsStore.ts"
import { selectors, TwitchPage } from "./TwitchPage.ts"

export type SessionState = "idle" | "opening" | "open"

interface DocumentPipApi {
  requestWindow(options?: { readonly width: number; readonly height: number }): Promise<Window>
}

export const requestPipWindow = (size: WindowSize): Promise<Window> => {
  const api = (window as unknown as { readonly documentPictureInPicture?: DocumentPipApi }).documentPictureInPicture
  return api === undefined ? Promise.reject(new PipUnsupported()) : api.requestWindow(size)
}

interface VideoOrigin {
  readonly parent: Element | null
  readonly next: ChildNode | null
}

const replayDelays = [0, 120, 500] as const

const keepPlaying = (video: HTMLVideoElement, shouldPlay: boolean) => {
  if (!shouldPlay) return
  for (const delay of replayDelays) {
    setTimeout(() => {
      if (video.paused) void video.play().catch(() => undefined)
    }, delay)
  }
}

const placeVideo = (video: HTMLVideoElement, origin: VideoOrigin) => {
  const target = origin.parent?.isConnected === true ? origin.parent : document.querySelector(selectors.videoRef)
  if (target === null) return video.remove()
  const other = target.querySelector("video")
  if (other !== null && other !== video) return video.remove()
  const next = origin.next !== null && origin.next.parentNode === target ? origin.next : null
  target.insertBefore(video, next)
}

const moveVideoIn = (video: HTMLVideoElement, stage: HTMLElement) => {
  const origin: VideoOrigin = { parent: video.parentElement, next: video.nextSibling }
  const wasPlaying = !video.paused
  stage.append(video)
  keepPlaying(video, wasPlaying)
  let restored = false
  return {
    restore: () => {
      if (restored) return
      restored = true
      const playing = !video.paused
      placeVideo(video, origin)
      keepPlaying(video, playing)
    },
  }
}

const outerSizeFor = (pip: Window, inner: WindowSize): WindowSize => ({
  width: inner.width + (pip.outerWidth - pip.innerWidth),
  height: inner.height + (pip.outerHeight - pip.innerHeight),
})

export class PipSession extends Context.Service<PipSession, {
  readonly stateUnsafe: () => SessionState
  readonly states: Stream.Stream<SessionState>
  open(channel: string, pending: Promise<Window>): Effect.Effect<void, PipUnsupported | PipOpenFailed | PlayerNotFound>
  readonly close: Effect.Effect<void>
}>()("twitch-pip/services/PipSession") {
  static readonly layer = Layer.effect(
    PipSession,
    Effect.gen(function*() {
      const store = yield* SettingsStore
      const page = yield* TwitchPage
      const liteChat = yield* LiteChat
      const rootScope = yield* Effect.scope
      const stateRef = yield* SubscriptionRef.make<SessionState>("idle")

      let state: SessionState = "idle"
      let live: { readonly scope: Scope.Closeable; readonly ended: Latch.Latch } | undefined

      const setState = (next: SessionState) =>
        Effect.suspend(() => {
          state = next
          return SubscriptionRef.set(stateRef, next)
        })

      const run = (effect: Effect.Effect<unknown, unknown>) => void Effect.runFork(Effect.ignore(effect))

      const session = (channel: string, pending: Promise<Window>, ended: Latch.Latch) =>
        Effect.gen(function*() {
          const pip = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => pending,
              catch: (cause) => (cause instanceof PipUnsupported ? cause : new PipOpenFailed({ cause })),
            }),
            (win) => Effect.sync(() => win.close()),
          )
          const video = yield* page.findVideo.pipe(
            Effect.flatMap(Option.match({
              onNone: () => Effect.fail(new PlayerNotFound({ what: "video" })),
              onSome: Effect.succeed,
            })),
          )
          const initial = yield* store.get

          const ui = yield* Effect.acquireRelease(
            Effect.sync(() =>
              mountPipUi(pip, {
                channel,
                parentHost: window.location.hostname,
                video,
                settings: initial,
                callbacks: {
                  patch: (patch) => run(store.set(patch)),
                  back: () => void Latch.openUnsafe(ended),
                },
              })
            ),
            (ui) => Effect.sync(() => ui.dispose()),
          )

          const mover = yield* Effect.acquireRelease(
            Effect.sync(() => moveVideoIn(video, ui.stage)),
            (m) => Effect.sync(m.restore),
          )

          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const onHide = () => {
                mover.restore()
                Latch.openUnsafe(ended)
              }
              pip.addEventListener("pagehide", onHide)
              return onHide
            }),
            (onHide) => Effect.sync(() => pip.removeEventListener("pagehide", onHide)),
          )

          let applied = initial
          let layout: Layout = initial.layout

          let chatFiber: Fiber.Fiber<void> | undefined
          const syncChat = (settings: Settings) =>
            Effect.gen(function*() {
              const wantLite = chatSourceFor(settings.layout, settings.chatSource) === "lite"
              if (wantLite && chatFiber === undefined) {
                chatFiber = yield* liteChat.messages(channel).pipe(
                  Stream.runForEach((event) => Effect.sync(() => ui.chat(event))),
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
                const layoutChanged = next.layout !== applied.layout
                applied = next
                layout = next.layout
                ui.update(next)
                yield* syncChat(next)
                if (layoutChanged) {
                  yield* Effect.try(() => {
                    const size = outerSizeFor(pip, next.windowSizes[next.layout])
                    pip.resizeTo(size.width, size.height)
                  }).pipe(Effect.ignore)
                }
              })
            ),
            Effect.forkScoped,
          )

          const resizes = Stream.callback<{ readonly layout: Layout; readonly size: WindowSize }>(
            Effect.fn(function*(queue) {
              const listener = () =>
                void Queue.offerUnsafe(queue, { layout, size: { width: pip.innerWidth, height: pip.innerHeight } })
              yield* Effect.acquireRelease(
                Effect.sync(() => pip.addEventListener("resize", listener)),
                () => Effect.sync(() => pip.removeEventListener("resize", listener)),
              )
            }),
            { bufferSize: 4, strategy: "sliding" },
          )
          yield* resizes.pipe(
            Stream.debounce("500 millis"),
            Stream.runForEach(({ layout: forLayout, size }) =>
              Effect.gen(function*() {
                const current = yield* store.get
                yield* store.set({ windowSizes: { ...current.windowSizes, [forLayout]: size } })
              }).pipe(Effect.ignore)
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

      const open = (channel: string, pending: Promise<Window>) =>
        Effect.gen(function*() {
          if (live !== undefined) {
            yield* Effect.tryPromise(() => pending).pipe(
              Effect.flatMap((win) => Effect.sync(() => win.close())),
              Effect.ignore,
            )
            return
          }
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
          const exit = yield* Effect.exit(session(channel, pending, ended).pipe(Scope.provide(scope)))
          if (Exit.isFailure(exit)) {
            yield* Scope.close(scope, exit)
            return yield* Effect.failCause(exit.cause)
          }
          yield* setState("open")
          yield* Effect.gen(function*() {
            yield* ended.await
            yield* Scope.close(scope, Exit.void)
          }).pipe(Effect.forkIn(rootScope))
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
