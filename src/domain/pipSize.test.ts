import { expect, test } from "bun:test"
import { sizeToRequest } from "./pipSize.ts"

const saved = { width: 480, height: 270 }

test("the first window of the browser session asks for the saved size", () => {
  expect(sizeToRequest(false, saved)).toEqual(saved)
})

test("later windows ask for no size so Chrome restores the last bounds", () => {
  expect(sizeToRequest(true, saved)).toBeUndefined()
})
