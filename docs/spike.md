# Twitch Document PiP spike: findings

Run on 2026-11-26, macOS arm64, anonymous (not logged in), channel `rubius` (about 30k viewers, live).

## Versions and timing (Q8)

- Chromium: Playwright bundled Chromium `159.0.8154.6` (`chromium-1255`), UA `Chrome/159.0.0.0`. Headless mode: new headless (`channel: "chromium"`, `headless: true`).
- Playwright: `1.65.1` (`playwright`, `@playwright/test`), Bun `1.3.14`.
- No Chrome for Testing needed. The bundled Chromium decodes the Twitch stream (`canPlayType('video/mp4; codecs="avc1.42E01E"')` is `probably`, MSE `isTypeSupported` for `avc1.64002A` is `true`). It played 720p and 1080p.
- Script run times (wall clock, includes launch): q1 15 s, q2 20 s, q3 41 s, q5 25 s, q6 15 s, q6b ~100 s, q7 10 s. All together about 4 minutes (`./run-all.sh`).

## Q1. Extension + video in headless: WORKS

- Unpacked MV3 extension with a content script on `https://www.twitch.tv/*` loads in headless via `--disable-extensions-except=<dir> --load-extension=<dir>` with `launchPersistentContext(dir, { headless: true, channel: "chromium" })`. The content script sets `data-spike-loaded=1` on `<html>`.
- Evidence (`bun q1.ts rubius`): `video.currentTime` 6.43 then 11.44 five seconds later, `videoWidth x videoHeight` 1280x720, `paused: false`, `readyState: 4`, `error: null`.
- Anonymous visit: no mature gate, no "start watching" gate, no login wall on `rubius` or `theburntpeanut`. Playback starts by itself (`--autoplay-policy=no-user-gesture-required` is passed, so I did not test without it). A mature-flagged channel may show a gate: not tested. If it does, the button is `[data-a-target="player-overlay-mature-accept"]` (from memory of Twitch, not verified here).
- Trap: `/kaicenat` was offline. Twitch then plays a VOD preview (640x360, `data-a-player-type="channel_home_carousel"`) in a `<video>`, so `currentTime` advancing does not prove "live". Pick a channel from `/directory/all` (`a[data-a-target="preview-card-channel-link"]`, `bun live.ts`).
- Harmless console noise: GraphQL `unauthenticated` / `failed integrity check`, ad-sync `ERR_NAME_NOT_RESOLVED`.

## Q2. Document PiP in headless: WORKS WITH CAVEAT

- `documentPictureInPicture` is visible in the content script's isolated world (`data-spike-dpip-in-isolated=true`). The injected button handler called `await documentPictureInPicture.requestWindow({ width: 800, height: 450 })` after a Playwright `page.click("#spike-pip-btn")`. It opened.
- Caveat: headless does not enforce user activation. A call from `page.evaluate` (main world, no gesture) also opened: `no gesture: opened` (`bun q2b.ts`). So the spike cannot prove the gesture requirement. In headed Chrome the spec requires transient user activation; the product must call `requestWindow` synchronously inside the click handler (before any `await` that could lose activation).
- Reaching the PiP window from Playwright:
  - (a) `context.on("page", p => ...)`: WORKS. Fires once with `url() === "about:blank"`. The PiP also shows up in `context.pages()`, but `pages()` has other `about:blank` pages (initial tab), so pick the page from the event. This is the recommended way. From that `Page`, `evaluate`, `frames()`, `screenshot` and `close()` all work.
  - (b) CDP `Target.getTargets` (`ctx.newCDPSession(page)`): WORKS. Lists the PiP as `type: page`, `url: about:blank`, `openerId` set (the only about:blank page with an opener). Useful to tell it apart.
  - (c) DOM attributes on the opener page (content script writes `data-spike-*` on `<html>`, test reads them with `page.evaluate`): WORKS. Good for state (`pip=open|closed`, `moved`, `returned`).
