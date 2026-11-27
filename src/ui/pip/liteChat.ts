import type { ChatEvent, ChatMessage, ChatStatus, Segment } from "../../domain/chat.ts"
import { readableColor, withSevenTv } from "../../domain/chat.ts"
import { noEmotes, type SevenTvEmote, type SevenTvEmotes } from "../../domain/sevenTv.ts"
import { applyChatEvent, isNearBottom, removedIds } from "../../domain/chatLog.ts"
import { makeH } from "../h.ts"

const emoteUrl = (id: string, scale: "1.0" | "2.0") =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/${scale}`

const statusText: Readonly<Record<ChatStatus, string>> = {
  connecting: "Connecting to chat\u2026",
  connected: "",
  reconnecting: "Reconnecting\u2026",
}

export interface LiteChatView {
  readonly element: HTMLElement
  readonly status: HTMLElement
  readonly pill: HTMLElement
  push(event: ChatEvent): void
  setSticky(forced: boolean): void
  setEmotes(emotes: SevenTvEmotes): void
  setSevenTv(enabled: boolean): void
  dispose(): void
}

export const mountLiteChat = (doc: Document): LiteChatView => {
  const h = makeH(doc)
  const list = h("div", { class: "lite-list", testid: "lite-chat", attrs: { role: "log", "aria-live": "off", "aria-label": "Chat" } })
  const status = h("div", {
    class: "lite-status",
    testid: "chat-status",
    attrs: { role: "status" },
    props: { textContent: statusText.connecting },
  })
  const pill = h("button", {
    class: "pill",
    testid: "chat-new-pill",
    attrs: { type: "button", "aria-label": "Jump to newest chat messages" },
    props: { textContent: "New messages" },
  })

  const elements = new Map<string, HTMLElement>()
  let log: ReadonlyArray<ChatMessage> = []
  let stick = true
  let forced = false
  let emotes: SevenTvEmotes = noEmotes
  let sevenTvOn = true

  const scrollToEnd = () => {
    list.scrollTop = list.scrollHeight
  }

  const showPill = (show: boolean) => pill.classList.toggle("show", show && !forced)

  const sevenTvImage = (name: string, emote: SevenTvEmote, className: string) =>
    h("img", {
      class: className,
      attrs: { alt: name, title: name, loading: "lazy", width: String(emote.width), height: String(emote.height) },
      props: { src: emote.url },
    })

  const renderSegment = (segment: Segment): Node => {
    switch (segment.kind) {
      case "text":
        return doc.createTextNode(segment.text)
      case "emote":
        return h("img", {
          class: "emote",
          attrs: { alt: segment.name, title: segment.name, loading: "lazy", srcset: `${emoteUrl(segment.id, "2.0")} 2x` },
          props: { src: emoteUrl(segment.id, "1.0") },
        })
      case "sevenTv":
        return sevenTvImage(segment.name, segment.emote, "emote seventv")
      case "stack":
        return h(
          "span",
          { class: "stack" },
          renderSegment(segment.base),
          ...segment.overlays.map((overlay) => sevenTvImage(overlay.name, overlay.emote, "emote seventv overlay")),
        )
    }
  }

  const renderLine = (message: ChatMessage): HTMLElement => {
    const segments = sevenTvOn ? withSevenTv(message.segments, emotes) : message.segments
    const children = segments.map(renderSegment)
    const name = h("span", {
      class: "name",
      props: { textContent: message.displayName },
    })
    name.style.color = readableColor(message.color, message.login)
    return h(
      "div",
      { class: message.isAction ? "line action" : "line", testid: "chat-line", attrs: { "data-msg-id": message.id } },
      name,
      message.isAction ? " " : h("span", { class: "sep", props: { textContent: ": " } }),
      h("span", { class: "text" }, ...children),
    )
  }

  const onScroll = () => {
    stick = isNearBottom(list)
    if (stick) showPill(false)
  }
  const onPill = () => {
    stick = true
    scrollToEnd()
    showPill(false)
  }
  list.addEventListener("scroll", onScroll, { passive: true })
  pill.addEventListener("click", onPill)

  const rerender = () => {
    for (const message of log) {
      const old = elements.get(message.id)
      if (old === undefined) continue
      const next = renderLine(message)
      old.replaceWith(next)
      elements.set(message.id, next)
    }
    if (stick || forced) scrollToEnd()
  }

  const push = (event: ChatEvent) => {
    if (event._tag === "Status") {
      status.textContent = statusText[event.status]
      status.hidden = event.status === "connected"
      return
    }
    const next = applyChatEvent(log, event)
    if (next === log) return
    for (const id of removedIds(log, next)) {
      elements.get(id)?.remove()
      elements.delete(id)
    }
    if (event._tag === "Message" && next.some((line) => line.id === event.message.id)) {
      const el = renderLine(event.message)
      elements.set(event.message.id, el)
      list.append(el)
      if (stick || forced) scrollToEnd()
      else showPill(true)
    }
    log = next
  }

  return {
    element: list,
    status,
    pill,
    push,
    setSticky: (value) => {
      forced = value
      if (value) {
        stick = true
        showPill(false)
        scrollToEnd()
      }
    },
    setEmotes: (next) => {
      emotes = next
      if (sevenTvOn) rerender()
    },
    setSevenTv: (enabled) => {
      if (enabled === sevenTvOn) return
      sevenTvOn = enabled
      rerender()
    },
    dispose: () => {
      list.removeEventListener("scroll", onScroll)
      pill.removeEventListener("click", onPill)
    },
  }
}
