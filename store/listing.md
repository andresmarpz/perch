# Chrome Web Store listing

## Name

Perch — picture-in-picture for Twitch

## Short description (132 characters or fewer)

Pop any Twitch stream into a floating picture-in-picture window with chat, lite chat overlay and a quality lock.

## Full description

Perch pops the Twitch stream you are watching into an always-on-top picture-in-picture window, with chat where you want it.

- Four layouts: video only, chat beside, chat below, and lite chat over the video.
- Lite chat: a light, read-only chat drawn by Perch, with Twitch emotes. No login needed.
- Quality lock: keeps the stream at Source while you work in other tabs or apps.
- Automatic picture-in-picture when you switch tabs (experimental).
- One click on the player bar button, or Alt+Shift+P. The stream keeps playing, and closing the window puts the video back in the tab.

Perch collects nothing and sends nothing anywhere. Settings stay in your browser. It talks only to Twitch.

Source and privacy policy: https://github.com/andresmarpz/perch

## Single purpose

Show the Twitch stream you are watching in a floating picture-in-picture window, with chat.

## Permission justifications

- `storage`: saves your settings (layout, chat source, text size, shortcut, window sizes) in `chrome.storage.sync`.
- `scripting`: after the extension installs or updates, injects its content scripts into Twitch tabs that are already
  open, so the button and shortcut work without reloading the tab.
- Host access to `https://www.twitch.tv/*` and `https://twitch.tv/*`: needed to add the button to the Twitch player, to
  move the player's video into the picture-in-picture window, and to run on Twitch pages only. No other site is accessed.
- MAIN-world script (`mainWorld.js`): Twitch lowers quality and pauses streams in background tabs by reading the page's
  own visibility state and player settings. The script runs in the page's world, only while a Perch window is open, to
  keep the page looking visible and to keep the player on Source quality, and undoes both when the window closes. It
  reads and writes only the page's own player and visibility state, and sends no data anywhere.
- Remote connections: the extension itself connects to `wss://irc-ws.chat.twitch.tv` (anonymous read-only chat for lite
  chat) and loads emotes from Twitch's emote CDN. The Twitch chat layout embeds Twitch's official chat page.

## Privacy policy URL

https://github.com/andresmarpz/perch/blob/main/PRIVACY.md

## Assets

- `screenshot-1-side.png`, `screenshot-2-overlay.png`, `screenshot-3-options.png`: 1280x800
- `promo-small.png`: 440x280