- Playwright applies the context viewport (1280x800) to the PiP page: `innerWidth` was 1280 although I asked for 800 wide. Use `pip.setViewportSize({width:800,height:500})` before screenshots. Real window size is not checked by this setup.

## Q3. Moving the video: WORKS WITH CAVEAT

Code: `bun q3.ts rubius`. The content script does:

```js
const video = document.querySelector("video");
const parent = video.parentElement, next = video.nextSibling, style = video.getAttribute("style");
const w = await documentPictureInPicture.requestWindow({ width: 800, height: 450 });
w.document.body.append(video);
w.addEventListener("pagehide", () => {
  parent.insertBefore(video, next);
  style === null ? video.removeAttribute("style") : video.setAttribute("style", style);
});
```

- In the PiP window: same element object (tag set before the move survived), `currentTime` 4.16 then 24.14 after 20 s residency, 1920x1080, `paused: false`, `error: null`. The PiP window went through 20 s with no React replacement: the only mutation on the original container was my own `rm VIDEO`; no `<video>` was added in the opener (`document.querySelectorAll("video").length === 0` there).
- Return: `pagehide` fires on `window.close()` (called inside the PiP page) and on Playwright `pip.close()` (CDP target close, q6b: `returned=1`). Not tested: clicking the real X button in headed Chrome (it should be the same path).
- After return: the same object (`v === originalVideo`), same parent, index 0 of 3 siblings, `currentTime` 26.66 then 30.66, not paused.
- Twitch's controls after return: clicking `[data-a-target="player-play-pause-button"]` (with `force: true`, controls are hidden until hover) paused it. A second click resumed it and it advanced 1.99 s to 4.99 s. Caveat: for live, pause resets the element (`currentTime` goes to 0, `readyState` 1, `videoWidth` 1280): Twitch tears down and reloads the stream (jump to live). Still the same element.
- Style: original `style` attribute was absent. After return it read `""` (the attribute exists but empty). Harmless, Twitch (or the return path) wrote it. Do not rely on exact restore of `style`.
- Selectors used: video `video` (exactly one on a channel page); original parent `[data-a-target="video-ref"]` (the video is its first of 3 children).
- Surprise (SPA navigation while the PiP is open, `bun q6b.ts`): after clicking a side-nav link to another channel, the opener has zero `<video>` elements and the video element stays in the PiP. Its `currentTime` went from 4.63 to 7.16 over about 11 s, so Twitch most likely reloaded the stream into the same element for the new channel (not confirmed which channel it shows). So the PiP follows or breaks on navigation. See Recommendations.

## Q4. Chat embed in the PiP window: WORKS

- `https://www.twitch.tv/embed/rubius/chat?parent=www.twitch.tv&darkpopout` as `<iframe>` in the PiP document. Frame URL became `.../embed/rubius/chat?darkpopout&parent=www.twitch.tv`. No `X-Frame-Options`, `frame-ancestors` or CSP console errors.
- `parent=www.twitch.tv` is accepted even though the iframe sits in the `about:blank` PiP document (its origin chain is the opener's, so Twitch's `frame-ancestors` check passed). Messages flowed: "Welcome to rubius's chat room!" and live lines. Selector `.chat-line__message, [data-a-target='chat-line-message'], .chat-line__no-background` matched 16 elements at 12 s and 210 to 244 in later runs (the count may include duplicates, but text reads as real chat). Screenshot showed video left, chat right, with the login nudge and an emote banner on top.
- Layout gotcha: set `flex: none` on the iframe and `min-width: 0` on the video, else the video flex item squeezes the iframe to 0 px.
- `/popout/<channel>/chat` not tried because the embed worked.
- Anonymous embed: the input says "Send a message" with a Log in prompt; chat is read only.

## Q5. Anonymous chat over IRC WebSocket: WORKS

