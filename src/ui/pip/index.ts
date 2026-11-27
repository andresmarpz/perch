import type { ChatEvent } from "../../domain/chat.ts"
import { chatSourceFor } from "../../domain/layout.ts"
import type { Settings } from "../../domain/settings.ts"
import { makeH } from "../h.ts"
import { mountLiteChat } from "./liteChat.ts"
import { pipCss } from "./styles.ts"
import { mountToolbar } from "./toolbar.ts"

export interface PipUiCallbacks {
  patch(patch: Partial<Settings>): void
  back(): void
}

export interface PipUiOptions {
  readonly channel: string
  readonly parentHost: string
  readonly video: HTMLVideoElement
  readonly settings: Settings
  readonly callbacks: PipUiCallbacks
}

export interface PipUi {
  readonly stage: HTMLElement
  update(settings: Settings): void
  chat(event: ChatEvent): void
  dispose(): void
}

const baseFontSize = 13

export const embedUrl = (channel: string, parentHost: string): string =>
  `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${encodeURIComponent(parentHost)}&darkpopout`

export const mountPipUi = (win: Window, options: PipUiOptions): PipUi => {
  const doc = win.document
  const h = makeH(doc)
  const style = h("style", { props: { textContent: pipCss } })
  doc.head.append(style)
  doc.title = `${options.channel} - Twitch PiP`

  const stage = h("div", { class: "stage", testid: "pip-stage" })
  const lite = mountLiteChat(doc)
  const chat = h(
    "div",
    { class: "chat", testid: "pip-chat" },
    h("div", { class: "lite" }, lite.element, lite.pill),
  )
  const zone = h("div", { class: "zone" })
  const root = h("div", { class: "pip", testid: "pip-root" }, stage, chat, zone)
  const toolbar = mountToolbar(doc, options.video, { zone, activity: stage }, {
    patch: options.callbacks.patch,
    back: options.callbacks.back,
    previewOpacity: (value) => root.style.setProperty("--overlay-opacity", String(value)),
  })
  doc.body.replaceChildren(root)

  const syncAspect = () => {
    const { videoWidth, videoHeight } = options.video
    if (videoWidth > 0 && videoHeight > 0) root.style.setProperty("--video-aspect", `${videoWidth} / ${videoHeight}`)
  }
  for (const type of ["loadedmetadata", "resize"]) options.video.addEventListener(type, syncAspect)
  syncAspect()

  let embed: HTMLIFrameElement | undefined

  const applyEmbedScale = (fontSize: number) => {
    if (embed === undefined) return
    const zoom = fontSize / baseFontSize
    embed.style.width = `${100 / zoom}%`
    embed.style.height = `${100 / zoom}%`
    embed.style.transform = `scale(${zoom})`
  }

  const update = (settings: Settings) => {
    const source = chatSourceFor(settings.layout, settings.chatSource)
    root.dataset["layout"] = settings.layout
    root.dataset["chatSource"] = source ?? "none"
    root.style.setProperty("--chat-font", String(settings.chatFontSize))
    root.style.setProperty("--overlay-opacity", String(settings.overlayOpacity))
    chat.dataset["source"] = source ?? "none"
    if (source === "twitch" && embed === undefined) {
      embed = h("iframe", {
        class: "embed",
        testid: "chat-embed",
        attrs: { title: "Twitch chat", allow: "clipboard-write" },
        props: { src: embedUrl(options.channel, options.parentHost) },
      })
      chat.prepend(embed)
    }
    applyEmbedScale(settings.chatFontSize)
    lite.setSticky(settings.layout === "overlay")
    toolbar.update(settings, source)
  }

  update(options.settings)

  return {
    stage,
    update,
    chat: lite.push,
    dispose: () => {
      for (const type of ["loadedmetadata", "resize"]) options.video.removeEventListener(type, syncAspect)
      toolbar.dispose()
      lite.dispose()
      root.remove()
      style.remove()
    },
  }
}
