import { launch, sleep } from "./lib";
const ctx = await launch();
const p = await ctx.newPage();
await p.goto("https://www.twitch.tv/rubius", { waitUntil: "domcontentloaded" });
await sleep(5000);
console.log("no gesture:", await p.evaluate(() => (documentPictureInPicture as any).requestWindow({ width: 400, height: 300 }).then(() => "opened", (e: any) => e.name + ": " + e.message)));
await ctx.close();
