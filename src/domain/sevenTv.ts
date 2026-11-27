import { Option, Schema } from "effect"

export interface SevenTvEmote {
  readonly id: string
  readonly url: string
  readonly width: number
  readonly height: number
  readonly zeroWidth: boolean
}

export type SevenTvEmotes = ReadonlyMap<string, SevenTvEmote>

export const noEmotes: SevenTvEmotes = new Map()

export const apiBase = "https://7tv.io/v3"
export const cdnBase = "https://cdn.7tv.app/emote"

const zeroWidthSetFlag = 1
const zeroWidthEmoteFlag = 256
const idPattern = /^[0-9A-Za-z]{1,40}$/
const namePattern = /^\S{1,64}$/

const FileSchema = Schema.Struct({ name: Schema.String, width: Schema.Finite, height: Schema.Finite })

const EmoteSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  flags: Schema.optional(Schema.Finite),
  data: Schema.optional(Schema.Struct({
    flags: Schema.optional(Schema.Finite),
    host: Schema.optional(Schema.Struct({ files: Schema.optional(Schema.Array(Schema.Unknown)) })),
  })),
})

const decodeEmote = Schema.decodeUnknownOption(EmoteSchema)
const decodeFile = Schema.decodeUnknownOption(FileSchema)

const fallbackSize = 32

const toEmote = (input: unknown): readonly [string, SevenTvEmote] | undefined => {
  const parsed = decodeEmote(input)
  if (Option.isNone(parsed)) return undefined
  const { id, name, flags = 0, data } = parsed.value
  if (!idPattern.test(id) || !namePattern.test(name)) return undefined
  const files = (data?.host?.files ?? []).flatMap((file) => {
    const decoded = decodeFile(file)
    return Option.isSome(decoded) ? [decoded.value] : []
  })
  const file = files.find((f) => f.name === "1x.webp")
  const width = file !== undefined && file.width > 0 ? file.width : fallbackSize
  const height = file !== undefined && file.height > 0 ? file.height : fallbackSize
  const zeroWidth = (flags & zeroWidthSetFlag) !== 0 || ((data?.flags ?? 0) & zeroWidthEmoteFlag) !== 0
  return [name, { id, url: `${cdnBase}/${id}/2x.webp`, width, height, zeroWidth }]
}

const entries = (emotes: unknown): ReadonlyArray<readonly [string, SevenTvEmote]> => {
  const out: Array<readonly [string, SevenTvEmote]> = []
  if (!Array.isArray(emotes)) return out
  for (const emote of emotes) {
    const entry = toEmote(emote)
    if (entry !== undefined) out.push(entry)
  }
  return out
}

const record = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null ? (value as Readonly<Record<string, unknown>>) : {}

export const decodeGlobalSet = (json: unknown): SevenTvEmotes => new Map(entries(record(json)["emotes"]))

export const decodeUserSet = (json: unknown): SevenTvEmotes =>
  new Map(entries(record(record(record(json)["emote_set"]))["emotes"]))

export const mergeEmotes = (global: SevenTvEmotes, channel: SevenTvEmotes): SevenTvEmotes =>
  new Map([...global, ...channel])
