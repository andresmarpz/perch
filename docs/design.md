# Perch: design

A Chrome (MV3) extension that pops the Twitch stream you are watching into a Document Picture-in-Picture window, with
chat beside it, under it, or over it.

## Goals

- One click (a button in Twitch's player bar) or one hotkey (default `Alt+Shift+P`) opens the stream in an
  always-on-top PiP window.
- In the PiP window: choose a layout, choose a chat source, control playback, and close back to the tab. The stream keeps
  playing through every transition.
- Settings persist (chrome.storage.sync), including the PiP window size (one size for all layouts).
- Works logged out and logged in. No Twitch API keys, no servers, no tracking.

Out of scope: BTTV/FFZ emotes in lite chat, VOD/clip pages, Firefox/Safari, sending chat from lite chat.

## Stack

- TypeScript 7.0.2 (`tsc` is the Go compiler), `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Effect 4.1.6 (`effect` package only; `Schema`, `Stream`, `Schedule`, `Scope`, `Layer`, `ManagedRuntime` are all in
  `effect`).  Effect 4 differs from Effect 3, so check the Effect 4 docs before using an API from memory.
- Bun 1.3 for install, build (`Bun.build`), scripts and unit tests (`bun test`).
- Playwright 1.65 bundled Chromium (new headless) for end-to-end tests. It decodes H.264 and loads unpacked extensions.
- No UI framework. A tiny typed `h()` DOM helper and CSS strings. The PiP window is a separate document, so all styles are
  injected into it as a `<style>` element.

## Layout

```
manifest.json            MV3 manifest (source of truth, copied into dist/)
scripts/build.ts         Effect program: Bun.build the entries, copy manifest/icons/static, write dist/
src/domain/              Pure logic, no DOM, no chrome.*. Fully unit tested.
  channel.ts             Parse a twitch.tv URL into a live-channel route or not
  irc.ts                 Parse IRC lines (tags, prefix, command, params); split multi-line frames
  chat.ts                ChatMessage model; PRIVMSG -> ChatMessage; emote ranges -> text/emote segments; 7TV segments
  sevenTv.ts             Tolerant decode of 7TV emote sets into a name -> emote map, CDN urls, channel-over-global merge
  quality.ts             Pick the highest Twitch quality (Source first, then height, frame rate, bitrate)
  bridge.ts              The attribute the content script sets on <html> while a session boosts the page
  settings.ts            Settings Schema, defaults, decode with fallback for missing/corrupt fields
  hotkey.ts              Parse "Alt+Shift+P", match a KeyboardEvent-like record, format for display, record a combo
  chatLog.ts             Pure lite-chat log: 150-line cap, ClearChat/ClearMsg, scroll-at-bottom test
  layout.ts              Layout kinds, which chat source a layout allows, default PiP size
src/services/            Effect services (Context.Service + Layer). Thin wrappers over browser APIs.
  SettingsStore.ts       get / set / update / changes Stream over chrome.storage.sync, decoded with settings.ts
  TwitchPage.ts          Find video, player bar, channel; inject the button; Stream of route changes
  LiteChat.ts            Stream<ChatEvent> (messages, clears, connection status) from an anonymous IRC WebSocket,
                         keepalive, reconnect with backoff
  SevenTv.ts             Fetch the 7TV global set and the channel set once per channel per session, cached, with a timeout
  PipSession.ts          Scoped PiP session: open window, move video in, render UI, restore on release
                         (also exports `requestPipWindow`, the sync call the click handler makes)
  videoHandoff.ts        Move the <video> into the PiP stage and back; replay timers; drop ours if Twitch mounted its own
src/ui/                  DOM rendering (no Effect inside render functions; callbacks in, elements out)
  h.ts                   Typed element helper
  pip/                   PiP document: root, toolbar, chat panel (embed iframe or lite list), styles
  options/               Options page
src/page/                Code that runs in the page's own (MAIN) world: visibility guard, Twitch player quality control
src/entry/
  mainWorld.ts           MAIN-world content script (document_start): reads the attribute, runs the page/ code
  content.ts             Content script: build the runtime, wire button + hotkey to PipSession
  extensionLink.ts       Port to the service worker; tells the content script the extension went away
  background.ts          Service worker: open options on install, inject the scripts into open Twitch tabs on install/update,
                         accept the content script's port
  options.ts             Options page entry
test/e2e/                One Playwright smoke test against live twitch.tv
```

## How it works

### Opening

The content script runs on `https://www.twitch.tv/*` and `https://twitch.tv/*`. On every channel route (`/<channel>`, the
route test in `domain/channel.ts`) it injects a PiP button into the visible right control group
(`.player-controls__right-control-group`, before the fullscreen button; there are two copies of the control groups, use
the visible one). The button is not gated on the channel being live: an offline channel page has a player with a VOD
preview, and that is the video the session moves. The session fails with `PlayerNotFound` only when the page has no
`<video>`. VOD and clip pages are not channel routes and get no button. The button and the hotkey `keydown` both carry user
activation, which `documentPictureInPicture.requestWindow` needs. The entry point looks for the player video before it
asks for a window, so a channel page without a player never flashes an empty window. Opening while a session is open
closes it (toggle). The button observer watches the player's parent (the whole document only until a player exists) and
does nothing while the button is connected and visible.

