import { deflateSync } from "node:zlib"

type Rgb = readonly [number, number, number]

const purple: Rgb = [0x91, 0x46, 0xff]
const white: Rgb = [255, 255, 255]
const samples = 4

const insideRoundedSquare = (x: number, y: number): boolean => {
  const radius = 0.22
  const dx = Math.max(radius - x, 0, x - (1 - radius))
  const dy = Math.max(radius - y, 0, y - (1 - radius))
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 && dx * dx + dy * dy <= radius * radius
}

const insideRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1

const insideGlyph = (x: number, y: number): boolean => {
  const outer = insideRect(x, y, 0.2, 0.27, 0.8, 0.73)
  const hole = insideRect(x, y, 0.27, 0.34, 0.73, 0.66)
  const inset = insideRect(x, y, 0.47, 0.45, 0.73, 0.66)
  return (outer && !hole) || inset
}

const pixel = (px: number, py: number, size: number): readonly [number, number, number, number] => {
  let shape = 0
  let glyph = 0
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const x = (px + (sx + 0.5) / samples) / size
      const y = (py + (sy + 0.5) / samples) / size
      if (insideRoundedSquare(x, y)) {
        shape++
        if (insideGlyph(x, y)) glyph++
      }
    }
  }
  const total = samples * samples
  if (shape === 0) return [0, 0, 0, 0]
  const mix = glyph / shape
  const channel = (i: 0 | 1 | 2) => Math.round(purple[i] * (1 - mix) + white[i] * mix)
  return [channel(0), channel(1), channel(2), Math.round((shape / total) * 255)]
}

const crcTable = (): Uint32Array => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const table = crcTable()

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff
  for (const byte of bytes) c = (table[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export const renderIcon = (size: number): Uint8Array => {
  const header = new Uint8Array(13)
  const headerView = new DataView(header.buffer)
  headerView.setUint32(0, size)
  headerView.setUint32(4, size)
  header.set([8, 6, 0, 0, 0], 8)

  const raw = new Uint8Array(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    for (let x = 0; x < size; x++) raw.set(pixel(x, y, size), row + 1 + x * 4)
  }

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
