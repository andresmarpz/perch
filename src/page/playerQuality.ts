import { pickHighest, type QualityLike } from "../domain/quality.ts"

export interface PlayerLike {
  getQualities(): ReadonlyArray<QualityLike>
  getQuality(): QualityLike
  setQuality(quality: QualityLike): void
  isAutoQualityMode(): boolean
  setAutoQualityMode(auto: boolean): void
}

export type EnforceResult = "ok" | "no-player" | "unsupported"

export interface QualityControl {
  readonly enforce: () => EnforceResult
  readonly restore: () => void
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

const savedQualityKey = "video-quality"

export const isPlayer = (value: unknown): value is PlayerLike => {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return ["getQualities", "getQuality", "setQuality", "isAutoQualityMode", "setAutoQualityMode"].every(
    (name) => typeof record[name] === "function",
  )
}

export const makeQualityControl = (find: () => PlayerLike | null, storage: StorageLike): QualityControl => {
  let saved: { readonly player: PlayerLike; readonly quality: QualityLike; readonly auto: boolean; readonly stored: string | null } | undefined

  const enforce = (): EnforceResult => {
    const player = find()
    if (player === null) return "no-player"
    try {
      const best = pickHighest(player.getQualities())
      if (best === undefined) return "no-player"
      if (saved === undefined || saved.player !== player) {
        saved = {
          player,
          quality: player.getQuality(),
          auto: player.isAutoQualityMode(),
          stored: storage.getItem(savedQualityKey),
        }
      }
      if (player.isAutoQualityMode()) player.setAutoQualityMode(false)
      if (player.getQuality().group !== best.group) player.setQuality(best)
      return "ok"
    } catch {
      return "unsupported"
    }
  }

  const restore = () => {
    const previous = saved
    saved = undefined
    if (previous === undefined) return
    try {
      previous.player.setQuality(previous.quality)
      previous.player.setAutoQualityMode(previous.auto)
    } catch {
      return
    } finally {
      try {
        if (storage.getItem(savedQualityKey) !== previous.stored) {
          if (previous.stored === null) storage.removeItem(savedQualityKey)
          else storage.setItem(savedQualityKey, previous.stored)
        }
      } catch {
        // storage unavailable
      }
    }
  }

  return { enforce, restore }
}

const playerRoots = [
  ".video-player__container",
  '[data-a-target="video-player"]',
  ".video-player",
  ".persistent-player",
  '[data-a-target="video-ref"]',
]

const instanceOf = (fiber: unknown): unknown => {
  const node = fiber as { memoizedProps?: { mediaPlayerInstance?: unknown }; stateNode?: { props?: { mediaPlayerInstance?: unknown } } }
  return node.memoizedProps?.mediaPlayerInstance ?? node.stateNode?.props?.mediaPlayerInstance
}

export const findTwitchPlayer = (doc: Document): PlayerLike | null => {
  for (const selector of playerRoots) {
    const element = doc.querySelector(selector)
    if (element === null) continue
    const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"))
    let fiber = key === undefined ? undefined : (element as unknown as Record<string, unknown>)[key]
    for (let depth = 0; fiber !== undefined && fiber !== null && depth < 400; depth++) {
      const instance = instanceOf(fiber)
      if (isPlayer(instance)) return instance
      fiber = (fiber as { return?: unknown }).return
    }
  }
  return null
}
