import { launch, sleep, videoState } from "./lib";
const t0 = Date.now();
const ch = process.argv[2] ?? "rubius";
const mode = process.argv[3] ?? "chat"; // "video" | "chat"
const ctx = await launch();
const p = await ctx.newPage();
const consoleMsgs: string[] = [];
p.on("console", (m) => { const t = m.text(); if (/Refused|frame-ancestors|X-Frame|CSP|Content Security|spike|ERR/i.test(t)) consoleMsgs.push(t.slice(0, 250)); });
const newPages: string[] = [];
let pipPage: import("playwright").Page | undefined;
ctx.on("page", (np) => { newPages.push("context.on(page): " + np.url()); pipPage = np; });
await p.goto(`https://www.twitch.tv/${ch}`, { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => { const v = document.querySelector("video"); return v && v.currentTime > 2 && v.videoWidth > 0; }, null, { timeout: 40000 });
console.log("before", await videoState(p));
await p.click(mode === "chat" ? "#spike-pip-chat-btn" : "#spike-pip-btn");
await sleep(3000);
const attrs = () => p.evaluate(() => Object.fromEntries([...document.documentElement.attributes].filter((a) => a.name.startsWith("data-spike")).map((a) => [a.name, a.value.slice(0, 300)])));
console.log("(c) opener attrs", await attrs());
console.log("(a) newPages", newPages, "ctx.pages()", ctx.pages().map((x) => x.url()));
// (b) CDP
const bs = ctx.browser();
console.log("ctx.browser()", !!bs);
const s = await ctx.newCDPSession(p);
const targets = await s.send("Target.getTargets");
console.log("(b) CDP page targets:", targets.targetInfos.filter((t) => t.type === "page").map((t) => `${t.type}|${t.url.slice(0, 60)}|${t.title.slice(0,20)}|opener=${t.openerId ? "yes":"no"}`));
console.log("video in opener after move:", await videoState(p));
console.log("opener has <video>?", await p.evaluate(() => !!document.querySelector("video")));
// find pip page
const pip = pipPage;
if (pip) {
  console.log("pip page url:", pip.url(), "inner", await pip.evaluate(() => [innerWidth, innerHeight]));
  await pip.setViewportSize({ width: 800, height: 500 });
  console.log("pip video:", await videoState(pip));
  await sleep(5000);
  console.log("pip video +5s:", await videoState(pip));
  console.log("pip frames:", pip.frames().map((f) => f.url().slice(0, 100)));
  const chatFrame = pip.frames().find((f) => /chat/.test(f.url()) && f !== pip.mainFrame());
  if (chatFrame) {
    await sleep(7000);
    const n = await chatFrame.evaluate(() => document.querySelectorAll(".chat-line__message, [data-a-target='chat-line-message'], .chat-line__no-background").length).catch((e) => "evalerr " + e);
    console.log("chat lines:", n, "frame url", chatFrame.url());
    const text = await chatFrame.evaluate(() => document.body.innerText.slice(0, 400)).catch((e) => "evalerr " + e);
    console.log("chat text:", JSON.stringify(text));
  }
  await pip.screenshot({ path: `/tmp/pip-${mode}.png` }).catch((e) => console.log("pip screenshot err", String(e).slice(0, 100)));
}
console.log("console:", consoleMsgs);
await ctx.close();
console.log("secs", (Date.now() - t0) / 1000);
