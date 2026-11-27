export interface IrcLine {
  readonly tags: Readonly<Record<string, string>>
  readonly prefix: string | undefined
  readonly command: string
  readonly params: ReadonlyArray<string>
  readonly trailing: string | undefined
}

const tagEscapes: Readonly<Record<string, string>> = {
  s: " ",
  ":": ";",
  "\\": "\\",
  r: "\r",
  n: "\n",
}

export const unescapeTag = (value: string): string =>
  value.replace(/\\(.?)/g, (_, c: string) => tagEscapes[c] ?? c)

const parseTags = (raw: string): Record<string, string> => {
  const tags: Record<string, string> = {}
  for (const part of raw.split(";")) {
    if (part === "") continue
    const eq = part.indexOf("=")
    if (eq === -1) tags[part] = ""
    else tags[part.slice(0, eq)] = unescapeTag(part.slice(eq + 1))
  }
  return tags
}

export const parseLine = (input: string): IrcLine | undefined => {
  let rest = input.replace(/[\r\n]+$/, "")
  let tags: Record<string, string> = {}
  let prefix: string | undefined

  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ")
    if (end === -1) return undefined
    tags = parseTags(rest.slice(1, end))
    rest = rest.slice(end + 1).trimStart()
  }
  if (rest.startsWith(":")) {
    const end = rest.indexOf(" ")
    if (end === -1) return undefined
    prefix = rest.slice(1, end)
    rest = rest.slice(end + 1).trimStart()
  }

  let trailing: string | undefined
  const trailingStart = rest.indexOf(" :")
  if (trailingStart !== -1) {
    trailing = rest.slice(trailingStart + 2)
    rest = rest.slice(0, trailingStart)
  } else if (rest.startsWith(":")) {
    return undefined
  }

  const words = rest.split(" ").filter((w) => w !== "")
  const [command, ...params] = words
  if (command === undefined) return undefined
  return { tags, prefix, command, params, trailing }
}

export const splitFrame = (frame: string): ReadonlyArray<string> =>
  frame.split("\r\n").filter((line) => line !== "")

export const nickOf = (prefix: string | undefined): string | undefined => {
  if (prefix === undefined) return undefined
  const bang = prefix.indexOf("!")
  return bang === -1 ? undefined : prefix.slice(0, bang)
}
