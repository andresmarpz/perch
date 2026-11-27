import { launch, sleep } from "./lib";
const ctx = await launch();
const p = await ctx.newPage();
await p.goto("https://www.twitch.tv/rubius", { waitUntil: "domcontentloaded" });
await sleep(9000);
const info = await p.evaluate(() => {
  const v = document.querySelector("video")!;
  const chain: string[] = [];
  for (let e: Element | null = v; e && e !== document.body; e = e.parentElement)
    chain.push(`${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}[${[...e.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name + "=" + a.value.slice(0, 40)).join(" ")}] .${(e.getAttribute("class") || "").split(" ").slice(0, 3).join(".")}`);
  const q = (s: string) => document.querySelectorAll(s).length;
  const fs = document.querySelector('[data-a-target="player-fullscreen-button"]')!;
  const ctrlChain: string[] = [];
  for (let e: Element | null = fs; e && e !== document.body; e = e.parentElement)
    ctrlChain.push(`${e.tagName.toLowerCase()}[${[...e.attributes].filter((a) => a.name.startsWith("data-")||a.name==="class").map((a) => a.name + "=" + a.value.slice(0, 70)).join(" ")}]`);
  const ctrl = fs.closest(".player-controls__right-control-group");
  return {
    chain, ctrlChain: ctrlChain.slice(0, 7),
    videoCount: q("video"),
    playerRoot: q('[data-a-target="video-player"]'), playerLayout: document.querySelector("[data-a-player-type]")?.getAttribute("data-a-player-type"),
    rightGroup: ctrl ? [...ctrl.children].map((c) => c.outerHTML.slice(0, 160)) : null,
    rightGroupBtns: ctrl ? [...ctrl.querySelectorAll("button")].map((b) => b.getAttribute("data-a-target") + "|" + b.getAttribute("aria-label")) : null,
    leftGroup: [...document.querySelectorAll(".player-controls__left-control-group button")].map((b) => b.getAttribute("data-a-target") + "|" + b.getAttribute("aria-label")),
    liveIndicator: [q(".live-indicator-container"), q('[data-a-target="player-state-live"]')],
    channelNameCandidates: {
      h1: document.querySelector("h1")?.textContent,
      chanInfo: document.querySelector('[data-a-target="stream-title"]')?.textContent,
      userDisplay: document.querySelector('[data-a-target="user-display-name"]')?.textContent,
      pageTitle: document.title,
      ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      ogType: document.querySelector('meta[property="og:type"]')?.getAttribute("content"),
    },
    liveCandidates: [...document.querySelectorAll(".tw-channel-status-text-indicator, [data-a-target='animated-channel-viewers-count'], [data-a-target='player-overlay-live-indicator'], .live-time")].map((e) => (e.getAttribute("data-a-target")||e.className.toString().slice(0,40)) + ":" + (e.textContent||"").slice(0,20)),
    codecs: { h264: document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'), mse: typeof MediaSource !== "undefined" && MediaSource.isTypeSupported('video/mp4; codecs="avc1.64002A"') },
  };
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
