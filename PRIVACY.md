# Perch privacy policy

Perch collects nothing and sends no data about you to anyone. It has no server, no analytics and no account.

- Your settings (layout, chat source, text size, shortcut and similar) are stored in `chrome.storage.sync`, which is
  Chrome's own storage for your browser profile. Perch never reads or sends them anywhere else.
- Perch runs only on `twitch.tv`. Apart from the optional 7TV emotes below, it connects only to Twitch: the page itself, the official Twitch chat embed, anonymous
  read-only chat at `irc-ws.chat.twitch.tv`, and Twitch's emote CDN. Those requests go from your browser to Twitch,
  the same as when you use Twitch normally.
- Lite chat can show 7TV emotes. For that, your browser loads the channel's emote list from `7tv.io` and the emote
  images from `cdn.7tv.app`. Perch sends no data about you in these requests: no account, no login, no settings, only
  the public Twitch channel id, as in any request to 7TV. This is optional: turn off "7TV emotes" in the options and
  Perch makes no request to 7TV.
- Perch does not read your Twitch login, does not send chat as you, and does not look at any other site.

Questions: open an issue at https://github.com/andresmarpz/perch/issues.
