import { Effect, Schema } from "effect"
import { cp, mkdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { renderIcon } from "./icon.ts"

class BuildFailed extends Schema.TaggedError<BuildFailed>()("BuildFailed", {
  step: Schema.String,
  cause: Schema.Defect(),
}) {}

const root = resolve(import.meta.dir, "..")
const dist = join(root, "dist")
const iconSizes = [16, 48, 128] as const

const optionsHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Twitch PiP settings</title>
</head>
<body>
<div id="root"></div>
<script type="module" src="options.js"></script>
</body>
</html>
`

const step = <A>(name: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new BuildFailed({ step: name, cause }) }).pipe(
    Effect.tap(() => Effect.log(`built: ${name}`)),
  )

const bundle = (entry: string, format: "esm" | "iife") =>
  step(`bundle ${entry}`, async () => {
    const result = await Bun.build({
      entrypoints: [join(root, "src/entry", entry)],
      outdir: dist,
      target: "browser",
      format,
      minify: false,
      sourcemap: "linked",
      naming: "[name].[ext]",
    })
    if (!result.success) throw new AggregateError(result.logs, `bundle ${entry} failed`)
  })

const icons = step("icons", async () => {
  await mkdir(join(dist, "icons"), { recursive: true })
  await Promise.all(iconSizes.map((size) => Bun.write(join(dist, "icons", `icon${size}.png`), renderIcon(size))))
})

const program = Effect.gen(function*() {
  yield* step("clean dist", () => rm(dist, { recursive: true, force: true }))
  yield* step("make dist", () => mkdir(dist, { recursive: true }))
  yield* Effect.all(
    [
      bundle("content.ts", "iife"),
      bundle("mainWorld.ts", "iife"),
      bundle("background.ts", "esm"),
      bundle("options.ts", "esm"),
      step("manifest", () => cp(join(root, "manifest.json"), join(dist, "manifest.json"))),
      step("options.html", () => Bun.write(join(dist, "options.html"), optionsHtml)),
      icons,
    ],
    { concurrency: "unbounded", discard: true },
  )
})

await Effect.runPromise(program)
