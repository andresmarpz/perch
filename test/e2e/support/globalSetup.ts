import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

export default function globalSetup() {
  execFileSync("bun", ["run", "build"], { cwd: resolve(import.meta.dirname, "../../.."), stdio: "ignore" })
}
