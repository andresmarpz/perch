import type { ChatEvent, ChatMessage } from "../../domain/chat.ts"
import { readableColor } from "../../domain/chat.ts"
import { applyChatEvent, isNearBottom, removedIds } from "../../domain/chatLog.ts"
import { makeH } from "../h.ts"

const emoteUrl = (id: string, scale: "1.0" | "2.0") =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/${scale}`

export interface LiteChatView {
  readonly element: HTMLElement
  readonly pill: HTMLElement
  push(event: ChatEvent): void
  setSticky(forced: boolean): void
  dispose(): void
}

export const mountLiteChat = (doc: Document): LiteChatView => {
  const h = makeH(doc)
  const list = h("div", { class: "lite-list", testid: "lite-chat", attrs: { role: "log", "aria-live": "off", "aria-label": "Chat" } })
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

  const scrollToEnd = () => {
    list.scrollTop = list.scrollHeight
  }

  const showPill = (show: boolean) => pill.classList.toggle("show", show && !forced)

  const renderLine = (message: ChatMessage): HTMLElement => {
    const children: Array<Node> = message.segments.map((segment) =>
      segment.kind === "text"
        ? doc.createTextNode(segment.text)
        : h("img", {
          class: "emote",
          attrs: { alt: segment.name, title: segment.name, loading: "lazy", srcset: `${emoteUrl(segment.id, "2.0")} 2x` },
          props: { src: emoteUrl(segment.id, "1.0") },
        })
    )
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

  const push = (event: ChatEvent) => {
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
    dispose: () => {
      list.removeEventListener("scroll", onScroll)
      pill.removeEventListener("click", onPill)
    },
  }
}
