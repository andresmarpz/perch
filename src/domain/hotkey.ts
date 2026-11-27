export interface Hotkey {
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
  readonly key: string
}

export interface KeyEventLike {
  readonly key: string
  readonly code: string
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
}

const modifierAliases: Readonly<Record<string, "ctrl" | "alt" | "shift" | "meta">> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
  win: "meta",
}

const namedKeys: Readonly<Record<string, string>> = {
  space: "Space",
  enter: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
}

const normalizeKey = (raw: string): string | undefined => {
  if (/^[a-z]$/i.test(raw)) return raw.toUpperCase()
  if (/^[0-9]$/.test(raw)) return raw
  if (/^f([1-9]|1[0-2])$/i.test(raw)) return raw.toUpperCase()
  return namedKeys[raw.toLowerCase()]
}

export const parseHotkey = (input: string): Hotkey | undefined => {
  const parts = input.split("+").map((part) => part.trim())
  const rawKey = parts.pop()
  if (rawKey === undefined) return undefined
  const key = normalizeKey(rawKey)
  if (key === undefined) return undefined

  const mods = { ctrl: false, alt: false, shift: false, meta: false }
  for (const part of parts) {
    const mod = modifierAliases[part.toLowerCase()]
    if (mod === undefined || mods[mod]) return undefined
    mods[mod] = true
  }
  if (!mods.ctrl && !mods.alt && !mods.meta) return undefined
  return { ...mods, key }
}

export const formatHotkey = (hotkey: Hotkey): string =>
  [hotkey.ctrl && "Ctrl", hotkey.alt && "Alt", hotkey.shift && "Shift", hotkey.meta && "Meta", hotkey.key]
    .filter((part): part is string => part !== false)
    .join("+")

const codeFor = (key: string): string => {
  if (/^[A-Z]$/.test(key)) return `Key${key}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return key
}

const keyMatches = (hotkey: Hotkey, event: KeyEventLike): boolean => {
  if (event.code !== "") return event.code === codeFor(hotkey.key)
  return event.key.toUpperCase() === hotkey.key.toUpperCase()
}

export const matches = (hotkey: Hotkey, event: KeyEventLike): boolean =>
  event.ctrlKey === hotkey.ctrl &&
  event.altKey === hotkey.alt &&
  event.shiftKey === hotkey.shift &&
  event.metaKey === hotkey.meta &&
  keyMatches(hotkey, event)