### Gesture handling

`documentPictureInPicture.requestWindow` must run in the click or keydown handler's synchronous turn. The entry point
calls `requestPipWindow(size)` there (no Effect hop first) and hands the resulting `Promise<Window>` to
`PipSession.open(channel, promise)`. The size comes from a settings copy the content script keeps in memory, because
reading `chrome.storage` is async. `PipSession.stateUnsafe()` (`idle | opening | open`) is the sync toggle check: `open`
closes the session, `opening` is ignored.

Chrome restores a PiP window's last position only when the new request has the same size or none, and Perch's saved size changes on every resize. So the first `requestWindow` of a browser session passes the saved size and later ones pass none; the flag lives in `chrome.storage.session` (the service worker opens it to content scripts), mirrored in memory, and without it the size is always passed.

### The session (PipSession)

One `Effect.scoped` program per session:

1. Acquire: `requestWindow({ width, height })` with the saved size (first open of a browser session only). Release: `pipWindow.close()`.
2. Acquire: remember the video's parent and next sibling, move the `<video>` (`[data-a-target="video-ref"] video`) into
   the PiP document. Release: put it back. If the original parent is gone (SPA navigation), put it into the current
   `[data-a-target="video-ref"]`. If none exists, drop it.
3. Render the PiP UI (see below), subscribe to settings changes, persist window size on `resize` (debounced 500 ms,
   inner size, written with `SettingsStore.update`; one size for all layouts). A layout change never resizes the window; the new layout fills the current size.
   The video's playing state is kept: if it played before a move, `play()` is retried at 0, 120 and 500 ms after the move.
   The retries stop when the video resumed and then paused (the user paused it) and when the session ends.
4. The session ends (scope closes) on the first of: PiP `pagehide` (user closed the window), the toolbar's back-to-tab
   button, the hotkey pressed in the tab or in the PiP window, Twitch mounting a different `<video>` in the player, the
   route leaving the channel the session started on, the content script being torn down. The `pagehide` listener is
   attached, and `pip.closed` checked, in the same synchronous step as the window arriving, before any other await.
   `pagehide` restores the video synchronously in the event handler; the rest of the teardown runs through the scope on a
   later tick, so the window is not closed from inside its own `pagehide`.

The session must never leave the tab without its video and never leave it with two. Every exit path goes through the
scope's release. All video checks are limited to the session's own player: the `video-player` element (or `video-ref`)
that our video came from. A second player elsewhere on the page (an ad, a squad or carousel player) is never looked at
and never touched. While the session runs, a `MutationObserver` on that player ends it as soon as Twitch mounts its own
`<video>` in it. At restore the video goes back to its old place; if that player already holds another `<video>`, ours
is dropped (paused and removed) instead. After a restore the same player is watched for 3 s (and one animation frame): if
Twitch mounts its own video in it, ours is removed. The invariant is exactly one `<video>` in the session's player after
any session end. The one exception: if no `video-ref` exists at restore (Twitch navigated away), the video is dropped and
the player has none.

### PiP boost (quality and visibility)

Measured on a live channel in headless Chromium (3 minutes, PiP 760x300, "Let Twitch decide"; headless cannot hide a
tab, so a hidden tab is simulated by overriding the page's visibility getters and firing `visibilitychange`): with the
tab hidden Twitch's auto quality went 720p60 to 360p30 at about 70 s and stayed there (two earlier runs: Twitch stopped
the stream at about 40 s instead). With the tab visible it held 720p60 in three of four runs (one dropped to 480p at
45 s). Auto never reached the 1080p60 the channel offered. With the boost: 1080p60 for the whole 3 minutes, visible or
hidden. So the background-tab downgrade is the real cause; the player-size cap was not reproduced. while a session runs the extension does two things, both only when `pipQuality` is `max`:

