// Throwaway spike content script (isolated world).
const root = document.documentElement;
const st = (k, v) => root.setAttribute("data-spike-" + k, String(v));
st("loaded", "1");
st("dpip-in-isolated", String(typeof documentPictureInPicture !== "undefined"));

const VIDEO_SEL = "video";
let pipWin = null, origParent = null, origNext = null, videoEl = null, origStyle = null;
const log = [];
const note = (m) => { log.push(m); st("log", log.join(" | ").slice(-1500)); };

function mkBtn(id, label, top, fn) {
  const b = document.createElement("button");
  b.id = id; b.textContent = label;
  b.style.cssText = `position:fixed;z-index:2147483647;right:10px;top:${top}px;padding:6px`;
  b.addEventListener("click", () => fn().catch((e) => { note("ERR " + id + " " + e); st("error", e); }));
  document.body.append(b);
}

async function openPip(withChat) {
  videoEl = document.querySelector(VIDEO_SEL);
  origParent = videoEl.parentElement; origNext = videoEl.nextSibling; origStyle = videoEl.getAttribute("style");
  const w = await documentPictureInPicture.requestWindow({ width: 800, height: withChat ? 500 : 450 });
  pipWin = w; st("pip", "open");
  w.document.body.style.cssText = "margin:0;background:#000;display:flex;height:100vh";
  videoEl.style.cssText = "flex:1;min-width:0;height:100%";
  w.document.body.append(videoEl);
  st("moved", "1");
  if (withChat) {
    const f = w.document.createElement("iframe");
    f.id = "spike-chat";
    f.src = `https://www.twitch.tv/embed/${location.pathname.split("/")[1]}/chat?parent=www.twitch.tv&darkpopout`;
    f.style.cssText = "width:340px;flex:none;border:0;height:100%";
    w.document.body.append(f);
  }
  w.addEventListener("pagehide", () => {
    origParent.insertBefore(videoEl, origNext);
    if (origStyle === null) videoEl.removeAttribute("style"); else videoEl.setAttribute("style", origStyle);
    st("pip", "closed"); st("returned", "1");
  });
}

function setup() {
  if (document.getElementById("spike-pip-btn")) return;
  mkBtn("spike-pip-btn", "PiP video", 10, () => openPip(false));
  mkBtn("spike-pip-chat-btn", "PiP video+chat", 50, () => openPip(true));
  mkBtn("spike-irc-btn", "IRC", 90, async () => {
    const ch = location.pathname.split("/")[1].toLowerCase();
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    const lines = []; window.__spikeLines = lines;
    ws.onopen = () => {
      st("irc", "open");
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send("NICK justinfan" + String(10000 + Math.floor(Math.random() * 89999)));
      ws.send("JOIN #" + ch);
    };
    ws.onerror = () => st("irc", "error");
    ws.onclose = (e) => st("irc", "closed " + e.code);
    ws.onmessage = (e) => {
      for (const l of String(e.data).split("\r\n").filter(Boolean)) {
        if (l.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); st("ping", (+root.dataset.spikePing || 0) + 1); }
        lines.push(l);
        const n = lines.filter((x) => x.includes(" PRIVMSG ")).length;
        st("privmsg", n);
        st("irc-sample", JSON.stringify(lines.slice(0, 12)).slice(0, 4000));
        if (n >= 3 && !root.dataset.spikePrivSample) st("priv-sample", JSON.stringify(lines.filter((x) => x.includes(" PRIVMSG ")).slice(0, 3)).slice(0, 3000));
      }
    };
  });
}
setup();
new MutationObserver(setup).observe(document.documentElement, { childList: true });
