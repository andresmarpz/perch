const twitchMatches = ["https://www.twitch.tv/*", "https://twitch.tv/*"]

const injectIntoOpenTabs = async () => {
  const tabs = await chrome.tabs.query({ url: twitchMatches })
  await Promise.all(tabs.map(async ({ id }) => {
    if (id === undefined) return
    const target = { tabId: id }
    try {
      await chrome.scripting.executeScript({ target, files: ["mainWorld.js"], world: "MAIN" })
      await chrome.scripting.executeScript({ target, files: ["content.js"] })
    } catch {
      return
    }
  }))
}

const shareSessionStorage = () =>
  void chrome.storage.session?.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }).catch(() => undefined)

shareSessionStorage()

chrome.runtime.onInstalled.addListener(({ reason }) => {
  shareSessionStorage()
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) void chrome.runtime.openOptionsPage()
  void injectIntoOpenTabs()
})

chrome.runtime.onConnect.addListener(() => undefined)
