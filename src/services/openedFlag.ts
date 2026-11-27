const key = "pipOpened"

const area = (): chrome.storage.StorageArea | undefined => chrome.storage?.session

export const startOpenedFlag = (onChange: (opened: boolean) => void): (() => void) => {
  const session = area()
  if (session === undefined) return () => undefined
  void session.get(key).then((items) => onChange(items[key] === true), () => undefined)
  const listener = (changed: { readonly [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName === "session" && changed[key] !== undefined) onChange(changed[key].newValue === true)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

export const markOpened = (): Promise<boolean> => {
  const session = area()
  if (session === undefined) return Promise.resolve(false)
  return session.set({ [key]: true }).then(() => true, () => false)
}
