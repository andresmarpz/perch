import { selectors } from "./TwitchPage.ts"

interface VideoOrigin {
  readonly parent: Element | null
  readonly next: ChildNode | null
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

const otherPlayerVideos = (video: HTMLVideoElement): ReadonlyArray<Element> =>
  Array.from(document.querySelectorAll(selectors.playerVideos)).filter((other) => other !== video)

const dropWhenTwitchMounts = (video: HTMLVideoElement, target: Element) => {
  const stop = () => {
    observer.disconnect()
    clearTimeout(timer)
  }
  const check = () => {
    if (!video.isConnected || video.ownerDocument !== document) return stop()
    if (otherPlayerVideos(video).length === 0) return
    video.remove()
    stop()
  }
  const observer = new MutationObserver(check)
  const timer = setTimeout(stop, settleWindowMs)
  observer.observe(target.closest(selectors.player)?.parentElement ?? target.parentElement ?? target, {
    childList: true,
    subtree: true,
  })
  requestAnimationFrame(check)
}

const placeVideo = (video: HTMLVideoElement, origin: VideoOrigin): boolean => {
  const target = origin.parent?.isConnected === true ? origin.parent : document.querySelector(selectors.videoRef)
  if (target === null || otherPlayerVideos(video).length > 0) {
    video.remove()
    return false
  }
  const next = origin.next !== null && origin.next.parentNode === target ? origin.next : null
  target.insertBefore(video, next)
  dropWhenTwitchMounts(video, target)
  return true
}

export const moveVideoIn = (video: HTMLVideoElement, stage: HTMLElement): Handoff => {
  const origin: VideoOrigin = { parent: video.parentElement, next: video.nextSibling }
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
