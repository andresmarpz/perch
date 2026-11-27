import { Context, Effect, Layer } from "effect"
import { apiBase, decodeGlobalSet, decodeUserSet, mergeEmotes, noEmotes, type SevenTvEmotes } from "../domain/sevenTv.ts"

const fetchTimeout = "8 seconds"

export class SevenTv extends Context.Service<SevenTv, {
  emotes(channelId: string): Effect.Effect<SevenTvEmotes>
}>()("twitch-pip/services/SevenTv") {
  static readonly layer = Layer.sync(SevenTv, () => {
    const cache = new Map<string, Promise<SevenTvEmotes>>()
    const getJson = (url: string) =>
      Effect.tryPromise((signal) => fetch(url, { signal }).then((response) => response.ok ? response.json() : undefined)).pipe(
        Effect.timeout(fetchTimeout),
        Effect.orElseSucceed(() => undefined),
      )
    const load = (key: string, url: string, decode: (json: unknown) => SevenTvEmotes) => {
      let promise = cache.get(key)
      if (promise === undefined) {
        promise = Effect.runPromise(getJson(url)).then((json) => (json === undefined ? noEmotes : decode(json)))
        cache.set(key, promise)
      }
      return Effect.promise(() => promise)
    }
    return SevenTv.of({
      emotes: (channelId) =>
        Effect.all([
          load("global", `${apiBase}/emote-sets/global`, decodeGlobalSet),
          load(`user:${channelId}`, `${apiBase}/users/twitch/${encodeURIComponent(channelId)}`, decodeUserSet),
        ], { concurrency: 2 }).pipe(Effect.map(([global, channel]) => mergeEmotes(global, channel))),
    })
  })
}
