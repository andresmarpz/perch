import { describe, expect, test } from "bun:test"
import { Effect, Exit, Latch, Scope } from "effect"
import { superviseEnd } from "./PipSession.ts"

const finalizerCount = (scope: Scope.Scope): number => {
  const state = scope.state
  if (state._tag === "Empty") return 0
  if (state._tag === "Closed") return -1
  return 1 + (state.finalizers?.size ?? 0)
}

const cycle = (rootScope: Scope.Scope, how: "close" | "ended") =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const ended = yield* Latch.make(false)
    yield* superviseEnd(rootScope, scope, ended)
    if (how === "close") yield* Scope.close(scope, Exit.void)
    else yield* Latch.open(ended)
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    return scope
  })

describe("superviseEnd", () => {
  test("20 sessions closed from outside leave nothing parked in the root scope", async () => {
    const counts = await Effect.runPromise(
      Effect.gen(function*() {
        const root = yield* Scope.make()
        for (let i = 0; i < 20; i++) yield* cycle(root, "close")
        return finalizerCount(root)
      }),
    )
    expect(counts).toBeLessThanOrEqual(0)
  })

  test("sessions that end through the latch close their scope and leave nothing behind", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const root = yield* Scope.make()
        const closed: Array<boolean> = []
        for (let i = 0; i < 5; i++) {
          const scope = yield* cycle(root, "ended")
          closed.push(scope.state._tag === "Closed")
        }
        return { closed, left: finalizerCount(root) }
      }),
    )
    expect(result.closed).toEqual([true, true, true, true, true])
    expect(result.left).toBeLessThanOrEqual(0)
  })
})
