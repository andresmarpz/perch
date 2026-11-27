import { nickOf, type IrcLine } from "./irc.ts"
import type { SevenTvEmote, SevenTvEmotes } from "./sevenTv.ts"

export type Segment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "emote"; readonly id: string; readonly name: string }
  | { readonly kind: "sevenTv"; readonly name: string; readonly emote: SevenTvEmote }
  | {
    readonly kind: "stack"
    readonly base: Segment
    readonly overlays: ReadonlyArray<{ readonly name: string; readonly emote: SevenTvEmote }>
  }

export interface ChatMessage {
  readonly id: string
  readonly login: string
  readonly displayName: string
  readonly color: string | undefined
  readonly segments: ReadonlyArray<Segment>
  readonly isAction: boolean
}

export type ChatStatus = "connecting" | "connected" | "reconnecting"

export type ChatEvent =
  | { readonly _tag: "Message"; readonly message: ChatMessage }
  | { readonly _tag: "Status"; readonly status: ChatStatus }
  | { readonly _tag: "Room"; readonly channelId: string }
  | { readonly _tag: "ClearChat"; readonly channel: string; readonly login: string | undefined }
  | { readonly _tag: "ClearMsg"; readonly channel: string; readonly messageId: string }

interface EmoteRange {
  readonly id: string
  readonly start: number
  readonly end: number
}

const parseEmoteRanges = (tag: string): ReadonlyArray<EmoteRange> => {
  const ranges: Array<EmoteRange> = []
  for (const group of tag.split("/")) {
    const colon = group.indexOf(":")
    if (colon <= 0) continue
    const id = group.slice(0, colon)
    for (const span of group.slice(colon + 1).split(",")) {
      const match = /^(\d+)-(\d+)$/.exec(span)
      if (match === null) continue
      ranges.push({ id, start: Number(match[1]), end: Number(match[2]) })
    }
  }
  return ranges.sort((a, b) => a.start - b.start)
}

export const segments = (text: string, emotesTag: string): ReadonlyArray<Segment> => {
  const points = Array.from(text)
  const out: Array<Segment> = []
  let cursor = 0
  const pushText = (to: number) => {
    if (to > cursor) out.push({ kind: "text", text: points.slice(cursor, to).join("") })
  }
  for (const range of parseEmoteRanges(emotesTag)) {
    if (range.start < cursor || range.end < range.start || range.end >= points.length) continue
    pushText(range.start)
    out.push({ kind: "emote", id: range.id, name: points.slice(range.start, range.end + 1).join("") })
    cursor = range.end + 1
  }
  pushText(points.length)
  return out
}

const isEmoteSegment = (segment: Segment | undefined): segment is Segment =>
  segment !== undefined && segment.kind !== "text"

export const withSevenTv = (input: ReadonlyArray<Segment>, emotes: SevenTvEmotes): ReadonlyArray<Segment> => {
  if (emotes.size === 0) return input
  const out: Array<Segment> = []
  const pushText = (text: string) => {
    const last = out[out.length - 1]
    if (last?.kind === "text") out[out.length - 1] = { kind: "text", text: last.text + text }
    else out.push({ kind: "text", text })
  }
  let pendingSpace = ""
  const flushSpace = () => {
    if (pendingSpace !== "") pushText(pendingSpace)
    pendingSpace = ""
  }
  for (const segment of input) {
    if (segment.kind !== "text") {
      flushSpace()
      out.push(segment)
      continue
    }
    for (const token of segment.text.split(/( +)/)) {
      if (token === "") continue
      if (token.startsWith(" ")) {
        pendingSpace += token
        continue
      }
      const emote = emotes.get(token)
      if (emote === undefined) {
        flushSpace()
        pushText(token)
        continue
      }
      const previous = out[out.length - 1]
      if (emote.zeroWidth && isEmoteSegment(previous)) {
        const overlay = { name: token, emote }
        out[out.length - 1] = previous.kind === "stack"
          ? { kind: "stack", base: previous.base, overlays: [...previous.overlays, overlay] }
          : { kind: "stack", base: previous, overlays: [overlay] }
        pendingSpace = ""
        continue
      }
      flushSpace()
      out.push({ kind: "sevenTv", name: token, emote })
    }
  }
  flushSpace()
  return out
}