- Content script (isolated world) opened `wss://irc-ws.chat.twitch.tv:443`, no CSP block (the page CSP did not block it, console is clean). Handshake sequence worked: `CAP REQ :twitch.tv/tags twitch.tv/commands`, `PASS SCHMOOPIIE`, `NICK justinfan<5 digits>`, `JOIN #rubius`. 146 PRIVMSG in 15 s on a 30k-viewer channel (about 10 per second).
- Raw lines (`bun q5.ts`):

```
:tmi.twitch.tv CAP * ACK :twitch.tv/tags twitch.tv/commands
:tmi.twitch.tv 001 justinfan77450 :Welcome, GLHF!
:justinfan77450!justinfan77450@justinfan77450.tmi.twitch.tv JOIN #rubius
@emote-only=0;followers-only=43200;r9k=0;room-id=39276140;slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #rubius
@badge-info=subscriber/12;badges=subscriber/12,campaign-39276140-822e14bb-3596-4a88-b934-d4dfa4bb8549-mw/1;client-nonce=574d5c4ceb164c9b8cd9c524c85a00ed;color=#FFA8E7;display-name=Lala_notz;emotes=;first-msg=0;flags=;id=a678c65d-88a1-47a2-bf0e-912b85a11ed8;mod=0;returning-chatter=0;room-id=39276140;subscriber=1;tmi-sent-ts=1795746055686;turbo=0;user-id=705364612;user-type= :lala_notz!lala_notz@lala_notz.tmi.twitch.tv PRIVMSG #rubius :adios
@badge-info=;badges=miami-chain/1;color=#FF4500;display-name=jrobert03;emotes=;first-msg=0;id=7d276d9c-407a-490a-aa9a-116fcae1a375;mod=0;room-id=39276140;subscriber=0;tmi-sent-ts=1795746055680;user-id=446470893;user-type= :jrobert03!jrobert03@jrobert03.tmi.twitch.tv PRIVMSG #rubius :BYE
```

- One WebSocket message can contain several lines joined by `\r\n`: split on `\r\n`. Tags are `;`-separated `key=value`, values escape `\s` (space), `\:` (`;`), `\\`, `\r`, `\n`. `emotes=` is `id:start-end,start-end/id2:...` (character offsets on the message). Not tested here: `/me` ACTION (`\x01ACTION ...\x01`), USERNOTICE, CLEARCHAT, CLEARMSG.
- PING/PONG: server-initiated PING did not arrive in the 15 s window (Twitch documents about every 5 minutes: `PING :tmi.twitch.tv`, answer `PONG :tmi.twitch.tv`). I did not wait 5 min. Client-initiated check works: sent `PING :spike-check`, got `:tmi.twitch.tv PONG tmi.twitch.tv :spike-check` after 1.1 s (`bun q5b.ts`). The content script's PONG path is coded but not exercised by a real server PING.
- Not covered: a MV3 content script WebSocket is tied to the page's lifetime (fine here), emotes need images from `static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/1.0` (not fetched).

## Q6. Twitch DOM: WORKS WITH CAVEAT

Stable-looking selectors (Twitch uses styled-components hashed classes like `Layout-sc-1xcs6mc-0`: avoid those; only `data-a-target` and a few semantic classes are stable):

