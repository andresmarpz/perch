export const portName = "twitch-pip-content"
const reconnectMs = 1000

export const extensionAlive = (): boolean => {
  try {
    return chrome.runtime.id !== undefined
  } catch {
    return false
  }
}

export const watchExtension = (onGone: () => void): (() => void) => {
  let port: chrome.runtime.Port | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const onDisconnect = () => {
    void chrome.runtime.lastError
    port = undefined
    if (stopped) return
    if (!extensionAlive()) return onGone()
    timer = setTimeout(connect, reconnectMs)
  }

  const connect = () => {
    if (stopped) return
    if (!extensionAlive()) return onGone()
    try {
      port = chrome.runtime.connect({ name: portName })
      port.onDisconnect.addListener(onDisconnect)
    } catch {
      onGone()
    }
  }

  connect()

  return () => {
    stopped = true
    clearTimeout(timer)
    try {
      port?.disconnect()
    } catch {
      port = undefined
    }
  }
}
