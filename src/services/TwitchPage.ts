import { Context, Effect, Layer, Option, Queue, Schedule, Scope, Stream } from "effect"
import { parseRoute, sameRoute, type Route } from "../domain/channel.ts"

export const selectors = {
  player: '[data-a-target="video-player"]',
  video: '[data-a-target="video-ref"] video',
  anyVideo: "video",
  rightControls: ".player-controls__right-control-group",
  fullscreenButton: '[data-a-target="player-fullscreen-button"]',
} as const

export const buttonTestId = "twitch-pip-button"

const replaceDelayMs = 150

export class TwitchPage extends Context.Service<TwitchPage, {
  readonly findVideo: Effect.Effect<Option.Option<HTMLVideoElement>>
  readonly findPlayerBar: Effect.Effect<Option.Option<HTMLElement>>
  readonly currentRoute: Effect.Effect<Route>
  readonly routeChanges: Stream.Stream<Route>
  injectButton(onClick: () => void): Effect.Effect<void, never, Scope.Scope>
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
  "display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer"

const createButton = (doc: Document, onClick: () => void): HTMLElement => {
  const wrapper = doc.createElement("div")
  wrapper.dataset["twitchPip"] = "wrapper"
  wrapper.style.cssText = "display:inline-flex;align-items:center"
  const button = doc.createElement("button")
  button.type = "button"
  button.dataset["testid"] = buttonTestId
  button.setAttribute("aria-label", "Picture in picture (Twitch PiP)")
  button.title = "Picture in picture (Twitch PiP)"
  button.style.cssText = buttonStyle
  button.innerHTML = pipIcon
  button.addEventListener("mouseenter", () => (button.style.background = "rgba(255,255,255,0.2)"))
  button.addEventListener("mouseleave", () => (button.style.background = "transparent"))
  button.addEventListener("click", (event) => {
    event.stopPropagation()
    onClick()
  })
  wrapper.append(button)
  return wrapper
}

const makePage = (win: Window) => {
  const doc = win.document

  const findVideo = Effect.sync(() => {
    const inPlayer = doc.querySelector<HTMLVideoElement>(selectors.video)
    return Option.fromNullOr(inPlayer ?? doc.querySelector<HTMLVideoElement>(selectors.anyVideo))
  })

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

  const injectButton = (onClick: () => void) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const wrapper = createButton(doc, onClick)
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
        return { wrapper, observer, cancel: () => clearTimeout(timer) }
      }),
      ({ wrapper, observer, cancel }) =>
        Effect.sync(() => {
          observer.disconnect()
          cancel()
          wrapper.remove()
        }),
    ).pipe(Effect.asVoid)

  return TwitchPage.of({ findVideo, findPlayerBar, currentRoute, routeChanges, injectButton })
}

const directChild = (parent: HTMLElement, descendant: Element): Element | null => {
  let node: Element | null = descendant
  while (node !== null && node.parentElement !== parent) node = node.parentElement
  return node
}
