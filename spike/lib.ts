import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const EXT = resolve(import.meta.dir, "ext");
export async function launch(opts: { executablePath?: string; channel?: string } = {}): Promise<BrowserContext> {
  const dir = mkdtempSync(join(tmpdir(), "spike-prof-"));
  return chromium.launchPersistentContext(dir, {
    headless: true,
    channel: opts.executablePath ? undefined : (opts.channel ?? "chromium"),
    executablePath: opts.executablePath,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--autoplay-policy=no-user-gesture-required"],
  });
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function videoState(p: Page) {
  return p.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { t: v.currentTime, w: v.videoWidth, h: v.videoHeight, paused: v.paused, ready: v.readyState, err: v.error?.message ?? null, src: v.src.slice(0, 30) } : null;
  });
}
