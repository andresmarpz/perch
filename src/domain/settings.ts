import { Option, Schema } from "effect"
import { formatHotkey, parseHotkey } from "./hotkey.ts"
import { chatSources, defaultWindowSizes, layouts, type Layout, type WindowSize } from "./layout.ts"

export const pipQualities = ["max", "twitch"] as const
export type PipQuality = (typeof pipQualities)[number]

const WindowSizeSchema = Schema.Struct({ width: Schema.Finite, height: Schema.Finite })

export const SettingsSchema = Schema.Struct({
  layout: Schema.Literals(layouts),
  chatSource: Schema.Literals(chatSources),
  chatFontSize: Schema.Finite,
  overlayOpacity: Schema.Finite,
  hotkey: Schema.String,
  autoPip: Schema.Boolean,
  pipQuality: Schema.Literals(pipQualities),
  sevenTv: Schema.Boolean,
  windowSizes: Schema.Struct({
    video: WindowSizeSchema,
    side: WindowSizeSchema,
    below: WindowSizeSchema,
    overlay: WindowSizeSchema,
  }),
})

export type Settings = typeof SettingsSchema.Type

export const limits = {
  chatFontSize: { min: 11, max: 24 },
  overlayOpacity: { min: 0.2, max: 1 },
  windowWidth: { min: 200, max: 4000 },
  windowHeight: { min: 120, max: 3000 },
} as const

export const defaults: Settings = {
  layout: "side",
  chatSource: "twitch",
  chatFontSize: 13,
  overlayOpacity: 0.85,
  hotkey: "Alt+Shift+P",
  autoPip: false,
  pipQuality: "max",
  sevenTv: true,
  windowSizes: defaultWindowSizes,
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const decodeField = <S extends Schema.Decoder<unknown>>(schema: S, input: unknown, fallback: S["Type"]): S["Type"] =>
  Option.getOrElse(Schema.decodeUnknownOption(schema)(input), () => fallback)

const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown)

const record = (value: unknown): Readonly<Record<string, unknown>> => decodeField(UnknownRecord, value, {})

const decodeNumber = (input: unknown, fallback: number, min: number, max: number): number =>
  clamp(decodeField(Schema.Finite, input, fallback), min, max)

const decodeHotkey = (input: unknown): string => {
  const hotkey = typeof input === "string" ? parseHotkey(input) : undefined
  return hotkey === undefined ? defaults.hotkey : formatHotkey(hotkey)
}

const decodeSize = (input: unknown, fallback: WindowSize): WindowSize => {
  const raw = record(input)
  return {
    width: Math.round(decodeNumber(raw["width"], fallback.width, limits.windowWidth.min, limits.windowWidth.max)),
    height: Math.round(decodeNumber(raw["height"], fallback.height, limits.windowHeight.min, limits.windowHeight.max)),
  }
}

const decodeWindowSizes = (input: unknown): Settings["windowSizes"] => {
  const raw = record(input)
  const size = (layout: Layout) => decodeSize(raw[layout], defaultWindowSizes[layout])
  return { video: size("video"), side: size("side"), below: size("below"), overlay: size("overlay") }
}

export const decodeSettings = (input: unknown): Settings => {
  const raw = record(input)
  return {
    layout: decodeField(SettingsSchema.fields.layout, raw["layout"], defaults.layout),
    chatSource: decodeField(SettingsSchema.fields.chatSource, raw["chatSource"], defaults.chatSource),
    chatFontSize: Math.round(
      decodeNumber(raw["chatFontSize"], defaults.chatFontSize, limits.chatFontSize.min, limits.chatFontSize.max),
    ),
    overlayOpacity: decodeNumber(
      raw["overlayOpacity"],
      defaults.overlayOpacity,
      limits.overlayOpacity.min,
      limits.overlayOpacity.max,
    ),
    hotkey: decodeHotkey(raw["hotkey"]),
    autoPip: decodeField(SettingsSchema.fields.autoPip, raw["autoPip"], defaults.autoPip),
    pipQuality: decodeField(SettingsSchema.fields.pipQuality, raw["pipQuality"], defaults.pipQuality),
    sevenTv: decodeField(SettingsSchema.fields.sevenTv, raw["sevenTv"], defaults.sevenTv),
    windowSizes: decodeWindowSizes(raw["windowSizes"]),
  }
}
