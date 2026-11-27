export const layouts = ["video", "side", "below", "overlay"] as const
export type Layout = (typeof layouts)[number]

export const chatSources = ["twitch", "lite"] as const
export type ChatSource = (typeof chatSources)[number]

export interface WindowSize {
  readonly width: number
  readonly height: number
}

export const defaultWindowSize: WindowSize = { width: 760, height: 300 }

export const chatSourceFor = (layout: Layout, preferred: ChatSource): ChatSource | undefined => {
  switch (layout) {
    case "video":
      return undefined
    case "overlay":
      return "lite"
    case "side":
    case "below":
      return preferred
  }
}
