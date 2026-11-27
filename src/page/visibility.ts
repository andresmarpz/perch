const stateKeys = ["visibilityState", "webkitVisibilityState"] as const
const hiddenKeys = ["hidden", "webkitHidden"] as const
const eventTypes = ["visibilitychange", "webkitvisibilitychange"] as const

export interface VisibilityGuard {
  readonly enable: () => void
  readonly disable: () => void
}

export const makeVisibilityGuard = (doc: Document, win: Window): VisibilityGuard => {
  let spoofing = false
  let blocking = false

  const block = (event: Event) => {
    if (blocking) event.stopImmediatePropagation()
  }
  for (const target of [win, doc]) {
    for (const type of eventTypes) target.addEventListener(type, block, true)
  }

  const realHidden = () => {
    const getter = Object.getOwnPropertyDescriptor(Document.prototype, "hidden")?.get
    return getter === undefined ? false : getter.call(doc) === true
  }

  const announce = () => doc.dispatchEvent(new Event("visibilitychange", { bubbles: true }))

  return {
    enable: () => {
      if (spoofing) return
      const wasHidden = realHidden()
      spoofing = true
      for (const key of stateKeys) Object.defineProperty(doc, key, { configurable: true, get: () => "visible" })
      for (const key of hiddenKeys) Object.defineProperty(doc, key, { configurable: true, get: () => false })
      if (wasHidden) announce()
      blocking = true
    },
    disable: () => {
      if (!spoofing) return
      spoofing = false
      blocking = false
      for (const key of [...stateKeys, ...hiddenKeys]) Reflect.deleteProperty(doc, key)
      if (realHidden()) announce()
    },
  }
}
