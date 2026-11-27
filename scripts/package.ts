import { Effect, Schema } from "effect"
import { rm } from "node:fs/promises"
import { join, resolve } from "node:path"

class PackageFailed extends Schema.TaggedError<PackageFailed>()("PackageFailed", {
  step: Schema.String,
  cause: Schema.Defect(),
}) {}

const root = resolve(import.meta.dir, "..")

const step = <A>(name: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new PackageFailed({ step: name, cause }) })

const sh = async (cmd: string[], cwd: string) => {
  const proc = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" })
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(" ")} failed`)
}

const program = Effect.gen(function*() {
  yield* step("build", () => sh(["bun", "scripts/build.ts"], root))
  const manifest = yield* step("manifest", () => Bun.file(join(root, "dist/manifest.json")).json() as Promise<{ version: string }>)
  const zip = join(root, `perch-${manifest.version}.zip`)
  yield* step("clean", () => rm(zip, { force: true }))
  yield* step("zip", () => sh(["zip", "-r", "-X", zip, ".", "-x", "*.map"], join(root, "dist")))
  yield* Effect.log(`packaged ${zip}`)
})

await Effect.runPromise(program)