const hexColor = /^#[0-9a-fA-F]{6}$/
const actionPattern = /^\u0001ACTION ?([\s\S]*?)\u0001?$/

const validColor = (value: string | undefined): string | undefined =>
  value !== undefined && hexColor.test(value) ? value.toUpperCase() : undefined

export const fromPrivmsg = (line: IrcLine): ChatMessage | undefined => {
  if (line.command !== "PRIVMSG") return undefined
  const channel = line.params[0]?.replace(/^#/, "")
  const login = nickOf(line.prefix)
  if (channel === undefined || channel === "" || login === undefined || line.trailing === undefined) return undefined

  const action = actionPattern.exec(line.trailing)
  const text = action === null ? line.trailing : (action[1] ?? "")
  const timestamp = Number(line.tags["tmi-sent-ts"])
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : 0
  const displayName = line.tags["display-name"]

  return {
    id: line.tags["id"] || `${login}-${safeTimestamp}`,
    login,
    displayName: displayName === undefined || displayName === "" ? login : displayName,
    color: validColor(line.tags["color"]),
    segments: segments(text, line.tags["emotes"] ?? ""),
    isAction: action !== null,
  }
}

export const toChatEvent = (line: IrcLine): ChatEvent | undefined => {
  const channel = line.params[0]?.replace(/^#/, "")
  if (channel === undefined) return undefined
  switch (line.command) {
    case "PRIVMSG": {
      const message = fromPrivmsg(line)
      return message === undefined ? undefined : { _tag: "Message", message }
    }
    case "ROOMSTATE": {
      const channelId = line.tags["room-id"]
      return channelId === undefined || channelId === "" ? undefined : { _tag: "Room", channelId }
    }
    case "CLEARCHAT":
      return { _tag: "ClearChat", channel, login: line.trailing === "" ? undefined : line.trailing }
    case "CLEARMSG": {
      const messageId = line.tags["target-msg-id"]
      return messageId === undefined || messageId === "" ? undefined : { _tag: "ClearMsg", channel, messageId }
    }
    default:
      return undefined
  }
}

const fallbackPalette: ReadonlyArray<string> = [
  "#FF0000",
  "#0000FF",
  "#00FF00",
  "#B22222",
  "#FF7F50",
  "#9ACD32",
  "#FF4500",
  "#2E8B57",
  "#DAA520",
  "#D2691E",
  "#5F9EA0",
  "#1E90FF",
  "#FF69B4",
  "#8A2BE2",
  "#00FF7F",
]

const hashLogin = (login: string): number => {
  let hash = 0
  for (const char of login) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

type Rgb = readonly [number, number, number]

const toRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`

const luminance = ([r, g, b]: Rgb): number => {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const backgroundLuminance = luminance([14, 14, 16])
const minimumContrast = 4.5

const contrast = (rgb: Rgb): number => (luminance(rgb) + 0.05) / (backgroundLuminance + 0.05)

export const readableColor = (hex: string | undefined, login: string): string => {
  const base = validColor(hex) ?? fallbackPalette[hashLogin(login) % fallbackPalette.length] ?? "#FFFFFF"
  const rgb = toRgb(base)
  if (contrast(rgb) >= minimumContrast) return base
  for (let step = 1; step <= 20; step++) {
    const t = step / 20
    const mixed: Rgb = [rgb[0] + (255 - rgb[0]) * t, rgb[1] + (255 - rgb[1]) * t, rgb[2] + (255 - rgb[2]) * t]
    if (contrast(mixed) >= minimumContrast) return toHex(mixed)
  }
  return "#FFFFFF"
}
