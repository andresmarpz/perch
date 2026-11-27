export const layouts = ["video", "side", "below", "overlay"] as const
export type Layout = (typeof layouts)[number]

export const chatSources = ["twitch", "lite"] as const
export type ChatSource = (typeof chatSources)[number]

export interface WindowSize {
  readonly width: number
  readonly height: number
}

export type WindowSizes = Readonly<Record<Layout, WindowSize>>

export const defaultWindowSizes: WindowSizes = {
  video: { width: 480, height: 270 },
  side: { width: 760, height: 300 },
  below: { width: 420, height: 560 },
  overlay: { width: 480, height: 270 },
}

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

export const sizeFor = (layout: Layout, settings: { readonly windowSizes: WindowSizes }): WindowSize =>
  settings.windowSizes[layout]
