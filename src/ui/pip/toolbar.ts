import { layouts, type ChatSource, type Layout } from "../../domain/layout.ts"
import { limits, type Settings } from "../../domain/settings.ts"
import { makeH } from "../h.ts"
import { icon, type IconName } from "../icons.ts"

export interface ToolbarCallbacks {
  patch(patch: Partial<Settings>): void
  back(): void
  previewOpacity(value: number): void
}

export interface Toolbar {
  readonly element: HTMLElement
  readonly hotzone: HTMLElement
  update(settings: Settings, source: ChatSource | undefined): void
  dispose(): void
}

const idleMs = 2000

const layoutLabels: Readonly<Record<Layout, string>> = {
  video: "Video only",
  side: "Chat on the side",
  below: "Chat below",
  overlay: "Chat over the video",
}

export const mountToolbar = (doc: Document, video: HTMLVideoElement, callbacks: ToolbarCallbacks): Toolbar => {
  const h = makeH(doc)
  let settings: Settings | undefined
  const cleanups: Array<() => void> = []
  const listen = (target: EventTarget, type: string, handler: EventListener) => {
    target.addEventListener(type, handler)
    cleanups.push(() => target.removeEventListener(type, handler))
  }

  const button = (testid: string, label: string, content: Node, onClick: () => void, pressable = false) => {
    const el = h(
      "button",
      { class: "btn", testid, attrs: { type: "button", "aria-label": label, title: label, "aria-pressed": pressable ? "false" : undefined } },
      content,
    )
    el.addEventListener("click", onClick)
    return el
  }

  const swap = (el: HTMLElement, name: IconName) => el.replaceChildren(icon(doc, name))

  const play = button("pip-play", "Pause", icon(doc, "pause"), () => {
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  })
  const mute = button("pip-mute", "Mute", icon(doc, "volume"), () => {
    video.muted = !video.muted
    if (!video.muted && video.volume === 0) video.volume = 0.5
  })
  const volume = h("input", {
    class: "range volume",
    testid: "pip-volume",
    attrs: { type: "range", min: 0, max: 1, step: 0.01, "aria-label": "Volume" },
  })
  volume.addEventListener("input", () => {
    const value = Number(volume.value)
    video.volume = value
    if (value > 0 && video.muted) video.muted = false
  })

  const layoutButtons = layouts.map((layout) =>
    [
      layout,
      button(`pip-layout-${layout}`, layoutLabels[layout], icon(doc, `layout-${layout}` as IconName), () => callbacks.patch({ layout }), true),
    ] as const
  )

  const chatSource = button("pip-chat-source", "Switch to lite chat", icon(doc, "chat-twitch"), () => {
    if (settings !== undefined) callbacks.patch({ chatSource: settings.chatSource === "twitch" ? "lite" : "twitch" })
  })
  const fontDown = button(
    "pip-font-down",
    "Smaller chat text",
    h("span", { class: "a-small", props: { textContent: "A−" } }),
    () => {
      if (settings !== undefined) callbacks.patch({ chatFontSize: settings.chatFontSize - 1 })
    },
  )
  const fontUp = button("pip-font-up", "Larger chat text", h("span", { class: "a-large", props: { textContent: "A+" } }), () => {
    if (settings !== undefined) callbacks.patch({ chatFontSize: settings.chatFontSize + 1 })
  })

  const opacity = h("input", {
    class: "range opacity",
    testid: "pip-opacity",
    attrs: { type: "range", min: limits.overlayOpacity.min, max: limits.overlayOpacity.max, step: 0.05, "aria-label": "Chat background opacity" },
  })
  opacity.addEventListener("input", () => callbacks.previewOpacity(Number(opacity.value)))
  opacity.addEventListener("change", () => callbacks.patch({ overlayOpacity: Number(opacity.value) }))
  const opacityGroup = h("div", { class: "group" }, icon(doc, "opacity"), opacity)

  const back = button("pip-back", "Back to tab", icon(doc, "back"), () => callbacks.back())

  const chatGroup = h("div", { class: "group" }, chatSource, fontDown, fontUp)
  const element = h(
    "div",
    { class: "toolbar", testid: "pip-toolbar", attrs: { role: "toolbar", "aria-label": "Player controls" } },
    h("div", { class: "group" }, play, mute, volume),
    h("div", { class: "group" }, ...layoutButtons.map(([, el]) => el)),
    chatGroup,
    opacityGroup,
    h("div", { class: "group" }, back),
  )
  const hotzone = h("div", { class: "hotzone" })

  let hovering = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const hide = () => {
    timer = undefined
    if (hovering || element.matches(":focus-within")) return
    element.classList.remove("visible")
  }
  const show = () => {
    element.classList.add("visible")
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(hide, idleMs)
  }
  listen(element, "pointerenter", () => {
    hovering = true
    show()
  })
  listen(element, "pointerleave", () => {
    hovering = false
    show()
  })
  listen(element, "focusin", show)
  listen(element, "focusout", show)
  listen(doc, "pointermove", show)
  listen(doc, "pointerdown", show)
  listen(hotzone, "pointermove", show)
  listen(doc, "keydown", show)
  show()

  const syncPlayback = () => {
    const paused = video.paused
    swap(play, paused ? "play" : "pause")
    play.setAttribute("aria-label", paused ? "Play" : "Pause")
    play.title = paused ? "Play" : "Pause"
    play.dataset["state"] = paused ? "paused" : "playing"
  }
  const syncVolume = () => {
    const silent = video.muted || video.volume === 0
    swap(mute, silent ? "muted" : "volume")
    mute.setAttribute("aria-label", silent ? "Unmute" : "Mute")
    mute.title = silent ? "Unmute" : "Mute"
    mute.dataset["state"] = silent ? "muted" : "unmuted"
    volume.value = String(video.volume)
  }
  for (const type of ["play", "pause", "playing", "ended"]) listen(video, type, syncPlayback)
  listen(video, "volumechange", syncVolume)
  syncPlayback()
  syncVolume()

  return {
    element,
    hotzone,
    update: (next, source) => {
      settings = next
      for (const [layout, el] of layoutButtons) el.setAttribute("aria-pressed", String(layout === next.layout))
      chatGroup.hidden = next.layout === "video"
      chatSource.disabled = next.layout === "overlay"
      swap(chatSource, source === "lite" ? "chat-lite" : "chat-twitch")
      const label = next.layout === "overlay"
        ? "Overlay always uses lite chat"
        : next.chatSource === "twitch"
        ? "Switch to lite chat"
        : "Switch to Twitch chat"
      chatSource.setAttribute("aria-label", label)
      chatSource.title = label
      chatSource.dataset["source"] = source ?? "none"
      fontDown.disabled = next.chatFontSize <= limits.chatFontSize.min
      fontUp.disabled = next.chatFontSize >= limits.chatFontSize.max
      opacityGroup.hidden = next.layout !== "overlay"
      opacity.value = String(next.overlayOpacity)
    },
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer)
      for (const cleanup of cleanups) cleanup()
    },
  }
}