| What | Selector (observed 2026-11-26) |
|---|---|
| Player root | `[data-a-target="video-player"]` (has `data-a-player-type`) |
| Video element | `[data-a-target="video-ref"] > video`, or just `video` on channel pages |
| Controls overlay | `[data-a-target="player-controls"]` |
| Right control group | `.player-controls__right-control-group` (contains settings, theatre, fullscreen). Left group is `.player-controls__left-control-group` |
| Buttons | `[data-a-target="player-settings-button"]`, `[data-a-target="player-fullscreen-button"]`, play: `[data-a-target="player-play-pause-button"]`, mute: `[data-a-target="player-mute-unmute-button"]` |
| Theatre button | no `data-a-target`. Use `button[aria-label^="Theatre Mode"], button[aria-label^="Exit Theatre Mode"]` (English only; the label changes with UI language) |
| Insert point for an extra button | in `.player-controls__right-control-group`, `insertBefore(myWrapper, <closest(...) of the fullscreen button>)`: the button's parent chain is `button > div.ScLayoutCssVars > div.InjectLayout > .player-controls__right-control-group`. Insert a sibling of the `div.InjectLayout` wrapper, not inside it |
| Channel name | `<h1>` on the channel page (display name, here `Rubius`). Best for the login name: `location.pathname.split("/")[1].toLowerCase()`, also in `meta[property="og:url"]` and `link[rel=canonical]` (`https://www.twitch.tv/rubius`) |
| Stream title | `[data-a-target="stream-title"]` |
| Viewer count (live only) | `[data-a-target="animated-channel-viewers-count"]` |

- There are two copies of the player-control groups in the DOM on a channel page (duplicate `player-play-pause-button` etc.: the page contains a second, hidden controls tree). Scope selectors to `[data-a-target="video-player"]` and take the one that is visible, or check the count.
- Live vs not (`bun q6b.ts`, each page loaded fresh):

| Page | video | `data-a-player-type` | `animated-channel-viewers-count` |
|---|---|---|---|
| `/theburntpeanut` (live) | 1 | `site` | present |
| `/kaicenat` (offline) | 1 (VOD preview) | `channel_home_carousel` | absent, seekbar present |
| `/directory/all` | 0 | none | absent |
| `/rubius/clips`, `/rubius/videos` (channel live) | 1 | `channel_home_live` | absent |
| `/` | 1 | `frontpage` | absent |
| `/videos/<id>` (id 1, may not exist) | 1 | `site_mini` | absent |

