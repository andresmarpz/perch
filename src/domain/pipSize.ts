import type { WindowSize } from "./layout.ts"

export const sizeToRequest = (openedBefore: boolean, saved: WindowSize): WindowSize | undefined =>
  openedBefore ? undefined : saved