- **The tab looks visible.** The isolated content script sets `data-twitch-pip-active` on `<html>`. A MAIN-world script
  (`mainWorld.js`, `run_at: document_start`, so its listeners come first) watches that attribute. While it is set,
  `document.visibilityState`, `hidden` and the `webkit*` variants read `visible` / `false` through own properties on
  `document`, and `visibilitychange` is stopped in the capture phase at `window` and `document`. When the attribute goes,
  the own properties are deleted, so the real behaviour (or whatever sits on the prototype) is back, and if the tab's
  real state differs from the one Twitch last saw, one `visibilitychange` is dispatched so Twitch catches up. Nothing is
  dispatched when the session starts, even if the tab is really hidden (automatic PiP): announcing "visible" while the
  video is being moved risks Twitch re-mounting its player, which would end the session at once. Quality is held by the
  next point instead.
- **Quality stays at the top.** The same script finds Twitch's player instance (from `.video-player__container`,
  `[data-a-target="video-player"]` and similar, walk the `__reactFiber$*` chain up to `mediaPlayerInstance`; the isolated
  world cannot see these expandos). It remembers `getQuality()` and `isAutoQualityMode()`, calls
  `setAutoQualityMode(false)` and `setQuality(<highest>)` (Source, `chunked`, first), and checks again every 2 s because
  Twitch can switch auto back on. At the end it restores the remembered quality and auto mode, and puts the
  `video-quality` entry of `localStorage` back to what it was, so the saved preference is never changed. If the player
  cannot be found or its API changed, it logs one warning and leaves quality alone.

`pipQuality: "twitch"` sets no attribute, so none of this runs. Changing the setting during a session applies at once.
If the extension is reloaded mid-session the content script's teardown still removes the attribute.

### 7TV emotes (lite chat only)

- **API:** 7TV v3 REST, no auth: `https://7tv.io/v3/emote-sets/global` and `https://7tv.io/v3/users/twitch/<twitch id>`
  (the user response embeds the channel's active emote set). Checked live: both answer without a key and with
  an `access-control-allow-origin` that echoes the request origin. v4 is GraphQL only (`/v4/gql`) and has no simpler way to read the same data, so v3 is
  used. Images come from `https://cdn.7tv.app/emote/<id>/2x.webp`.
- **Channel id:** the `room-id` tag of the IRC `ROOMSTATE` that lite chat receives after joining (event `Room`). The
  session starts the fetch on the first `Room` event, and only while the `sevenTv` setting is on (also when it is turned
  on later).
- **Decode:** `domain/sevenTv.ts` decodes each emote on its own with `Schema`; a bad emote is dropped, never the set. An
  emote is zero-width when the set flag `1` or the emote flag `256` is set. Name to `{ id, url, width, height,
  zeroWidth }`; width and height come from the `1x.webp` file entry. A channel emote overrides a global one with the same
  name. A channel without a 7TV account (404) gives only the globals.
- **Fetch:** `services/SevenTv.ts` caches one request per set for the life of the page, with an 8 s timeout. Any failure
  gives an empty set, so lite chat only has no 7TV emotes.
- **Segments:** `withSevenTv` runs at render time over the message's text segments (so the setting and late-arriving
  emote lists apply live, and all lines are re-rendered when either changes). Space-separated tokens equal to an emote
  name become `sevenTv` segments. Twitch emotes from the IRC tags keep priority because they are no longer text. A
  zero-width emote with only spaces between it and the previous emote becomes an overlay in a `stack` segment; elsewhere
  it stands alone. Rendering uses `textContent` and `<img>` only.
- **CSP:** the Twitch page's policy did not block either path. Tested on a live channel with the unpacked extension: the
  content script's `fetch` to 7tv.io works, and the `<img>` elements in the PiP document load from cdn.7tv.app
  (`naturalWidth > 0`). So no service worker route and no new `host_permissions` are needed.

### Content script teardown

