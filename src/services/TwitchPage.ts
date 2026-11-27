import { Context, Effect, Layer, Option, Queue, Schedule, Scope, Stream } from "effect"
import { parseRoute, sameRoute, type Route } from "../domain/channel.ts"

export const selectors = {
  player: '[data-a-target="video-player"]',
  videoRef: '[data-a-target="video-ref"]',
  video: '[data-a-target="video-ref"] video',
  playerVideos: '[data-a-target="video-ref"] video, [data-a-target="video-player"] video',
  anyVideo: "video",
  rightControls: ".player-controls__right-control-group",
  fullscreenButton: '[data-a-target="player-fullscreen-button"]',
} as const

export const buttonTestId = "pip-open"

export interface ButtonHandle {
  readonly setHotkey: (hotkey: string) => void
}

const buttonLabel = (hotkey: string): string => `Picture-in-picture with chat (${hotkey})`

const replaceDelayMs = 150

export class TwitchPage extends Context.Service<TwitchPage, {
  readonly findVideo: Effect.Effect<Option.Option<HTMLVideoElement>>
  readonly videoUnsafe: () => HTMLVideoElement | null
  watchForeignVideo(onForeign: () => void): Effect.Effect<void, never, Scope.Scope>
  readonly findPlayerBar: Effect.Effect<Option.Option<HTMLElement>>
  readonly currentRoute: Effect.Effect<Route>
  readonly routeChanges: Stream.Stream<Route>
  injectButton(onClick: () => void, hotkey: string): Effect.Effect<ButtonHandle, never, Scope.Scope>
}>()("twitch-pip/services/TwitchPage") {
  static readonly layerWith = (win: Window) => Layer.succeed(TwitchPage, makePage(win))

  static readonly layer = Layer.suspend(() => TwitchPage.layerWith(window))
}

const isVisible = (el: Element): boolean => el.getClientRects().length > 0

const pickVisible = <T extends Element>(candidates: ReadonlyArray<T>): Option.Option<T> =>
  Option.fromUndefinedOr(candidates.find(isVisible) ?? candidates[0])

const pipIcon =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M19 7h-8v6h8V7zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H3V5h18v14z"/></svg>'

const buttonStyle =
  "display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:9000px;background:transparent;color:#fff;cursor:pointer;transition:background-color 150ms ease"

const createButton = (doc: Document, onClick: () => void, hotkey: string) => {
  const wrapper = doc.createElement("div")
  wrapper.dataset["twitchPip"] = "wrapper"
  wrapper.style.cssText = "display:inline-flex;align-items:center"
  const button = doc.createElement("button")
  button.type = "button"
  button.dataset["testid"] = buttonTestId
  const setHotkey = (value: string) => {
    button.setAttribute("aria-label", buttonLabel(value))
    button.title = buttonLabel(value)
  }
  setHotkey(hotkey)
  button.style.cssText = buttonStyle
  button.innerHTML = pipIcon
  button.addEventListener("mouseenter", () => (button.style.background = "rgba(255,255,255,0.13)"))
  button.addEventListener("mouseleave", () => (button.style.background = "transparent"))
  button.addEventListener("click", (event) => {
    event.stopPropagation()
    onClick()
  })
  wrapper.append(button)
  return { wrapper, setHotkey }
}

const makePage = (win: Window) => {
  const doc = win.document

  const videoUnsafe = () =>
    doc.querySelector<HTMLVideoElement>(selectors.video) ?? doc.querySelector<HTMLVideoElement>(selectors.anyVideo)

  const findVideo = Effect.sync(() => Option.fromNullOr(videoUnsafe()))

  const watchForeignVideo = (onForeign: () => void) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const ref = doc.querySelector(selectors.videoRef)
        const root = ref?.closest(selectors.player)?.parentElement ?? ref?.parentElement ?? doc.documentElement
        const check = () => {
          if (doc.querySelector(selectors.playerVideos) !== null) onForeign()
        }
        const observer = new MutationObserver(check)
        observer.observe(root, { childList: true, subtree: true })
        check()
        return observer
      }),
      (observer) => Effect.sync(() => observer.disconnect()),
    ).pipe(Effect.asVoid)

  const queryPlayerBar = (): Option.Option<HTMLElement> => {
    const groups = Array.from(doc.querySelectorAll<HTMLElement>(`${selectors.player} ${selectors.rightControls}`))
    return pickVisible(groups.length > 0 ? groups : Array.from(doc.querySelectorAll<HTMLElement>(selectors.rightControls)))
  }

  const findPlayerBar = Effect.sync(queryPlayerBar)

  const currentRoute = Effect.sync(() => parseRoute(win.location.href))

  const navigation = "navigation" in win ? win.navigation : undefined

  const navigationEvents = (target: EventTarget) =>
    Stream.callback<Route>(
      Effect.fn(function*(queue) {
        const listener = () => void Queue.offerUnsafe(queue, parseRoute(win.location.href))
        yield* Effect.acquireRelease(
          Effect.sync(() => target.addEventListener("currententrychange", listener)),
          () => Effect.sync(() => target.removeEventListener("currententrychange", listener)),
        )
      }),
      { bufferSize: 8, strategy: "sliding" },
    )

  const polled = Stream.fromSchedule(Schedule.spaced("500 millis")).pipe(
    Stream.mapEffect(() => currentRoute),
  )

  const routeChanges = Stream.concat(
    Stream.fromEffect(currentRoute),
    navigation === undefined || navigation === null ? polled : navigationEvents(navigation),
  ).pipe(Stream.changesWith(sameRoute))

  const injectButton = (onClick: () => void, hotkey: string) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const { wrapper, setHotkey } = createButton(doc, onClick, hotkey)
        const place = () => {
          const bar = Option.getOrUndefined(queryPlayerBar())
          if (bar === undefined) {
            wrapper.remove()
            return
          }
          if (wrapper.parentElement === bar) return
          const fullscreen = bar.querySelector(selectors.fullscreenButton)
          const anchor = fullscreen === null ? null : directChild(bar, fullscreen)
          bar.insertBefore(wrapper, anchor)
        }
        let timer: ReturnType<typeof setTimeout> | undefined
        const observer = new MutationObserver(() => {
          if (timer !== undefined) return
          timer = setTimeout(() => {
            timer = undefined
            place()
          }, replaceDelayMs)
        })
        observer.observe(doc.documentElement, { childList: true, subtree: true })
        place()
        return { wrapper, observer, setHotkey, cancel: () => clearTimeout(timer) }
      }),
      ({ wrapper, observer, cancel }) =>
        Effect.sync(() => {
          observer.disconnect()
          cancel()
          wrapper.remove()
        }),
    ).pipe(Effect.map(({ setHotkey }): ButtonHandle => ({ setHotkey })))

  return TwitchPage.of({ findVideo, videoUnsafe, watchForeignVideo, findPlayerBar, currentRoute, routeChanges, injectButton })
}

const directChild = (parent: HTMLElement, descendant: Element): Element | null => {
  let node: Element | null = descendant
  while (node !== null && node.parentElement !== parent) node = node.parentElement
  return node
}
