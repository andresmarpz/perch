import { launch, sleep, videoState } from "./lib";
const ctx = await launch();
const p = await ctx.newPage();
let pip: import("playwright").Page | undefined;
ctx.on("page", (np) => { pip = np; });
await p.goto("https://www.twitch.tv/rubius", { waitUntil: "domcontentloaded" });
const ready = () => p.waitForFunction(() => { const v = document.querySelector("video"); return v && v.currentTime > 2 && v.videoWidth > 0; }, null, { timeout: 40000 });
await ready();
await p.evaluate(() => { (document.querySelector("video") as any).__tag = "A"; });
// Part 1: SPA nav, no PiP
await p.click('a[data-a-target="side-nav-card"][href="/theburntpeanut"], a[href="/theburntpeanut"]');
await sleep(1500);
console.log("url after SPA nav:", p.url(), "h1:", await p.evaluate(() => document.querySelector("h1")?.textContent));
await ready();
console.log("same video element reused:", await p.evaluate(() => (document.querySelector("video") as any).__tag), "count", await p.evaluate(() => document.querySelectorAll("video").length));
// live vs non-live pages
for (const [name, url] of [["live channel", "/theburntpeanut"], ["offline channel", "/kaicenat"], ["directory", "/directory/all"], ["video VOD", "/videos/1"], ["clips page", "/rubius/clips"], ["channel /videos tab", "/rubius/videos"], ["home", "/"]] as const) {
  await p.goto("https://www.twitch.tv" + url, { waitUntil: "domcontentloaded" });
  await sleep(6000);
  const r = await p.evaluate(() => ({
    path: location.pathname, vid: document.querySelectorAll("video").length,
    player: document.querySelectorAll('[data-a-target="video-player"]').length,
    live: !!document.querySelector('[data-a-target="animated-channel-viewers-count"]'),
    liveBadge: [...document.querySelectorAll('[class*="ChannelStatusTextIndicator"]')].map((e) => e.textContent).join("/"),
    playerType: document.querySelector("[data-a-player-type]")?.getAttribute("data-a-player-type"),
    playPause: document.querySelectorAll('[data-a-target="player-play-pause-button"]').length,
    seekbar: document.querySelectorAll('[data-a-target="player-seekbar"], [data-a-target="player-seekbar-current-time"]').length,
    ogType: document.querySelector('meta[property="og:type"]')?.getAttribute("content"),
    ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
  }));
  console.log(name, url, JSON.stringify(r));
}
// Part 2: SPA nav while PiP open
await p.goto("https://www.twitch.tv/rubius", { waitUntil: "domcontentloaded" });
await ready();
await p.click("#spike-pip-btn"); await sleep(2500);
console.log("pip video:", (await videoState(pip!))?.t);
await p.click('a[href="/theburntpeanut"]'); await sleep(8000);
console.log("after SPA nav w/ PiP open: opener video count", await p.evaluate(() => document.querySelectorAll("video").length), "opener url", p.url());
console.log("opener video state:", await videoState(p));
console.log("pip video state:", await videoState(pip!), "pip closed?", pip!.isClosed());
// Part 3: close pip via CDP-ish Playwright close
await pip!.close().catch((e) => console.log("pip.close err", String(e).slice(0,80)));
await sleep(2000);
console.log("attrs pip:", await p.evaluate(() => [document.documentElement.dataset.spikePip, document.documentElement.dataset.spikeReturned]));
await ctx.close();
