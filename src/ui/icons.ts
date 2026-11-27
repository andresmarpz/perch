export type IconName =
  | "play"
  | "pause"
  | "volume"
  | "muted"
  | "layout-video"
  | "layout-side"
  | "layout-below"
  | "layout-overlay"
  | "chat-twitch"
  | "chat-lite"
  | "opacity"
  | "back"

const frame = '<rect x="3" y="5" width="18" height="14" rx="2.5"/>'

const paths: Readonly<Record<IconName, string>> = {
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  muted: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  "layout-video": `${frame}`,
  "layout-side": `${frame}<path d="M14.5 5v14"/>`,
  "layout-below": `${frame}<path d="M3 13.5h18"/>`,
  "layout-overlay": `${frame}<rect x="5.5" y="12" width="7" height="5" rx="1" fill="currentColor" stroke="none" opacity=".9"/>`,
  "chat-twitch": '<path d="M5 4h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 16h-5l-4 4v-4H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 4z"/><path d="M9.5 8.5v3M14 8.5v3"/>',
  "chat-lite": '<path d="M4 6.5h16M4 12h11M4 17.5h14"/>',
  opacity: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  back: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
}

export const icon = (doc: Document, name: IconName): HTMLElement => {
  const span = doc.createElement("span")
  span.className = "icon"
  span.setAttribute("aria-hidden", "true")
  span.innerHTML =
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
  return span
}
