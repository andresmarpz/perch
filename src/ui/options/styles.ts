import { tokens } from "../theme.ts"

export const optionsCss = `${tokens}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font: 14px/1.45 var(--font); -webkit-font-smoothing: antialiased; }
body::before { content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(900px 420px at 50% -120px, rgba(145,70,255,0.16), transparent 70%); }
.page { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; padding: 40px 20px 64px; }
header.top { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.logo { width: 36px; height: 36px; border-radius: 10px; background: var(--accent); display: grid; place-items: center; color: #fff; box-shadow: 0 6px 20px rgba(145,70,255,0.35); }
h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
.sub { color: var(--muted); font-size: 13px; margin: 2px 0 0; }
.status { margin-left: auto; font-size: 12px; color: var(--muted); opacity: 0; transition: opacity 150ms ease; }
.status.show { opacity: 1; } .status.error { color: #ff7a7a; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 4px 18px; margin-bottom: 16px; }
.row { display: flex; align-items: center; gap: 16px; padding: 14px 0; }
.row + .row { border-top: 1px solid var(--line); }
.row .text { flex: 1 1 auto; min-width: 0; }
.row .label { font-weight: 600; }
.row .hint { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
.row.stack { flex-direction: column; align-items: flex-start; gap: 10px; }
.row .control { flex: none; display: flex; align-items: center; gap: 10px; }
.badge { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #ffd27a; background: rgba(255,190,70,0.14); border: 1px solid rgba(255,190,70,0.35); vertical-align: 1px; }

.seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; }
.seg label { position: relative; }
.seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.seg .opt { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 7px; color: var(--muted); font-weight: 600; font-size: 12.5px; transition: background-color 150ms ease, color 150ms ease; pointer-events: none; }
.seg input:hover + .opt { color: var(--text); background: rgba(255,255,255,0.06); }
.seg input:checked + .opt { background: var(--accent-soft); color: #d2b8ff; box-shadow: inset 0 0 0 1px rgba(145,70,255,0.55); }
.seg input:focus-visible + .opt { outline: 2px solid var(--accent); outline-offset: 1px; }
.icon { display: inline-flex; }

input[type="range"] { appearance: none; -webkit-appearance: none; width: 160px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.22); outline: none; cursor: pointer; }
input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 150ms ease, background-color 150ms ease; }
input[type="range"]:hover::-webkit-slider-thumb { background: var(--accent); transform: scale(1.12); }
input[type="range"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; }
.value { min-width: 44px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }

.switch { position: relative; width: 40px; height: 22px; }
.switch input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; z-index: 1; }
.switch .track { position: absolute; inset: 0; border-radius: 999px; background: rgba(255,255,255,0.18); transition: background-color 150ms ease; }
.switch .track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 150ms ease; }
.switch input:checked + .track { background: var(--accent); }
.switch input:checked + .track::after { transform: translateX(18px); }
.switch input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }

.hotkey { all: unset; box-sizing: border-box; min-width: 150px; text-align: center; padding: 7px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--line); font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace; cursor: pointer; transition: border-color 150ms ease, box-shadow 150ms ease; }
.hotkey:hover { border-color: rgba(255,255,255,0.22); }
.hotkey:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.hotkey.recording { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); color: #d2b8ff; }
.hotkey.invalid { border-color: #ff7a7a; }
.error-text { color: #ff9a9a; font-size: 12.5px; margin-top: 4px; min-height: 0; }

.button { all: unset; box-sizing: border-box; padding: 7px 14px; border-radius: 8px; background: var(--panel-2); border: 1px solid var(--line); font-weight: 600; font-size: 13px; cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease; }
.button:hover { background: #2a2a2f; border-color: rgba(255,255,255,0.2); }
.button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.button.danger { color: #ff9a9a; }
.button.danger.armed { background: rgba(255,90,90,0.16); border-color: rgba(255,90,90,0.55); }
@media (max-width: 520px) { .row { flex-wrap: wrap; } .row.stack { flex-direction: column; align-items: flex-start; gap: 10px; }
.row .control { width: 100%; } input[type="range"] { flex: 1; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`
