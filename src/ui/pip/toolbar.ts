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

export interface ToolbarHosts {
  readonly zone: HTMLElement
  readonly activity: HTMLElement
}

const edgeGap = 8
const levelCount = 5
const moreLevel = levelCount - 1
const popCollapseLevel = { volume: 1, layout: 2, chat: 3, more: moreLevel } as const

interface Pop {
  readonly element: HTMLElement
  readonly box: HTMLElement
  close(): void
}

const isNode = (target: EventTarget | null): target is Node => target !== null && "nodeType" in target

export const mountToolbar = (
  doc: Document,
  video: HTMLVideoElement,
  hosts: ToolbarHosts,
  callbacks: ToolbarCallbacks,
): Toolbar => {
  const h = makeH(doc)
  let settings: Settings | undefined
  const cleanups: Array<() => void> = []
  function listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ): void
  function listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
  ): void
  function listen(target: HTMLElement | Document, type: string, handler: (event: never) => void): void {
    const listener = handler as EventListener
    target.addEventListener(type, listener)
    cleanups.push(() => target.removeEventListener(type, listener))
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
      button(
        `pip-layout-${layout}`,
        layoutLabels[layout],
        h("span", { class: "with-label" }, icon(doc, `layout-${layout}`), h("span", { class: "label", props: { textContent: layoutLabels[layout] } })),
        () => callbacks.patch({ layout }),
        true,
      ),
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

  const pops: Array<Pop> = []
  const makePop = (
    kind: keyof typeof popCollapseLevel,
    trigger: HTMLElement,
    items: ReadonlyArray<Node>,
    options: { readonly pinOnClick: boolean; readonly closeOnSelect: boolean },
  ): Pop => {
    trigger.dataset["popTrigger"] = kind
    const box = h("div", { class: "pop-box" }, ...items)
    const panel = h("div", { class: "pop-panel" }, box)
    const element = h("div", { class: `pop pop-${kind}` }, trigger, panel)
    let pinned = false
    let suppress = false
    let leaveTimer: ReturnType<typeof setTimeout> | undefined
    const collapsed = () => element.dataset["collapsed"] === "true"
    const place = () => {
      element.style.setProperty("--shift", "0px")
      const rect = panel.getBoundingClientRect()
      const width = doc.documentElement.clientWidth
      const shift = rect.left < edgeGap ? edgeGap - rect.left : rect.right > width - edgeGap ? width - edgeGap - rect.right : 0
      element.style.setProperty("--shift", `${shift}px`)
    }
    const open = () => {
      if (!collapsed()) return
      if (leaveTimer !== undefined) clearTimeout(leaveTimer)
      element.classList.add("open")
      trigger.setAttribute("aria-expanded", "true")
      place()
    }
    const close = () => {
      pinned = false
      if (leaveTimer !== undefined) clearTimeout(leaveTimer)
      element.classList.remove("open")
      trigger.setAttribute("aria-expanded", "false")
    }
    listen(element, "pointerenter", open)
    listen(element, "pointerleave", () => {
      if (pinned) return
      leaveTimer = setTimeout(close, 250)
    })
    listen(element, "focusin", () => {
      if (!suppress) open()
    })
    listen(element, "focusout", (event) => {
      if (!isNode(event.relatedTarget) || !element.contains(event.relatedTarget)) close()
    })
    listen(element, "keydown", (event) => {
      if (event.key !== "Escape" || !element.classList.contains("open")) return
      event.stopPropagation()
      suppress = true
      trigger.focus()
      suppress = false
      close()
    })
    if (options.pinOnClick) {
      listen(trigger, "click", () => {
        if (pinned) return close()
        pinned = true
        open()
      })
    }
    if (options.closeOnSelect) listen(box, "click", close)
    listen(doc, "pointerdown", (event) => {
      if (isNode(event.target) && !element.contains(event.target)) close()
    })
    const pop: Pop = { element, box, close }
    pops.push(pop)
    return pop
  }

  const layoutTrigger = h(
    "button",
    { class: "btn", testid: "pip-layout-menu", attrs: { type: "button", "aria-label": "Layout", title: "Layout", "aria-haspopup": "menu", "aria-expanded": "false" } },
  )
  const chatTrigger = h(
    "button",
    { class: "btn", testid: "pip-chat-menu", attrs: { type: "button", "aria-label": "Chat settings", title: "Chat settings", "aria-haspopup": "menu", "aria-expanded": "false" } },
    h("span", { class: "a-large", props: { textContent: "Aa" } }),
  )
  mute.setAttribute("aria-haspopup", "true")

  const moreTrigger = h(
    "button",
    { class: "btn", testid: "pip-more-menu", attrs: { type: "button", "aria-label": "More controls", title: "More controls", "aria-haspopup": "menu", "aria-expanded": "false" } },
    icon(doc, "more"),
  )

  const volumePop = makePop("volume", mute, [volume], { pinOnClick: false, closeOnSelect: false })
  const layoutPop = makePop("layout", layoutTrigger, layoutButtons.map(([, el]) => el), { pinOnClick: true, closeOnSelect: true })
  const chatPop = makePop("chat", chatTrigger, [fontDown, fontUp, opacityGroup], { pinOnClick: true, closeOnSelect: false })
  const audioRow = h("div", { class: "more-row" })
  const textRow = h("div", { class: "more-row" })
  const morePop = makePop("more", moreTrigger, [], { pinOnClick: true, closeOnSelect: false })
  const popFor = { volume: volumePop, layout: layoutPop, chat: chatPop, more: morePop } as const

  const chatGroup = h("div", { class: "group group-chat" }, chatSource, chatPop.element)
  const element = h(
    "div",
    { class: "toolbar", testid: "pip-toolbar", attrs: { role: "toolbar", "aria-label": "Player controls", "data-level": "0" } },
    h("div", { class: "group" }, play, volumePop.element),
    h("div", { class: "group" }, layoutPop.element),
    h("div", { class: "group group-more" }, morePop.element),
    chatGroup,
    h("div", { class: "group" }, back),
  )
  hosts.zone.append(element)

  let controlsInMore = false
  const gatherInMore = () => {
    audioRow.replaceChildren(mute, volume)
    textRow.replaceChildren(fontDown, fontUp)
    morePop.box.replaceChildren(audioRow, chatSource, textRow, opacityGroup)
  }
  const returnHome = () => {
    volumePop.element.prepend(mute)
    volumePop.box.replaceChildren(volume)
    chatGroup.prepend(chatSource)
    chatPop.box.replaceChildren(fontDown, fontUp, opacityGroup)
  }

  const paint = (level: number) => {
    element.dataset["level"] = String(level)
    for (const kind of Object.keys(popCollapseLevel) as Array<keyof typeof popCollapseLevel>) {
      popFor[kind].element.dataset["collapsed"] = String(level >= popCollapseLevel[kind])
    }
    layoutTrigger.hidden = level < popCollapseLevel.layout
    chatTrigger.hidden = level < popCollapseLevel.chat
    mute.setAttribute("aria-haspopup", String(level >= popCollapseLevel.volume && level < moreLevel))
    const wantMore = level >= moreLevel
    if (wantMore === controlsInMore) return
    controlsInMore = wantMore
    if (wantMore) gatherInMore()
    else returnHome()
  }

  let level = -1
  let lastAvailable = 0
  const fit = (explore: boolean) => {
    const available = hosts.zone.clientWidth - edgeGap * 2
    let next = level < 0 || explore || available > lastAvailable ? 0 : level
    lastAvailable = available
    while (next < moreLevel) {
      paint(next)
      if (element.offsetWidth <= available) break
      next += 1
    }
    paint(next)
    if (next !== level) {
      level = next
      for (const pop of pops) pop.close()
    }
    element.dataset["wide"] = String(element.offsetWidth > available)
  }
  const view = doc.defaultView
  const observer = view === null ? undefined : new view.ResizeObserver(() => fit(false))
  observer?.observe(hosts.zone)
  cleanups.push(() => observer?.disconnect())
  paint(0)

  let hovering = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const hide = () => {
    timer = undefined
    if (hovering || element.matches(":focus-within")) return
    element.classList.remove("visible")
    for (const pop of pops) pop.close()
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
  listen(hosts.activity, "pointermove", show)
  listen(hosts.activity, "pointerdown", show)
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
  for (const type of ["play", "pause", "playing", "ended"] as const) listen(video, type, syncPlayback)
  listen(video, "volumechange", syncVolume)
  syncPlayback()
  syncVolume()

  return {
    update: (next, source) => {
      const layoutChanged = settings?.layout !== next.layout
      settings = next
      for (const [layout, el] of layoutButtons) el.setAttribute("aria-pressed", String(layout === next.layout))
      const noChat = next.layout === "video"
      chatGroup.hidden = noChat
      chatSource.hidden = noChat
      fontDown.hidden = noChat
      fontUp.hidden = noChat
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
      layoutTrigger.replaceChildren(icon(doc, `layout-${next.layout}`))
      layoutTrigger.title = `Layout: ${layoutLabels[next.layout]}`
      fit(layoutChanged)
    },
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer)
      for (const cleanup of cleanups) cleanup()
    },
  }
}