- Rule that worked: "live channel page" = path matches `^/[A-Za-z0-9_]{3,25}/?$` and is not a reserved word (`directory`, `videos`, `settings`, ...), and `[data-a-player-type="site"]` exists, and `[data-a-target="animated-channel-viewers-count"]` exists. Not tested: `/videos/<real id>`, a real `/clip/...` or `clips.twitch.tv`, a host/raid redirect, a mini player after navigating away, `m.twitch.tv`. Twitch also keeps the persistent player (`.persistent-player`) when navigating to the directory; not tested.
- SPA navigation (no PiP): clicking a side-nav link from `/rubius` to `/theburntpeanut` kept the same `<video>` element (tag `A` survived) and the count stayed 1. So the element is reused across channels, not replaced. There are no page load events: detect navigation with a `MutationObserver` on `document.title` or `history` patching (content scripts cannot patch the page's `history`; use the `navigation` API `navigation.addEventListener("navigate")` if available, not tested).

## Q7. Automatic PiP (optional): WORKS WITH CAVEAT (docs only, not testable headless)

- `navigator.mediaSession.setActionHandler("enterpictureinpicture", fn)` is accepted without error in Chrome 159 (`bun q7.ts`). `autoPictureInPicture` video attribute is absent (`false`); `permissions.query({name:"automatic-picture-in-picture"})` is not a valid name. Headless cannot hide a tab, so the trigger itself was not tested.
- Docs ([Chrome: automatic PiP](https://developer.chrome.com/blog/automatic-picture-in-picture)): the browser fires the handler when the tab loses focus or is hidden, handler may open Document PiP without a user gesture, window closes when the page becomes visible. Chrome 120 for camera/mic apps; media playback sites from Chrome 133 or 134 (sources disagree; see [media playback post](https://developer.chrome.com/blog/automatic-picture-in-picture-media-playback)): needs media playing in the top frame with audio focus, the handler registered, and the per-site "automatic picture-in-picture" setting allowed (the user can set it; default for ordinary browsing not settled by the docs). A third-party extension (`apotenza92/chrome-auto-pip`) exists and says the native path may not fire until the site is trusted.
- Verdict: feasible as a stretch, but depends on a user setting we cannot set from the extension. Needs a headed manual test.

## Files

All in `/Users/andres/dev/twitch-pip/spike/`. Install: `bun install`, `bunx playwright install chromium`.

- `ext/manifest.json`, `ext/content.js`: throwaway MV3 extension. Injects 3 fixed buttons (`#spike-pip-btn` video only, `#spike-pip-chat-btn` video plus chat, `#spike-irc-btn` IRC) and writes state to `data-spike-*` attributes on `<html>`.
- `lib.ts`: `launch()` (persistent context, headless, extension loaded), `videoState()`.
- `live.ts`: find live channels from the directory. `q1.ts [channel]`: Q1. `q2.ts [channel] [video|chat]`: Q2 and Q4 (also screenshots to `/tmp/pip-*.png`). `q2b.ts`: PiP without a gesture. `q3.ts [channel]`: Q3. `q5.ts`: IRC in the extension. `q5b.ts`: raw IRC PING/PONG from Bun. `q6.ts`: DOM dump. `q6b.ts`: SPA navigation, live detection, navigation with PiP open. `q7.ts`: auto PiP feature detection. `run-all.sh`: all of them.
- Run one: `cd spike && bun q2.ts rubius chat`. Channels change: if `rubius` is offline use `bun live.ts` to get a live one.

## Recommendations

- Gesture: call `requestWindow` synchronously in the click handler; headless will not catch a violation, so add one headed manual test (or a headed CI job on a machine with a display) before shipping.
- PiP window ownership: keep a single module-level reference to the PiP window and the video's original parent, next sibling and style. Restore on `pagehide` (works for X button and `close()`), and on the extension's own "return" action.
- SPA navigation with PiP open: Twitch reuses the one `<video>` for the next channel and loads the new stream into it. Decide on behavior: simplest is to detect navigation (title or URL change) and close the PiP first (return the video, then let Twitch navigate). Also close/return before a hard navigation, and if the tab is closed the PiP closes with it.
- Video wiper: do not rely on the video staying where it is. Re-check on `pagehide` that the original parent still exists in the DOM; if it was replaced, append the video to the new `[data-a-target="video-ref"]` or reload the page.
- Pause/play: Twitch resets a live video on pause (jump to live). Do not pause the stream when moving it. Do not try to keep Twitch's controls usable inside the PiP; add minimal own controls (mute, play/pause that calls `video.pause()/play()`, close).
- DOM fragility: use `data-a-target` selectors only, keep one selector module, fail closed (hide the button when the player or right-control group is missing), observe the DOM with a `MutationObserver` since the controls are re-rendered. Theatre button label is language-dependent: insert relative to `player-fullscreen-button` instead.
- Chat: prefer the `/embed/<channel>/chat?parent=www.twitch.tv&darkpopout` iframe (works, full Twitch chat including emotes, badges, login via the user's cookies). Keep the IRC WebSocket as a fallback or for notifications/custom UI: it works anonymously with no CSP issue, but then the product must parse tags, emotes, badges, and answer PING. The `parent` value must match the host the iframe runs under (`www.twitch.tv`); test on `twitch.tv` without `www` too, since the extension matches only `www`.
- Live check: gate the button on the three-part rule in Q6 and hide it on VODs, clips and offline channels (where the video is a preview).
- Auto PiP: ship manual PiP first. Add `enterpictureinpicture` registration later as an opt-in, and tell the user to allow "Automatic picture-in-picture" for twitch.tv in site settings.
- Tests: Playwright headless with the bundled Chromium is enough for DOM and playback tests. Always pick the live channel dynamically, and tolerate network ads (the unauthenticated GraphQL errors are noise).
- Not verified here (do next): headed Chrome behavior (real PiP window size, user activation, X button), logged in state (sub-only streams, ads/preroll, mature gate), `twitch.tv` without `www`, VODs/clips, a second tab, and macOS fullscreen interplay.
