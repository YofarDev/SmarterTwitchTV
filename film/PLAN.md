# Smarter Purple TV — showcase film plan (GATE 1: the owner approves this before any capture)

16:9, 1920×1080, 60 fps, **17.5 s** (7 bars at 96 BPM). Every app frame is the real
web app (`app/index.html`, the same code the APK loads) running full-screen in Chrome
at 1920×1080 and driven by scripted remote keys (arrows / Enter / Back). No UI is
redrawn; only a title card, captions and the end card sit around the real app.

## Concept

**"Twitch, built for the remote."** A D-pad glides through a living Browse grid,
the rail and tabs snap open, search answers as it is typed, the whole app flips to
the light theme — and it lands on the wordmark. Short, fast, no voice: the remote
"clicks" are the foley.

## Beats

| Bars | Time | Section (id → music role) | What we see | Footage (run) |
|---|---|---|---|---|
| 1 | 0–2.5 s | cold → intro | Browse/Live grid, focus glides right ×2 then down; details panel updates | `browse` |
| 2 | 2.5–5 s | title → hit | "Smarter Purple TV" wordmark + logo over the grid, blurred | `browse` (blurred) |
| 3 | 5–7.5 s | rail → verse | Left opens the rail, Down to Categories, Enter → category grid | `nav` |
| 4 | 7.5–10 s | tabs → groove | Up to tabs: Live → Front Page → Videos → Clips, grid swaps each hop | `nav` |
| 5 | 10–12.5 s | search → build | Search: "minecraft" typed on the TV keyboard, results fill in | `search` |
| 6 | 12.5–15 s | theme → climax | Settings: theme dark → light, the shell recolours live | `theme` |
| 7 | 15–17.5 s | finale → finale | End card: logo, "Android TV · Google TV", "free & open source", repo URL, on the last chord | `browse` (blurred) |

Captions (bars 1, 3–6, small, lower-left): *Built for the remote* · *Live, VODs, clips* ·
*Every tab one press away* · *Search that keeps up* · *Your theme, your TV*.

## Shot list (one harness run per row)

| Run (tag) | Script: remote keys and what the app answers | Events the edit cuts on | Est. length |
|---|---|---|---|
| `browse` | boot to Browse/Live, wait for thumbnails, Right, Right, Down (500 ms apart) | `ready`, `key`, `focus` | ~10 s |
| `nav` | Left (rail opens), Down×N to Categories, Enter (grid loads), Up to tabs, Right ×3 with Enter | `railOpen`, `gridLoaded`, `tab` | ~14 s |
| `search` | open Search, type "minecraft" one key per 120 ms, results load | `typeStart`, `typeEnd`, `resultsShown` | ~10 s |
| `theme` | open Settings → Appearance, switch to White theme, back to Browse | `themeApplied` | ~10 s |

## Capture

Backend: **web, headless** (as shot). Headless Chrome at exactly 1920×1080 records its own
compositor frames (CDP screencast, 60 fps in motion) into a 60 fps CFR mp4; the sync grabs
come from the same frames. A full-screen Chrome window on the second display was tried first
and dropped: macOS hid it in its own Space (see the skill's LESSONS.md).

Why not the TV itself: no Android TV or emulator is attached (only a phone), and the
native players need the custom Media3 build. Consequence: **no video playback in the
film** — the browser cannot play the native player, so the film shows the TV shell,
not a stream.

Data: the harness makes no network calls. Twitch responses and thumbnails are served
from a frozen fixture set under `film/work/fixtures/` (git-ignored) — see the question
at Gate 1 on what fills it.

## Music

Style `storybook`, 96 BPM, seed 7, roles: intro → hit → verse → groove → build →
climax → finale. Loudest on the title hit and the theme flip; the end card rides the
last chord. Remote foley: soft tick per key event (typing ticks on search).
Suno-style drop-in prompt (in README): *"17-second upbeat synth-pop sting, 96 BPM,
warm purple analog pads, plucky arps, a punchy hit at 2.5 s, builds to a bright
chorus lift at 12.5 s, resolves on a sustained major chord at 15 s, no vocals."*