While a session is open the content script holds a `chrome.runtime.connect` port to the service worker; it connects when
the session opens and disconnects when it ends. With no session there is nothing to restore, so no link is kept and an
idle tab never wakes the worker. A reload, update or removal of the extension orphans the content script: its `chrome.*`
calls start to throw and `chrome.runtime.id` becomes `undefined`.
`port.onDisconnect` alone is the wrong signal: Chrome also fires it when it suspends an idle service worker (30 s without
events), and that must not end a session. So on disconnect the script checks `chrome.runtime.id`. Gone: dispose the
runtime, which closes the session and puts the video back. Still defined (a suspended worker): reconnect with backoff
(1, 2, 4 s, up to 30 s; the counter resets after a port that lived 5 s), which wakes the worker and never loops tightly.
A `connect` that throws also counts as gone. (A real
`chrome.runtime.reload()` and a suspended worker are the two cases.)
The page's own `pagehide` disposes the runtime too, but
only when `event.persisted` is false, so a page that goes into the back/forward cache keeps working when it returns.
Settings changes made in the PiP toolbar go through a queue; each write is uninterruptible and the rest of the queue is
written when the session closes, so a change made just before the end is not lost.

### PiP UI

- **Layouts:** `video` (video only), `side` (chat on the right), `below` (chat under the video), `overlay` (lite chat
  over the video, transparent, bottom left). Layout switches never resize the window: the layout
  fills the current size (video only letterboxes with `object-fit: contain`).
- **Chat sources:** `twitch` = the official embed iframe
  `https://www.twitch.tv/embed/<channel>/chat?parent=www.twitch.tv&darkpopout` (interactive when logged in);
  `lite` = our own read-only renderer fed by LiteChat (needed for overlay, lighter, styleable). Overlay always uses lite.
  The lite panel shows "Connecting to chat…" until the join succeeds and "Reconnecting…" while the socket is down.
  The embed's `parent` is the opener's hostname. The root is a CSS grid, so the iframe has its own cell and cannot be
  squeezed to 0 px.
- **Embed font size:** the Twitch embed cannot be restyled, so `chatFontSize / 13` scales the iframe with a CSS transform
  (width and height are divided by the same factor so it still fills the panel).
- **Toolbar:** a floating bar centered over the video area only (it lives in a `.zone` layer that shares the stage's
  grid cell, so it is never centered over the chat panel; if the stage is narrower than the toolbar it anchors to the
  left edge and overlaps the chat). It always stays on one row. A `ResizeObserver` on the zone picks the first
  of five collapse levels whose measured width fits: 0 everything inline; 1 the volume slider moves into a popover on
  the mute button; 2 the four layout buttons become one layout button with a menu; 3 font -/+ and opacity move into a
  "chat" popover; 4 only play, the layout menu, a "more" popover and back-to-tab remain, and the more popover holds mute,
  volume, the chat-source button, font -/+ and opacity (the same nodes move). Changing a setting never closes a popover:
  popovers close only when the level actually changes. A popover opens on hover or
  keyboard focus of its button, a click pins it, Escape or an outside click closes it, and it stays inside the window.
  The same DOM nodes are used inline and in popovers, so every `data-testid` exists once (inside a collapsed popover it
  is visible only while the popover is open). The toolbar appears on pointer movement over the stage and on keyboard
  focus, and fades out after 2 s idle; it never hides while the pointer is over it. The chat-source and font buttons hide
  in `video`, the source button is disabled in `overlay`, the opacity slider shows only in `overlay`. The opacity slider
  previews on `input` and saves on `change` (chrome.storage.sync allows 120 writes a minute). Every control has an
  `aria-label` and a `data-testid`.
- **Video sizing:** in every layout the video fills the stage with `object-fit: contain`. In `below` the stage's aspect
  ratio follows `videoWidth / videoHeight` (updated on `loadedmetadata` and `resize`, default 16:9), capped at 70% of the
  window height, and the chat takes the rest. In `side` the chat column is `clamp(160px, 38%, 340px)`.
- **Player-bar button:** 32 px round button with a 20 px icon and Twitch's hover colour, so it matches its neighbours.
  Its `aria-label` and tooltip read "Picture-in-picture with chat (<hotkey>)" and follow hotkey changes live.
- **Look:** dark, Twitch purple accent `#9146FF`, system font, 8 px radius, subtle blur behind the toolbar. Lite chat
  lines: coloured display name (from the `color` tag, readable on dark), Twitch emotes as images from
  `https://static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/1.0`, max 150 lines kept, auto-scroll that pauses
  when the user scrolls up and resumes at the bottom.

### Lite chat (LiteChat)

