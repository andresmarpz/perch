import { boostAttribute } from "../domain/bridge.ts"
import { findTwitchPlayer, makeQualityControl } from "../page/playerQuality.ts"
import { makeVisibilityGuard } from "../page/visibility.ts"

const installedKey = "__twitchPipMainWorld"

if (!(installedKey in window)) install()

function install() {
  Object.defineProperty(window, installedKey, { value: true })
  const pollMs = 2000
  const patience = 10

  const guard = makeVisibilityGuard(document, window)
  const quality = makeQualityControl(
    () => findTwitchPlayer(document),
    {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key),
    },
  )

  let timer: ReturnType<typeof setInterval> | undefined
  let running = false
  let misses = 0
  let warned = false

  const warnOnce = (message: string) => {
    if (warned) return
    warned = true
    console.warn(`twitch-pip: ${message}`)
  }

  const tick = () => {
    const result = quality.enforce()
    if (result === "ok") {
      misses = 0
      return
    }
    if (result === "unsupported") {
      warnOnce("Twitch's player changed, so quality is left to Twitch")
      stop()
      return
    }
    misses += 1
    if (misses === patience) warnOnce("could not find Twitch's player, so quality is left to Twitch")
  }

  const start = () => {
    if (running) return
    running = true
    misses = 0
    warned = false
    timer = setInterval(tick, pollMs)
    tick()
  }

  const stop = () => {
    running = false
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    quality.restore()
  }

  const sync = () => {
    if (document.documentElement?.hasAttribute(boostAttribute) === true) {
      guard.enable()
      start()
    } else {
      stop()
      guard.disable()
    }
  }

  const observe = (root: Element) => {
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: [boostAttribute] })
    sync()
  }

  if (document.documentElement !== null) observe(document.documentElement)
  else {
    const waiter = new MutationObserver(() => {
      if (document.documentElement === null) return
      waiter.disconnect()
      observe(document.documentElement)
    })
    waiter.observe(document, { childList: true })
  }
}
