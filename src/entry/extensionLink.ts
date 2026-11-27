export const portName = "twitch-pip-content"
const baseDelayMs = 1000
const maxDelayMs = 30_000
const healthyMs = 5000

export const extensionAlive = (): boolean => {
  try {
    return chrome.runtime.id !== undefined
  } catch {
    return false
  }
}

export interface ExtensionLink {
  readonly start: () => void
  readonly stop: () => void
}

export const makeExtensionLink = (onGone: () => void): ExtensionLink => {
  let port: chrome.runtime.Port | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false
  let attempts = 0
  let connectedAt = 0

  const onDisconnect = () => {
    void chrome.runtime.lastError
    port = undefined
    if (!active) return
    if (!extensionAlive()) return onGone()
    if (Date.now() - connectedAt >= healthyMs) attempts = 0
    timer = setTimeout(connect, Math.min(maxDelayMs, baseDelayMs * 2 ** attempts))
    attempts += 1
  }

  const connect = () => {
    if (!active) return
    if (!extensionAlive()) return onGone()
    try {
      port = chrome.runtime.connect({ name: portName })
      connectedAt = Date.now()
      port.onDisconnect.addListener(onDisconnect)
    } catch {
      onGone()
    }
  }

  const stop = () => {
    active = false
    clearTimeout(timer)
    try {
      port?.disconnect()
    } catch {
      port = undefined
    }
    port = undefined
  }

  const start = () => {
    if (active) return
    active = true
    attempts = 0
    connect()
  }

  return { start, stop }
}
