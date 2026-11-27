import { recordHotkey, formatHotkey } from "../../domain/hotkey.ts"
import { chatSources, layouts, type ChatSource, type Layout } from "../../domain/layout.ts"
import { limits, pipQualities, type PipQuality, type Settings } from "../../domain/settings.ts"
import { h, type Child } from "../h.ts"
import { icon, type IconName } from "../icons.ts"
import { optionsCss } from "./styles.ts"

export interface OptionsCallbacks {
  patch(patch: Partial<Settings>): Promise<unknown>
  resetSizes(): Promise<unknown>
  resetAll(): Promise<unknown>
}

export interface OptionsView {
  update(settings: Settings): void
}

const layoutLabels: Readonly<Record<Layout, string>> = {
  video: "Video only",
  side: "Chat side",
  below: "Chat below",
  overlay: "Overlay",
}

const qualityLabels: Readonly<Record<PipQuality, string>> = { max: "Highest available", twitch: "Let Twitch decide" }

const sourceLabels: Readonly<Record<ChatSource, string>> = { twitch: "Twitch chat", lite: "Lite chat" }
const sourceIcons: Readonly<Record<ChatSource, IconName>> = { twitch: "chat-twitch", lite: "chat-lite" }

const segmented = <T extends string>(
  name: string,
  values: ReadonlyArray<T>,
  labelOf: (value: T) => string,
  iconOf: (value: T) => IconName,
  testid: (value: T) => string,
  onChange: (value: T) => void,
) => {
  const inputs = new Map<T, HTMLInputElement>()
  const element = h(
    "div",
    { class: "seg", attrs: { role: "radiogroup", "aria-label": name } },
    ...values.map((value) => {
      const input = h("input", {
        testid: testid(value),
        attrs: { type: "radio", name, value, "aria-label": labelOf(value) },
        on: { change: () => onChange(value) },
      })
      inputs.set(value, input)
      return h("label", {}, input, h("span", { class: "opt" }, icon(document, iconOf(value)), labelOf(value)))
    }),
  )
  return {
    element,
    set: (value: T) => {
      for (const [v, input] of inputs) input.checked = v === value
    },
  }
}

const row = (label: string, hint: Child, control: Node, badge?: string, stack = false) =>
  h(
    "div",
    { class: stack ? "row stack" : "row" },
    h("div", { class: "text" }, h("div", { class: "label" }, label, badge === undefined ? undefined : h("span", { class: "badge", props: { textContent: badge } })), hint === undefined ? undefined : h("div", { class: "hint" }, hint)),
    h("div", { class: "control" }, control),
  )

