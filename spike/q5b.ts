// PING/PONG check straight from bun (same wire protocol as the content script)
const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
const t0 = Date.now(); const out: string[] = [];
ws.onopen = () => { ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands"); ws.send("PASS SCHMOOPIIE"); ws.send("NICK justinfan" + (10000 + Math.floor(Math.random() * 89999))); ws.send("JOIN #rubius"); setTimeout(() => ws.send("PING :spike-check"), 3000); };
ws.onmessage = (e) => { for (const l of String(e.data).split("\r\n")) if (/PING|PONG/.test(l)) out.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${l}`); };
await new Promise((r) => setTimeout(r, 8000));
console.log(out); ws.close();
