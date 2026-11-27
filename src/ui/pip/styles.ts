import { tokens } from "../theme.ts"

export const pipCss = `${tokens}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; font-family: var(--font); color: var(--text); -webkit-font-smoothing: antialiased; }

.pip { position: relative; width: 100%; height: 100%; display: grid; overflow: hidden; background: var(--bg); --chat-font: 13; --overlay-opacity: 0.85; }
.pip[data-layout="video"], .pip[data-layout="overlay"] { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
.pip[data-layout="side"] { grid-template-columns: minmax(0, 1fr) clamp(160px, 38%, 340px); grid-template-rows: minmax(0, 1fr); }
.pip[data-layout="below"] { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }

.stage, .zone { grid-area: 1 / 1; }
.pip[data-layout="side"] .chat { grid-area: 1 / 2; }
.pip[data-layout="below"] .chat { grid-area: 2 / 1; }
.stage { position: relative; min-width: 0; min-height: 0; background: #000; overflow: hidden; }
.pip[data-layout="below"] .stage { aspect-ratio: var(--video-aspect, 16 / 9); max-height: 70vh; width: 100%; align-self: start; }
.zone { position: relative; height: 0; min-width: 0; z-index: 10; pointer-events: none; align-self: start; }
.stage video { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; object-fit: contain; display: block; background: #000; transform: none !important; }

.chat { position: relative; min-width: 0; min-height: 0; background: var(--bg); border-left: 1px solid var(--line); display: flex; flex-direction: column; overflow: hidden; }
.pip[data-layout="below"] .chat { border-left: 0; border-top: 1px solid var(--line); }
.pip[data-layout="video"] .chat { display: none; }
.chat .embed { flex: none; border: 0; background: var(--bg); transform-origin: 0 0; display: none; }
.chat[data-source="twitch"] .embed { display: block; }
.chat .lite { position: relative; flex: 1 1 auto; min-height: 0; display: none; }
.chat[data-source="lite"] .lite { display: block; }

.lite-list { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; padding: 6px 10px 8px; font-size: calc(var(--chat-font) * 1px); line-height: 1.4; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
.lite-status { position: absolute; z-index: 1; top: 6px; left: 10px; right: 10px; color: var(--muted); font-size: 12px; pointer-events: none; }
.lite-status[hidden] { display: none; }
.line { flex: none; padding: 2px 0; overflow-wrap: anywhere; word-break: break-word; }
.line .name { font-weight: 700; }
.line .sep { color: var(--text); }
.line.action .text { font-style: italic; }
.line img.emote { height: 1.7em; width: auto; vertical-align: middle; margin: -0.3em 1px; }
.line .stack { display: inline-grid; vertical-align: middle; }
.line .stack > * { grid-area: 1 / 1; place-self: center; }
.line .stack img.emote { margin: -0.3em 1px; }
.pill { position: absolute; left: 50%; bottom: 10px; transform: translate(-50%, 6px); border: 0; border-radius: 999px; background: var(--accent); color: #fff; font: 600 12px var(--font); padding: 6px 12px; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 150ms ease, transform 150ms ease; box-shadow: 0 4px 14px rgba(0,0,0,0.45); }
.pill.show { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
.pill:hover { background: #a36bff; }

.pip[data-layout="overlay"] .chat { position: absolute; left: 10px; bottom: 10px; width: min(54%, 380px); height: min(48%, 260px); background: transparent; border: 0; pointer-events: none; display: flex; }
.pip[data-layout="overlay"] .chat .lite { background: rgba(14, 14, 16, var(--overlay-opacity)); border-radius: 10px; overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 22%); mask-image: linear-gradient(to bottom, transparent 0, #000 22%); }
.pip[data-layout="overlay"] .lite-list { overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; text-shadow: 0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.7); }
.pip[data-layout="overlay"] .lite-status { display: none; }
.pip[data-layout="overlay"] .pill { display: none; }

.toolbar { --tx: -50%; position: absolute; z-index: 10; top: 8px; left: 50%; width: max-content; transform: translate(var(--tx), -4px); display: flex; flex-wrap: nowrap; align-items: center; gap: 3px; padding: 4px; border-radius: 10px; background: rgba(24, 24, 27, 0.82); -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2); border: 1px solid var(--line); box-shadow: 0 6px 24px rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: opacity 150ms ease, transform 150ms ease; }
.toolbar[data-wide="true"] { --tx: 0px; left: 8px; }
.toolbar.visible, .toolbar:focus-within { opacity: 1; pointer-events: auto; transform: translate(var(--tx), 0); }
.toolbar .group { display: flex; align-items: center; gap: 2px; flex: none; }
.toolbar .group + .group { margin-left: 3px; padding-left: 5px; border-left: 1px solid var(--line); }
.toolbar [hidden] { display: none !important; }
.toolbar .group-more { display: none; }
.toolbar[data-level="4"] .group-more { display: flex; }
.toolbar[data-level="4"] .group-chat, .toolbar[data-level="4"] .pop-volume { display: none; }
.toolbar[data-level="4"] .group + .group { margin-left: 0; padding-left: 0; border-left: 0; }

.pop { position: relative; display: inline-flex; align-items: center; gap: 2px; }
.pop-panel, .pop-box { display: contents; }
.pop .label { display: none; }
.pop[data-collapsed="true"] .pop-panel { display: none; position: absolute; top: 100%; left: 50%; padding-top: 8px; transform: translateX(calc(-50% + var(--shift, 0px))); z-index: 20; }
.pop[data-collapsed="true"].open .pop-panel { display: block; }
.pop[data-collapsed="true"] .pop-box { display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 10px; background: rgba(24, 24, 27, 0.96); border: 1px solid var(--line); box-shadow: 0 6px 24px rgba(0,0,0,0.5); white-space: nowrap; }
.pop-layout[data-collapsed="true"] .pop-box { flex-direction: column; align-items: stretch; }
.pop-layout[data-collapsed="true"] .btn { justify-content: flex-start; }
.pop-more[data-collapsed="true"] .pop-box { flex-direction: column; align-items: flex-start; gap: 4px; }
.more-row { display: flex; align-items: center; gap: 2px; }
.pop[data-collapsed="true"] .with-label { display: inline-flex; align-items: center; gap: 8px; }
.pop[data-collapsed="true"] .label { display: inline; }
.with-label { display: inline-flex; }

.btn { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 6px; color: var(--text); cursor: pointer; font: 600 12px var(--font); transition: background-color 150ms ease, color 150ms ease; user-select: none; }
.btn:hover { background: rgba(255,255,255,0.12); }
.btn:active { background: rgba(255,255,255,0.18); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.btn[aria-pressed="true"] { background: var(--accent-soft); color: #c9a7ff; box-shadow: inset 0 0 0 1px rgba(145,70,255,0.55); }
.btn[disabled] { opacity: 0.4; cursor: default; background: none; }
.btn .icon { display: inline-flex; }
.btn .a-small { font-size: 10px; } .btn .a-large { font-size: 14px; }

.range { appearance: none; -webkit-appearance: none; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.22); outline: none; margin: 0 4px; cursor: pointer; }
.range.volume { width: 60px; } .range.opacity { width: 52px; }
.range::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 0; transition: transform 150ms ease, background-color 150ms ease; }
.range:hover::-webkit-slider-thumb { background: var(--accent); transform: scale(1.15); }
.range:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`
