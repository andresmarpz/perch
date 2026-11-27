export type Route =
  | { readonly _tag: "Channel"; readonly channel: string }
  | { readonly _tag: "Other" }

const reserved: ReadonlySet<string> = new Set([
  "directory",
  "videos",
  "settings",
  "subscriptions",
  "inventory",
  "wallet",
  "drops",
  "downloads",
  "jobs",
  "p",
  "search",
  "turbo",
  "friends",
  "messages",
  "moderator",
  "popout",
  "embed",
  "u",
])

const hosts: ReadonlySet<string> = new Set(["twitch.tv", "www.twitch.tv"])
const channelName = /^[a-z0-9_]{1,25}$/

const other: Route = { _tag: "Other" }

export const parseRoute = (url: string): Route => {
  const parsed = URL.parse(url)
  if (parsed === null || !hosts.has(parsed.hostname.toLowerCase())) return other
  const segments = parsed.pathname.split("/")
  const [, name, rest, ...more] = segments
  if (name === undefined || more.length > 0) return other
  if (rest !== undefined && rest !== "") return other
  const channel = name.toLowerCase()
  if (!channelName.test(channel) || reserved.has(channel)) return other
  return { _tag: "Channel", channel }
}

export const sameRoute = (a: Route, b: Route): boolean =>
  a._tag === "Channel" ? b._tag === "Channel" && a.channel === b.channel : b._tag === "Other"