`wss://irc-ws.chat.twitch.tv:443`, then `CAP REQ :twitch.tv/tags twitch.tv/commands`, `PASS SCHMOOPIIE`,
`NICK justinfan<5 digits>`, `JOIN #<channel>`. A frame can hold several lines joined by `\r\n`. Answer server `PING`
with `PONG`. Send our own `PING` every 60 s; if no `PONG` in 10 s, treat the socket as dead. Reconnect with exponential
backoff (1 s, capped 30 s) for as long as the stream is consumed. Handle `CLEARCHAT` / `CLEARMSG` by removing lines.
Interrupting the stream closes the socket. The backoff restarts at 1 s only after the join succeeded (the JOIN echo for our nick,
or `366` end of names; the `001` welcome comes before the join and does not count), not when the socket merely opens, so a server that accepts and closes right away is retried
after 1, 2, 4 s and so on. Any failure, including a defect such as `new WebSocket` throwing, is logged with its cause and
retried with the same backoff. The stream starts with a `connecting` status event, then `connected` after the join and
`reconnecting` after each drop.

### Settings

```
layout: "video" | "side" | "below" | "overlay"          default "side"
chatSource: "twitch" | "lite"                           default "twitch"
chatFontSize: 11..24                                    default 13
overlayOpacity: 0.2..1                                  default 0.85
hotkey: string                                          default "Alt+Shift+P"
autoPip: boolean                                        default false (stretch, see below)
pipQuality: "max" | "twitch"                            default "max" (see PiP boost)
windowSize: { width, height }                           default 760x300 (first open of a browser session)
```

Decoding never fails the app: unknown or invalid fields fall back to defaults field by field. The options page edits
the same store; open sessions follow changes live. `SettingsStore.update(f)` reads, applies `f` and writes under a
one-permit semaphore, so concurrent writers in one context do not lose each other's fields (separate contexts, such as two
tabs, still race at the storage layer: last write wins, and the read-modify-write window is a few milliseconds). `set` and
`update` fail when the read fails and write nothing; `get` falls back to defaults for display only.

### Automatic PiP (stretch, opt-in)

When `autoPip` is on and a session is not open, register `navigator.mediaSession.setActionHandler("enterpictureinpicture",
...)` to open a session when the tab is hidden. Needs Chrome's per-site automatic picture-in-picture permission and
cannot be tested headless. Ship it behind the setting, mark it experimental in the options page.

## Effect conventions

- Services: `Context.Service` classes with a `layer`. Pure logic stays in `src/domain` as plain functions.
- Errors: `Schema.TaggedError<Self>()("Tag", fields)`, e.g. `PipUnsupported`,
  `PlayerNotFound`, `PipOpenFailed`. Expected failures are typed; defects are bugs.
- The content script builds one `ManagedRuntime` from the app layer and disposes it on a non-persisted `pagehide` or when
  the extension goes away.
- No `Effect.runPromise` scattered in UI code: UI callbacks only call plain callbacks. Each entry point has one `run`
  backed by its `ManagedRuntime` that logs failures with `Effect.logError` and the cause. The PiP UI's settings changes go
  into a queue that a scoped fiber of the session drains.
- Comments: none by default. One short line only for a non-obvious why.

## Testing

- `bun run typecheck` and `bun test` (unit) must be clean. `bun run build` produces `dist/` loadable in Chrome.
- Unit tests cover all of `src/domain`, using real IRC lines.
- `bun run e2e`: one headless Playwright smoke test with `dist/` loaded. It picks a live twitch.tv channel at runtime (skips
  if none) and checks the PiP button, the PiP video playing, lite chat lines and the back button.
- CI (`.github/workflows/ci.yml`, push to main): install, typecheck, unit tests, build.
- Things only a headed Chrome can show (real window chrome, the gesture requirement, auto PiP) go in
  `docs/manual-test.md` as a short checklist.

## Stale tabs after an update

When the extension reloads, Twitch tabs that were already open keep an orphaned content script. On install and update the
service worker injects `mainWorld.js` (MAIN world) and `content.js` into every open Twitch tab. A new content script
dispatches `twitch-pip:takeover` on `document` before it starts; every older instance listens for it and disposes its
runtime, which closes any open session and removes its button. An instance whose `chrome.runtime.id` is gone disposes
itself the next time the button, the hotkey or automatic PiP fires. The MAIN-world script guards itself with a flag on
`window`, so a second injection does nothing.
