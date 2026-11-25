# smarter-purple-tv — showcase film

Made with the `app-showcase-film` skill (~/.claude/skills/app-showcase-film).

`out/smarter-purple-tv-film.mp4` is the master (1920×1080, 60 fps, H.264 + AAC 320k;
git-ignored); `smarter-purple-tv-film.mp4` next to this file is the web encode (CRF 22,
AAC 192k, faststart) with `out/contact.jpg` as a contact sheet.

```bash
S=~/.claude/skills/app-showcase-film
$S/capture/macos.sh --film film <tag> [--run <name>] [-- extra harness args]   # one take
$S/pipeline/build.sh --film film            # sync + index + score + mix + render + mux + checks
$S/pipeline/build.sh --film film render     # after an edit-only change
(cd film/video && npx remotion studio)      # preview the edit
```

Every cut hangs on harness events (`video/src/plans.ts`); sections round to
bars (`video/src/sections.ts`); the score follows `music/sections.json`.

## Swapping the music

Set `"musicStyle": "dropin"` in film.json and put the track at
`music/score.wav` (48 kHz). It must follow `music/sections.json`.

Suno-style prompt for a drop-in track (17.5 s, 7 bars at 96 BPM):

> 17-second upbeat synth-pop sting, 96 BPM, warm purple analog pads and plucky arps,
> a punchy hit on bar 2 (2.5 s), a short build on bar 5, a bright lift on bar 6 (12.5 s),
> resolving on a sustained major chord on bar 7 (15 s), no vocals.

## Capture harness (web backend)

`harness/capture.mjs` plays one scripted remote-control run (`browse`, `nav`,
`search`, `theme`) of the real web app (`app/index.html`) in headless system Chrome at 1920×1080 and
records Chrome's own frames (CDP screencast) to `work/cap/<tag>.mp4`, plus the
timeline and grabs the pipeline reads. No display is used. Twitch data comes from fixtures, never the network:

```bash
node film/harness/capture.mjs --run nav --out /tmp/x --mode record   # (re)record film/work/fixtures/nav.har once, live
node film/harness/capture.mjs --run nav --out /tmp/x --shots          # offline dry run, a PNG per step
node film/harness/capture.mjs --run nav --out film/work/cap/nav --video $PWD/film/work/cap/nav.mp4   # a real take
uv run --with numpy --with pillow python -I ~/.claude/skills/app-showcase-film/pipeline/sync.py --film film nav
uv run --with numpy --with pillow python -I ~/.claude/skills/app-showcase-film/qa/check_take.py --film film nav
```

Fixtures live in `work/fixtures/` (git-ignored: they hold third-party thumbnails).
