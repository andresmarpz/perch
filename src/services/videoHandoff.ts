import { selectors } from "./TwitchPage.ts"

interface VideoOrigin {
  readonly parent: Element | null
  readonly next: ChildNode | null
  readonly player: Element
}

export const playerOf = (video: HTMLVideoElement): Element =>
  video.closest(selectors.player) ?? video.closest(selectors.videoRef) ?? video.parentElement ?? video

const otherVideosIn = (player: Element, video: HTMLVideoElement): ReadonlyArray<Element> =>
  Array.from(player.querySelectorAll("video")).filter((other) => other !== video)

const discard = (video: HTMLVideoElement) => {
  video.pause()
  video.remove()
}

export interface Handoff {
  readonly restore: () => void
}

export const replayDelays: ReadonlyArray<number> = [0, 120, 500]
const settleWindowMs = 3000

const pendingReplays = new WeakMap<HTMLVideoElement, () => void>()

export const cancelReplay = (video: HTMLVideoElement) => pendingReplays.get(video)?.()

export const keepPlaying = (video: HTMLVideoElement, delays: ReadonlyArray<number> = replayDelays) => {
  cancelReplay(video)
  const timers: Array<ReturnType<typeof setTimeout>> = []
  let resumed = false
  const stop = () => {
    for (const timer of timers) clearTimeout(timer)
    video.removeEventListener("pause", onPause)
    video.removeEventListener("playing", onPlaying)
    if (pendingReplays.get(video) === stop) pendingReplays.delete(video)
  }
  const onPlaying = () => {
    resumed = true
  }
  const onPause = () => {
    if (resumed) stop()
  }
  video.addEventListener("playing", onPlaying)
  video.addEventListener("pause", onPause)
  for (const delay of delays) {
    timers.push(setTimeout(() => {
      if (!video.paused) resumed = true
      else void video.play().catch(() => undefined)
    }, delay))
  }
  timers.push(setTimeout(stop, Math.max(...delays) + 100))
  pendingReplays.set(video, stop)
}

const dropWhenTwitchMounts = (video: HTMLVideoElement, player: Element) => {
  const stop = () => {
    observer.disconnect()
    clearTimeout(timer)
  }
  const check = () => {
    if (!video.isConnected || video.ownerDocument !== document) return stop()
    if (otherVideosIn(player, video).length === 0) return
    discard(video)
    stop()
  }
  const observer = new MutationObserver(check)
  const timer = setTimeout(stop, settleWindowMs)
  observer.observe(player, { childList: true, subtree: true })
  requestAnimationFrame(check)
}

const placeVideo = (video: HTMLVideoElement, origin: VideoOrigin): boolean => {
  const originKept = origin.parent?.isConnected === true
  const target = originKept ? origin.parent : document.querySelector(selectors.videoRef)
  if (target === null) {
    discard(video)
    return false
  }
  const player = originKept && origin.player.isConnected ? origin.player : (target.closest(selectors.player) ?? target)
  if (otherVideosIn(player, video).length > 0) {
    discard(video)
    return false
  }
  const next = origin.next !== null && origin.next.parentNode === target ? origin.next : null
  target.insertBefore(video, next)
  dropWhenTwitchMounts(video, player)
  return true
}

export const moveVideoIn = (video: HTMLVideoElement, stage: HTMLElement): Handoff => {
  const origin: VideoOrigin = { parent: video.parentElement, next: video.nextSibling, player: playerOf(video) }
  const wasPlaying = !video.paused
  stage.append(video)
  if (wasPlaying) keepPlaying(video)
  let restored = false
  return {
    restore: () => {
      if (restored) return
      restored = true
      cancelReplay(video)
      const playing = !video.paused
      if (placeVideo(video, origin) && playing) keepPlaying(video)
    },
  }
}
