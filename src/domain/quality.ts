export interface QualityLike {
  readonly group?: string
  readonly name?: string
  readonly height?: number
  readonly framerate?: number
  readonly bitrate?: number
}

const isVideoQuality = (quality: QualityLike): boolean => quality.group !== "auto" && quality.group !== "audio_only"

const rank = (quality: QualityLike): ReadonlyArray<number> => [
  quality.height ?? 0,
  quality.framerate ?? 0,
  quality.bitrate ?? 0,
]

const compare = (a: QualityLike, b: QualityLike): number => {
  const left = rank(a)
  const right = rank(b)
  for (let i = 0; i < left.length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export const pickHighest = <Q extends QualityLike>(qualities: ReadonlyArray<Q>): Q | undefined => {
  const video = qualities.filter(isVideoQuality)
  const source = video.find((quality) => quality.group === "chunked")
  if (source !== undefined) return source
  return video.reduce<Q | undefined>((best, quality) => (best === undefined || compare(quality, best) > 0 ? quality : best), undefined)
}