export const mountOptions = (root: HTMLElement, initial: Settings, callbacks: OptionsCallbacks): OptionsView => {
  document.head.append(h("style", { props: { textContent: optionsCss } }))
  document.title = "Twitch PiP settings"

  const status = h("div", { class: "status", attrs: { role: "status", "aria-live": "polite" }, testid: "opt-status" })
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  const flash = (text: string, error: boolean) => {
    status.textContent = text
    status.className = error ? "status show error" : "status show"
    if (statusTimer !== undefined) clearTimeout(statusTimer)
    statusTimer = setTimeout(() => status.classList.remove("show"), 1800)
  }
  const save = (action: () => Promise<unknown>) => {
    action().then(
      () => flash("Saved", false),
      () => flash("Could not save", true),
    )
  }

  const layout = segmented("Layout", layouts, (v) => layoutLabels[v], (v) => `layout-${v}`, (v) => `opt-layout-${v}`, (value) => save(() => callbacks.patch({ layout: value })))
  const source = segmented("Chat source", chatSources, (v) => sourceLabels[v], (v) => sourceIcons[v], (v) => `opt-chat-${v}`, (value) => save(() => callbacks.patch({ chatSource: value })))

  const quality = h("select", {
    testid: "opt-pip-quality",
    attrs: { "aria-label": "PiP quality" },
    on: { change: () => save(() => callbacks.patch({ pipQuality: quality.value as PipQuality })) },
  }, ...pipQualities.map((value) => h("option", { props: { value, textContent: qualityLabels[value] } })))

  const fontValue = h("span", { class: "value", testid: "opt-font-value" })
  const font = h("input", {
    testid: "opt-font-size",
    attrs: { type: "range", min: limits.chatFontSize.min, max: limits.chatFontSize.max, step: 1, "aria-label": "Chat font size" },
    on: {
      input: () => (fontValue.textContent = `${font.value} px`),
      change: () => save(() => callbacks.patch({ chatFontSize: Number(font.value) })),
    },
  })

  const opacityValue = h("span", { class: "value", testid: "opt-opacity-value" })
  const opacity = h("input", {
    testid: "opt-overlay-opacity",
    attrs: { type: "range", min: limits.overlayOpacity.min, max: limits.overlayOpacity.max, step: 0.05, "aria-label": "Overlay background opacity" },
    on: {
      input: () => (opacityValue.textContent = `${Math.round(Number(opacity.value) * 100)}%`),
      change: () => save(() => callbacks.patch({ overlayOpacity: Number(opacity.value) })),
    },
  })

  const hotkeyError = h("div", { class: "error-text", attrs: { role: "alert" }, testid: "opt-hotkey-error" })
  let current = initial
  let recording = false
  const hotkey = h("button", { class: "hotkey", testid: "opt-hotkey", attrs: { type: "button", "aria-label": "Shortcut. Click, then press a new key combination" } })
  const showHotkey = () => {
    hotkey.textContent = current.hotkey
  }
  const stopRecording = () => {
    recording = false
    hotkey.classList.remove("recording")
    showHotkey()
  }
  hotkey.addEventListener("click", () => {
    recording = true
    hotkeyError.textContent = ""
    hotkey.classList.remove("invalid")
    hotkey.classList.add("recording")
    hotkey.textContent = "Press a shortcut…"
  })
  hotkey.addEventListener("blur", () => {
    if (recording) stopRecording()
  })
  hotkey.addEventListener("keydown", (event) => {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") return stopRecording()
    const result = recordHotkey(event)
    switch (result._tag) {
      case "Pending":
        return
      case "NeedsModifier":
        hotkey.classList.add("invalid")
        hotkeyError.textContent = "Use Alt, Ctrl or Cmd with the key, so typing is never hijacked."
        return
      case "UnsupportedKey":
        hotkey.classList.add("invalid")
        hotkeyError.textContent = "That key is not supported. Use a letter, digit, F1 to F12, Space, Enter, Tab, Backspace or an arrow."
        return
      case "Hotkey":
        hotkey.classList.remove("invalid")
        hotkeyError.textContent = ""
        stopRecording()
        hotkey.textContent = formatHotkey(result.hotkey)
        save(() => callbacks.patch({ hotkey: formatHotkey(result.hotkey) }))
    }
  })

  const autoPip = h("input", {
    testid: "opt-auto-pip",
    attrs: { type: "checkbox", role: "switch", "aria-label": "Automatic picture-in-picture" },
    on: { change: () => save(() => callbacks.patch({ autoPip: autoPip.checked })) },
  })

  const confirmButton = (label: string, testid: string, action: () => Promise<unknown>, armedLabel: string) => {
    let armed: ReturnType<typeof setTimeout> | undefined
    const button = h("button", { class: "button danger", testid, attrs: { type: "button" }, props: { textContent: label } })
    button.addEventListener("click", () => {
      if (armed === undefined) {
        button.classList.add("armed")
        button.textContent = armedLabel
        armed = setTimeout(() => {
          armed = undefined
          button.classList.remove("armed")
          button.textContent = label
        }, 3000)
        return
      }
      clearTimeout(armed)
      armed = undefined
      button.classList.remove("armed")
      button.textContent = label
      save(action)
    })
    return button
  }

  const page = h(
    "div",
    { class: "page" },
    h(
      "header",
      { class: "top" },
      h("div", { class: "logo" }, icon(document, "layout-overlay")),
      h("div", {}, h("h1", { props: { textContent: "Twitch PiP" } }), h("p", { class: "sub", props: { textContent: "Settings save as you change them." } })),
      status,
    ),
    h(
      "section",
      { class: "card" },
      row("Layout", "Where the chat goes in the picture-in-picture window.", layout.element, undefined, true),
      row("Chat source", "Twitch chat lets you type when you are logged in. Lite chat is read only, lighter, and works in the overlay.", source.element, undefined, true),
    ),
    h(
      "section",
      { class: "card" },
      row("PiP quality", "Highest available keeps Twitch on Source quality and keeps the tab looking visible while the window is open, then restores both. Let Twitch decide leaves the player alone.", quality),
    ),
    h(
      "section",
      { class: "card" },
      row("Chat font size", "Applies to lite chat and scales the Twitch chat.", h("div", { class: "control" }, font, fontValue)),
      row("Overlay opacity", "Background of the chat over the video.", h("div", { class: "control" }, opacity, opacityValue)),
    ),
    h(
      "section",
      { class: "card" },
      row("Shortcut", h("span", {}, "Opens or closes picture-in-picture on a channel page.", hotkeyError), hotkey),
      row(
        "Automatic picture-in-picture",
        "Open the window when you switch to another tab while a stream plays. Chrome must allow Automatic picture-in-picture for twitch.tv in site settings.",
        h("label", { class: "switch" }, autoPip, h("span", { class: "track" })),
        "Experimental",
      ),
    ),
    h(
      "section",
      { class: "card" },
      row(
        "Window sizes",
        "Each layout remembers the size you gave it.",
        confirmButton("Reset sizes", "opt-reset-sizes", callbacks.resetSizes, "Click again to reset"),
      ),
      row(
        "Reset everything",
        "Back to the defaults, including the shortcut.",
        confirmButton("Reset all", "opt-reset-all", callbacks.resetAll, "Click again to reset"),
      ),
    ),
  )
  root.replaceChildren(page)

  const update = (settings: Settings) => {
    current = settings
    layout.set(settings.layout)
    source.set(settings.chatSource)
    font.value = String(settings.chatFontSize)
    fontValue.textContent = `${settings.chatFontSize} px`
    opacity.value = String(settings.overlayOpacity)
    opacityValue.textContent = `${Math.round(settings.overlayOpacity * 100)}%`
    autoPip.checked = settings.autoPip
    quality.value = settings.pipQuality
    if (!recording) showHotkey()
  }
  update(initial)
  return { update }
}
