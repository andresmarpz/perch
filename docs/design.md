# twitch-pip: design

A Chrome (MV3) extension that pops the Twitch stream you are watching into a Document Picture-in-Picture window, with
chat beside it, under it, or over it. Personal project for Andres. Facts behind these choices: `docs/spike.md`.

## Goals

- One click (a button in Twitch's player bar) or one hotkey (default `Alt+Shift+P`) opens the stream in an
  always-on-top PiP window.
- In the PiP window: choose a layout, choose a chat source, control playback, and close back to the tab. The stream keeps
  playing through every transition.
- Settings persist (chrome.storage.sync), including the PiP window size per layout.
- Works logged out and logged in. No Twitch API keys, no servers, no tracking.

Out of scope for v1: 7TV/BTTV/FFZ emotes in lite chat, VOD/clip pages, Firefox/Safari, sending chat from lite chat.

## Stack

- TypeScript 7.0.2 (`tsc` is the Go compiler), `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Effect 4.1.6 (`effect` package only; `Schema`, `Stream`, `Schedule`, `Scope`, `Layer`, `ManagedRuntime` are all in
  `effect`). Reference source: `~/dev/effect-smol` (Effect 4 repo, see its `LLMS.md`, `MIGRATION.md`, `ai-docs/`). Do not
  write Effect 3 APIs from memory; check effect-smol when unsure.
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
  chat.ts                ChatMessage model; PRIVMSG -> ChatMessage; emote ranges -> text/emote segments
  settings.ts            Settings Schema, defaults, decode with fallback for missing/corrupt fields
  hotkey.ts              Parse "Alt+Shift+P", match a KeyboardEvent-like record, format for display, record a combo
  chatLog.ts             Pure lite-chat log: 150-line cap, ClearChat/ClearMsg, scroll-at-bottom test
  layout.ts              Layout kinds, which chat source a layout allows, PiP size for a layout
src/services/            Effect services (Context.Service + Layer). Thin wrappers over browser APIs.
  SettingsStore.ts       get / set / changes Stream over chrome.storage.sync, decoded with settings.ts
  TwitchPage.ts          Find video, player bar, channel; inject the button; Stream of route changes
  LiteChat.ts            Stream<ChatMessage> from anonymous IRC WebSocket, keepalive, reconnect with backoff
  PipSession.ts          Scoped PiP session: open window, move video in, render UI, restore on release
                         (also exports `requestPipWindow`, the sync call the click handler makes)
src/ui/                  DOM rendering (no Effect inside render functions; callbacks in, elements out)
  h.ts                   Typed element helper
  pip/                   PiP document: root, toolbar, chat panel (embed iframe or lite list), styles
  options/               Options page
src/entry/
  content.ts             Content script: build the runtime, wire button + hotkey to PipSession
  background.ts          Service worker: open options on install, nothing else for now
  options.ts             Options page entry
test/e2e/                Playwright suites (fixture suite always; live suite with LIVE=1)
spike/                   Feasibility spike scripts (reference only)
```

## How it works

### Opening

The content script runs on `https://www.twitch.tv/*` and `https://twitch.tv/*`. When the route is a live channel page
and the player is present, it injects a PiP button into the visible right control group
(`.player-controls__right-control-group`, before the fullscreen button; there are two copies of the control groups, use
the visible one). The button and the hotkey `keydown` both carry user activation, which
`documentPictureInPicture.requestWindow` needs. Opening while a session is open closes it (toggle). The button is injected on every channel route (the route test in
`domain/channel.ts`), not gated on the live check from the spike: an offline channel has no usable video in a preview player
and the session fails with `PlayerNotFound` only when no `<video>` exists.

### Gesture handling

`documentPictureInPicture.requestWindow` must run in the click or keydown handler's synchronous turn. The entry point
calls `requestPipWindow(size)` there (no Effect hop first) and hands the resulting `Promise<Window>` to
`PipSession.open(channel, promise)`. The size comes from a settings copy the content script keeps in memory, because
reading `chrome.storage` is async. `PipSession.stateUnsafe()` (`idle | opening | open`) is the sync toggle check: `open`
closes the session, `opening` is ignored.

### The session (PipSession)

One `Effect.scoped` program per session:

1. Acquire: `requestWindow({ width, height })` with the saved size for the current layout. Release: `pipWindow.close()`.
2. Acquire: remember the video's parent and next sibling, move the `<video>` (`[data-a-target="video-ref"] video`) into
   the PiP document. Release: put it back. If the original parent is gone (SPA navigation), put it into the current
   `[data-a-target="video-ref"]`. If none exists, drop it.
3. Render the PiP UI (see below), subscribe to settings changes, persist window size on `resize` (debounced 500 ms, inner
   size, tagged with the layout active when the event fired). A layout change calls `resizeTo` with the saved size
   (outer size = saved inner size + window chrome); a refusal is ignored.
   The video's playing state is kept: if it played before a move, `play()` is retried at 0, 120 and 500 ms after the move.
4. The session ends (scope closes) on the first of: PiP `pagehide` (user closed the window), the toolbar's back-to-tab
   button, the route leaving the channel the session started on, the content script being torn down. `pagehide` restores
   the video synchronously in the event handler; the rest runs through the scope. If the page already holds another
   `<video>` where the original lived (Twitch re-rendered), ours is dropped.

The session must never leave the tab without its video. Every exit path goes through the scope's release.

### PiP UI

- **Layouts:** `video` (video only), `side` (chat on the right), `below` (chat under the video), `overlay` (lite chat
  over the video, transparent, bottom left). Layout switches resize the window with `resizeTo` (allowed: the click is a
  user gesture) to the saved size for that layout.
- **Chat sources:** `twitch` = the official embed iframe
  `https://www.twitch.tv/embed/<channel>/chat?parent=www.twitch.tv&darkpopout` (interactive when logged in);
  `lite` = our own read-only renderer fed by LiteChat (needed for overlay, lighter, styleable). Overlay always uses lite.
  The embed's `parent` is the opener's hostname. The root is a CSS grid, so the iframe has its own cell and cannot be
  squeezed to 0 px.
- **Embed font size:** the Twitch embed cannot be restyled, so `chatFontSize / 13` scales the iframe with a CSS transform
  (width and height are divided by the same factor so it still fills the panel).
- **Toolbar:** a floating bar at the top of the window (never over the chat input). It appears on pointer movement
  (a 44 px hot zone at the top catches movement over the cross-origin iframe), on keyboard focus, and fades out after 2 s
  idle; it never hides while the pointer is over it. The chat-source and font buttons hide in `video`, the source
  button is disabled in `overlay`, the opacity slider shows only in `overlay`. The opacity slider previews on `input`
  and saves on `change` (chrome.storage.sync allows 120 writes a minute). Controls: play/pause, mute, volume
  slider, layout picker (4 buttons), chat source toggle (hidden in `video` layout), chat font size -/+, overlay opacity
  (only in `overlay`), back to tab. Every control has an `aria-label` and a `data-testid`.
- **Look:** dark, Twitch purple accent `#9146FF`, system font, 8 px radius, subtle blur behind the toolbar. Lite chat
  lines: coloured display name (from the `color` tag, readable on dark), Twitch emotes as images from
  `https://static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/1.0`, max 150 lines kept, auto-scroll that pauses
  when the user scrolls up and resumes at the bottom.

### Lite chat (LiteChat)

`wss://irc-ws.chat.twitch.tv:443`, then `CAP REQ :twitch.tv/tags twitch.tv/commands`, `PASS SCHMOOPIIE`,
`NICK justinfan<5 digits>`, `JOIN #<channel>`. A frame can hold several lines joined by `\r\n`. Answer server `PING`
with `PONG`. Send our own `PING` every 60 s; if no `PONG` in 10 s, treat the socket as dead. Reconnect with exponential
backoff (1 s, capped 30 s) for as long as the stream is consumed. Handle `CLEARCHAT` / `CLEARMSG` by removing lines.
Interrupting the stream closes the socket.

### Settings

```
layout: "video" | "side" | "below" | "overlay"          default "side"
chatSource: "twitch" | "lite"                           default "twitch"
chatFontSize: 11..24                                    default 13
overlayOpacity: 0.2..1                                  default 0.85
hotkey: string                                          default "Alt+Shift+P"
autoPip: boolean                                        default false (stretch, see below)
windowSizes: { [layout]: { width, height } }            defaults: video 480x270, side 760x300, below 420x560, overlay 480x270
```

Decoding never fails the app: unknown or invalid fields fall back to defaults field by field. The options page edits
the same store; open sessions follow changes live.

### Automatic PiP (stretch, opt-in)

When `autoPip` is on and a session is not open, register `navigator.mediaSession.setActionHandler("enterpictureinpicture",
...)` to open a session when the tab is hidden. Needs Chrome's per-site automatic picture-in-picture permission and
cannot be tested headless. Ship it behind the setting, mark it experimental in the options page.

## Effect conventions

- Services: `Context.Service` classes with a `layer`. Pure logic stays in `src/domain` as plain functions.
- Errors: `Schema.TaggedError<Self>()("Tag", fields)`, e.g. `PipUnsupported`,
  `PlayerNotFound`, `PipOpenFailed`. Expected failures are typed; defects are bugs.
- The content script builds one `ManagedRuntime` from the app layer and disposes it on `pagehide`.
- No `Effect.runPromise` scattered in UI code: UI callbacks call one `run` function provided by the entry point.
- Comments: none by default. One short line only for a non-obvious why.

## Testing

- `bun run typecheck` and `bun test` (unit) must be clean. `bun run build` produces `dist/` loadable in Chrome.
- Unit tests cover all of `src/domain`, using real IRC lines from `docs/spike.md`.
- `bun run e2e` (fixture suite): Playwright headless Chromium with `dist/` loaded. `www.twitch.tv/<channel>` is routed
  to a local fixture page that mirrors Twitch's DOM selectors and plays a short looping test video (generate it with
  ffmpeg into `test/e2e/fixtures/`). IRC and the chat embed are mocked (route the WebSocket and the iframe URL).
  Deterministic, offline, under 60 s.
- `LIVE=1 bun run e2e` (live suite): real twitch.tv, a live channel picked at runtime (not a hardcoded name; offline
  channels play a VOD preview), checks the real selectors still hold.
- Interaction audit: every toolbar control is clicked in e2e and its effect asserted (not just rendered).
- Things only a headed Chrome can show (real window chrome, the gesture requirement, auto PiP) go in
  `docs/manual-test.md` as a short checklist.
