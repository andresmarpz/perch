# Manual test (headed Chrome)

Headless Chromium cannot show these. Run them after a build, once per release.

Setup: `bun run build`, open `chrome://extensions`, enable Developer mode, Load unpacked, pick `dist/`. A first install
opens the options page. Open a channel that is live now at `https://www.twitch.tv/<channel>`.

## Gesture requirement

- [ ] Click the PiP button in the player bar. The window opens at once, no error in the page console.
- [ ] Press `Alt+Shift+P` (focus on the page, not in chat). The window opens. Press it again: it closes.
- [ ] Focus the chat box, press `Alt+Shift+P`. Nothing happens.
- [ ] Leave the tab idle for 30 s, then click the button. It still opens (activation is used in the click turn).

## Window and video

- [ ] The window is always on top and has the real title bar with the native close button.
- [ ] The video keeps playing through open, layout changes and close. Pause in the PiP toolbar, close: the tab video stays paused.
- [ ] Click the native close button: the video is back in the tab and plays.
- [ ] Drag the window edge. Close and reopen: the same layout opens at the size you left it.
- [ ] Change layout from the toolbar: the window resizes to that layout's saved size (Chrome may refuse; the layout still changes).
- [ ] Open the PiP, click another channel in the side nav: the PiP closes and the tab shows the new channel's video.

## Toolbar and chat

- [ ] Toolbar shows on mouse move, hides after 2 s, stays while the pointer is on it, shows on Tab focus.
- [ ] Twitch chat: logged in, you can type and send a message in the embed. Logged out it is read only.
- [ ] Lite chat shows lines, emotes, and the "New messages" pill after you scroll up.
- [ ] Overlay: chat sits bottom left over the video, clicks pass through to the video except on the toolbar.

## Options

- [ ] Every setting saves on change and shows "Saved". Reload the page: values stay.
- [ ] Shortcut recorder rejects `Shift+K` and accepts `Alt+Shift+K`; the new shortcut works on Twitch after a reload.
- [ ] Changing layout in the options page changes an open PiP window live.

## Automatic PiP (experimental)

- [ ] In `chrome://settings/content/automaticPictureInPicture` (or the site settings for twitch.tv) allow it.
- [ ] Turn on "Automatic picture-in-picture" in the options page, reload Twitch, play a stream, switch to another tab: the PiP opens.
- [ ] Switch back: Chrome closes the window and the video returns. Turn the option off: switching tabs no longer opens it.
