import { $ } from "bun"
import { join, resolve } from "node:path"

const out = resolve(import.meta.dir, "../test/e2e/fixtures")
const ffmpeg = process.env["FFMPEG"] ?? "/opt/homebrew/bin/ffmpeg"

const clips = [
  { name: "video-16x9.webm", size: "640x360" },
  { name: "video-4x3.webm", size: "480x360" },
] as const

for (const clip of clips) {
  await $`${ffmpeg} -y -v error -f lavfi -i testsrc2=size=${clip.size}:rate=15 -t 4 -c:v libvpx-vp9 -b:v 120k -crf 40 -pix_fmt yuv420p -an -g 15 ${join(out, clip.name)}`
  console.log(`wrote ${clip.name} (${Bun.file(join(out, clip.name)).size} bytes)`)
}
