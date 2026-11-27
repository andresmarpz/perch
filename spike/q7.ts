import { launch, sleep } from "./lib";
const ctx = await launch();
const p = await ctx.newPage();
await p.goto("https://www.twitch.tv/rubius", { waitUntil: "domcontentloaded" });
await sleep(8000);
const r = await p.evaluate(async () => {
  const out: any = { ua: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] };
  try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as any, () => {}); out.handler = "accepted"; } catch (e) { out.handler = "threw: " + e; }
  try { out.perm = await (navigator.permissions as any).query({ name: "automatic-picture-in-picture" } as any).then((s: any) => s.state); } catch (e) { out.perm = "query threw: " + e; }
  out.autoPipAttr = "autoPictureInPicture" in HTMLVideoElement.prototype;
  out.dpip = typeof documentPictureInPicture;
  return out;
});
console.log(r);
await ctx.close();
