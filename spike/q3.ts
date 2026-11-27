import { launch, sleep, videoState } from "./lib";
const t0 = Date.now();
const ch = process.argv[2] ?? "rubius";
const ctx = await launch();
const p = await ctx.newPage();
let pip: import("playwright").Page | undefined;
ctx.on("page", (np) => { pip = np; });
await p.goto(`https://www.twitch.tv/${ch}`, { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => { const v = document.querySelector("video"); return v && v.currentTime > 2 && v.videoWidth > 0; }, null, { timeout: 40000 });
// instrument: tag the video, and watch the container for mutations in the OPENER document
await p.evaluate(() => {
  const v = document.querySelector("video")!; (v as any).__spikeTag = "orig";
  (window as any).__origVideo = v;
  const c = document.querySelector('[data-a-target="video-ref"]')!;
  const ev: string[] = []; (window as any).__muts = ev;
  new MutationObserver((ms) => ms.forEach((m) => { m.addedNodes.forEach((n) => ev.push("add " + (n as Element).nodeName)); m.removedNodes.forEach((n) => ev.push("rm " + (n as Element).nodeName)); })).observe(c, { childList: true });
  // also watch the whole player for any added <video>
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if ((n as Element).querySelector?.("video") || (n as Element).nodeName === "VIDEO") ev.push("player-added-video-subtree"); }))).observe(document.querySelector('[data-a-target="video-player"]')!, { childList: true, subtree: true });
});
const sel = await p.evaluate(() => { const v = document.querySelector("video")!; return { parentSel: v.parentElement!.getAttribute("data-a-target"), idx: [...v.parentElement!.children].indexOf(v), siblings: v.parentElement!.children.length, style: v.getAttribute("style") }; });
console.log("orig placement", sel);
await p.click("#spike-pip-btn");
await sleep(2000);
console.log("pip open, video in pip:", await videoState(pip!));
await sleep(20000); // residency
console.log("after 20s in pip:", await videoState(pip!));
console.log("opener muts during residency:", await p.evaluate(() => (window as any).__muts), "opener video count:", await p.evaluate(() => document.querySelectorAll("video").length));
console.log("video still the same obj in pip:", await pip!.evaluate(() => (document.querySelector("video") as any).__spikeTag));
// close pip window
await pip!.evaluate(() => window.close()).catch((e) => console.log("close err", String(e).slice(0, 80)));
await sleep(2500);
const a = await p.evaluate(() => Object.fromEntries([...document.documentElement.attributes].filter((a) => a.name.startsWith("data-spike")).map((a) => [a.name, a.value.slice(0, 100)])));
console.log("attrs after close", a, "pip.isClosed", pip!.isClosed());
const back = await p.evaluate(() => { const v = document.querySelector("video")!; return { tag: (v as any).__spikeTag, same: v === (window as any).__origVideo, parentSel: v.parentElement!.getAttribute("data-a-target"), idx: [...v.parentElement!.children].indexOf(v), style: v.getAttribute("style"), count: document.querySelectorAll("video").length }; });
console.log("back", back);
const s0 = await videoState(p); await sleep(4000); const s1 = await videoState(p);
console.log("playing after return:", s0?.t, "->", s1?.t, "paused", s1?.paused);
// Twitch's own pause button
await p.hover('[data-a-target="video-player"]');
await sleep(500);
await p.click('[data-a-target="player-play-pause-button"]', { force: true });
await sleep(1500);
console.log("after Twitch pause click:", await videoState(p));
await p.click('[data-a-target="player-play-pause-button"]', { force: true });
await sleep(3000);
const s2 = await videoState(p);
console.log("after Twitch play click:", s2);
await sleep(3000);
console.log("t advance:", s2?.t, "->", (await videoState(p))?.t);
console.log("muts overall:", await p.evaluate(() => (window as any).__muts));
await p.screenshot({ path: "/tmp/q3.png" });
await ctx.close();
console.log("secs", (Date.now() - t0) / 1000);
