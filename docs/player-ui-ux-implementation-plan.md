# Player UI/UX, implementation plan

Date: October 19, 2026.
Status: not started.
Source: player critique of October 18, 2026 (`.impeccable/critique/2026-10-18T21-15-05Z__app-specific-playerui-js.md`, score 17/36).
Audience: an implementing agent with no prior context. Read sections 1 to 3 completely before touching code.

## 1. Goal and scope

Make the player feel like one coherent, premium SPTV surface and remove the confirmed input bug, without
losing any capability. Every legacy action stays reachable; only presentation, defaults and a few labels change.

| # | Critique finding | Severity | Phase |
| --- | --- | --- | --- |
| 1 | OK that reveals the controls also toggles play/pause | P1 | 1 |
| 2 | Diagnostics HUD visible by default | P2 | 2 |
| 3 | Three visual systems on one screen (legacy info overlay, floating timeline, new bar) | P1 | 3 |
| 4 | Drawer rows are legacy spinners with leftover copy | P2 | 4 |
| 5 | Drawer loses context; static, wrong help line | P2 | 5 |
| 6 | Small secondary type, wide bar spacing, no paused indicator (minor) | P3 | 3 and 6 |
| 7 | Channel switcher still legacy styled | P2 | 7 (visual only) |

Out of scope (do not do these; list them in the results file as follow-ups):

- Reducing the channel switcher's nine tabs, or changing its card geometry or safe margins. Native feed preview
  positions are integer slots sent through `OSInterface_SetFeedPosition` (`app/specific/OSInterface.js:879`);
  geometry changes need device validation.
- Multistream and picture-in-picture info layouts (`#stream_info_pp`, `#stream_info_multi*`). Leave their markup
  and CSS alone; only verify they still render.
- Any Java/APK change. Everything here is web-only.
- New fonts, CSS frameworks, CSS custom properties, blur, or scaling focused elements.

## 2. Ground rules (read before every phase)

1. Edit only `app/` and `docs/` (plus `DESIGN.md` in Phase 8). **Never hand-edit `release/`.** It is regenerated
   by `node release/scripts/maker.js`.
2. All app JS is concatenated into one global scope. No modules, no `let`/`const`, no arrow functions, no template
   literals, no `classList.toggle(x, bool)` second argument, no `Array.prototype.includes`, no `Object.assign`.
   Write ES5 like the surrounding code. JSHint enforces `===` and no unused or undefined variables.
3. CSS must work on old Android TV WebViews (Chromium 37+). Flexbox and `calc()` are fine. **No `var(--x)`**, no
   `gap` on flex containers (use margins), no `:is()`/`:where()`, no `inset`.
4. Theme colors: the defaults in `app/index.html` are `#141219` canvas, `#1e1b25` surface, `#f5f1fa` text,
   `#c1b8cd` secondary text, `#bca0ff` focus outline, `#30253f` focus fill. Saved themes override these through
   the generated CSS in `app/specific/SettingsColor.js:452-490`. If you add a selector that uses the focus color
   or the surface color, **also add it to the matching rule in `SettingsColor.js`**, or custom themes will break.
5. Strings: add new user-facing text only as new keys on `STR_UI` in `app/languages/en_US.js` (lines 23 to 60).
   Other languages fall back to English for missing keys; do not edit other language files. Never hard-code
   English in JS.
6. Formatting: Prettier settings from `.prettierrc` (4 spaces, width 150, single quotes, no trailing commas,
   no bracket spacing). Run `npx prettier --write <file>` on each file you edit.
7. Do not scale focused elements, and do not change sizes or positions of anything the native player measures
   (video area, feed cards). The player overlay (`#player-ui`) and the info panel text are safe to restyle.
8. After each phase run the checks in section 4. Do not start the next phase with failing checks.
9. Do not commit, push or deploy unless the user tells you to. Leave the working tree for review.

## 3. Background you need

### Files

| File | What it owns |
| --- | --- |
| `app/specific/PlayerUI.js` | The new bar + drawer layer: render, focus, key handling, auto-hide |
| `app/specific/UIFocus.js` | Input-owner stack and the listener wrapper that dispatches keys to owners |
| `app/specific/PlayEtc.js` | Legacy player: `Play_controls` descriptors (`Play_MakeControls`, line ~2048), key handlers, panel show/hide, defaults (`Play_PreStart`, ~4532) |
| `app/specific/Play.js` | Live info panel content (`Play_UpdateMainStreamDiv` ~503, `Play_RefreshWatchingTime` ~1688, `Play_GetLiveTime` ~1727, `Play_showPanel` ~1663) |
| `app/index.html` | All CSS (player overlay CSS at ~3128 to 3260) and markup (`#player-ui` at ~4040, `#playerinfo` at ~4182, `#progress_pause_holder` at ~4459, `#playsideinfo` at ~4631) |
| `app/specific/SettingsColor.js` | Theme CSS generator (role selectors at 452 to 490) |
| `app/languages/en_US.js` | `STR_UI` strings and all legacy `STR_*` strings |
| `release/scripts/player-ui-tests.js` | Runs real `Play_controls` descriptors through `PlayerUI_*` with stubs |
| `release/scripts/ui-focus-tests.js` | Runs real `UIFocus_*` functions in a VM sandbox (`ui-test-sandbox.js`) |

### How the player overlay works

- A mode number is used everywhere: `1` live, `2` VOD, `3` clip (`PlayerUI_Mode()`).
- The bar is shown by `PlayerUI_Show(mode)`, called from `Play_showPanel` (live), `PlayVod` and `PlayClip`
  equivalents, and from the legacy key handlers. It pushes an input owner `{id: 'player', handle: PlayerUI_Handle}`
  onto `UIFocus_Stack`.
- `PlayerUI_State.frames` is a stack: `[{group: 'bar', index}]`, then e.g. `{group: 'more'}`, then
  `{group: 'playback'}`. `PlayerUI_Render` rebuilds the bar buttons and the drawer from the top frame.
- Drawer rows for control groups are the **real legacy control DOM nodes** (`Play_controls[key].doc`), moved into
  `#player-ui-actions` and restyled with `.player-ui-action`. Each row has a title line
  (`#controls_text_title_<i>`) and a summary line (`#controls_text_summary_<i>`), and spinner rows contain
  `.up`/`.down` CSS triangles plus a value (`#controls_name_<i>`).
- Left/Right on a control row calls `control.updown(±1, mode)`; OK calls `control.enterKey(mode)`.
  Back (`PlayerUI_Back`) pops a frame and rolls back uncommitted quality/speed/latency.
- The bar auto-hides after 5 s (`PlayerUI_ScheduleHide`) only when no drawer is open.
- The info panel (`#scene_channel_panel` containing `#playerinfo`) is shown by `Play_ForceShowPannel` and hidden by
  `Play_hidePanelFull`; it is visible exactly while the bar is visible.

### How to see the player in a desktop browser

There is no native player in a browser; the app embeds Twitch instead, which hides the real overlay. Use this
procedure for every visual check in this plan:

1. Start a static server from the repo root: `python3 -m http.server 5178 --bind 127.0.0.1` (or the `static`
   entry in `.claude/launch.json`). Open `http://127.0.0.1:5178/app/index.html` at a 1280×720 viewport.
2. Press Right, Enter (Browse), wait for cards, then Enter on the first live card.
3. Run this in the page console to remove the embed and put a realistic frame behind the overlay:

   ```js
   var e = document.getElementById('twitch-embed'); e.style.display = 'none';
   var s2 = document.getElementById('scene2');
   s2.style.backgroundImage = 'url(https://static-cdn.jtvnw.net/previews-ttv/live_user_' + Play_data.data[6] + '-1280x720.jpg)';
   s2.style.backgroundSize = 'cover';
   PlayerUI_Close(false); Play_updateStreamInfo(); Play_ForceShowPannel(); PlayerUI_Show(1);
   ```

   (If `Play_data.data[6]` is not the login name, use any live channel's login.) Then drive with the keyboard:
   arrows, Enter = OK, Escape = Back.
4. The in-app browser's screenshot can lag one frame; wait one second before capturing, and confirm state with
   `PlayerUI_State.frames` when in doubt.
5. Also capture 1920×1080 for type-size checks. Body font is about 19.3 px at 720p and about 29 px at 1080p;
   DESIGN.md targets ≥ 28 px for labels and ≥ 22 px for secondary text at 1080p, so in `em` terms
   labels ≥ 0.97em and secondary ≥ 0.76em of the body font.

## 4. Checks to run after every phase

```bash
node release/scripts/maker.js jsh
node release/scripts/ui-focus-tests.js
node release/scripts/player-ui-tests.js
node release/scripts/navigation-tests.js
node release/scripts/remote-input-tests.js
node release/scripts/search-navigation-tests.js
node release/scripts/following-tests.js
```

All must pass. If an existing assertion fails because it encoded the old behavior you were asked to change,
update that assertion and say so in the results file; never delete a test to make it pass.

---

## 5. Phases

### Phase 1. Stop OK from toggling playback when it reveals the controls (P1)

**Bug.** With the bar hidden, OK reaches the legacy `Play_handleKeyDown` (`PlayEtc.js:1841`), which calls
`Play_showPanel` → `PlayerUI_Show` → `PlayerUI_Render` → `PlayerUI_Focus`, which calls `.focus()` on the bar's
first `<button>` (Play/Pause) **while the Enter keydown is still being dispatched**. Nothing calls
`preventDefault` on that path, so the browser's default Enter activation clicks the newly focused button.
Its `onclick` (`PlayerUI_ActivateBar(0)`) toggles playback. Confirmed in the browser with a stack trace through
`PlayerUI_ActivateBar` (`PlayerUI.js:334`). The same thing can happen for any overlay a legacy key handler opens.

**Change.** In `app/specific/UIFocus.js`, inside `UIFocus_Listener`'s keydown wrapper, where it already detects
that the legacy handler pushed a new owner, also cancel the default action:

```js
if (type === 'keydown' && UIFocus_Stack[UIFocus_Stack.length - 1] !== previous) {
    // A legacy key-down that opens an overlay still owns the held press.
    UIFocus_SuppressedKeys[event.keyCode] = previous || {};
    // Its default action (Enter activation) must not reach the control the new owner just focused.
    if (event.preventDefault) event.preventDefault();
}
```

Do not add `stopImmediatePropagation` there; other listeners may legitimately see the event.

Keep Play/Pause as the bar's first button and default focus (`frames = [{group: 'bar', index: 0}]`); that is what
viewers expect, and the fix above is what prevents the accidental activation.

**Tests.**

- `release/scripts/ui-focus-tests.js`: add a case. Push nothing; create a legacy handler with
  `s.UIFocus_Listener('keydown', handler)` where `handler` pushes a new owner (`s.UIFocus_Push({id: 'x',
  handle: function () { return true; }})`). Call the wrapper with a fake event whose `preventDefault` increments a
  counter. Assert the counter is 1 and that `UIFocus_SuppressedKeys[13]` is set. Add a second case where the
  handler does **not** push an owner and assert `preventDefault` was **not** called (normal legacy keys keep
  their defaults).
- Browser: with the bar hidden, run
  `var n = 0, o = OSInterface_PlayPauseChange; OSInterface_PlayPauseChange = function () { n++; return o.apply(this, arguments); };`
  then press Enter once. Expect the bar visible, `n === 0`, `PlayerUI_State.paused` unchanged. Press Enter
  again: `n === 1` (now the bar owns OK and Play/Pause works).
- Regression: open Search from the rail with Enter and confirm the search form opens and nothing is submitted;
  open the Browse rail with Left, press Right to return to the grid, and confirm the next Down moves within the
  grid (not the rail).

**Done when** both browser checks pass and all section 4 checks pass.

### Phase 2. Hide the diagnostics HUD by default (P2)

`Play_Status_Visible` controls the top-right technical block (`#playsideinfo`: resolution, net speed, skipped
frames, buffer, latency, ping). Values: `0` "When player info is visible", `1` "Always visible", `2` "Never visible"
(`STR_PLAYER_INFO_VISIBILITY_ARRAY`, `en_US.js:465`). The default is `0`, so every viewer sees it on every reveal.

**Change.** `app/specific/PlayEtc.js:4576`:

```js
Play_Status_Visible = Main_getItemInt('Play_Status_Visible', 2);
```

This is read in `Play_PreStart` before `Play_MakeControls()` (line 4606), so the Diagnostics row's
`defaultValue` picks it up. Users who ever changed the option keep their saved value. Users who never touched
it now get "Never visible"; that is intended.

**Check.** Verify that `Play_ForceShowPannel` (`Play.js:1607`) and the hide path (`Play.js:1625`,
`PlayEtc.js:4469`) treat `2` as hidden (they only act on `0` and `1`, so `2` keeps `#playsideinfo` hidden).
In the browser, clear storage (`localStorage.clear()`, reload), open a stream, reveal the bar: no stats block.
Open More → Diagnostics, set "When player info is visible", reveal again: the block appears. Update
`player-ui-tests.js` if its sandbox default (`Play_Status_Visible: 0`) makes an assertion about the default.

### Phase 3, One visual system for the player chrome (P1)

Target composition at the 1080p reference, all within 5% safe margins:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◯ sodapoppin  [LIVE] [EN]                           Sun, Oct 18, 23:11   │  top gradient (exists)
│ 100k tournament top 36 here we go | !podcast …   (one line, ellipsis)    │
│ World of Warcraft · Live for 7:09:31 · 82,181 viewers · Watching 2:07    │  secondary color
│                                                                          │
│                              (video)                                     │
│                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ 00:24 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ 00:28   │ │  timeline (only when visible)
│ │ Quality · Auto (1080p60)                                     Paused  │ │  caption
│ │ [▶ Play]   [Chat] [Quality] [Layout]               [More] [Channels] │ │  grouped buttons
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

#### 3a. Restyle the single-stream info block

Scope every rule to the single-stream block so picture-in-picture and multistream are untouched:
`#scene_channel_panel #stream_info …`. Add the CSS in `app/index.html` next to the existing player-ui block
(~line 3256), with a comment like the surrounding ones.

- `#stream_info`: `padding: 2.7% 5% 0 5%;` (safe area; today the avatar sits at the screen edge).
- `img.stream_info_icon` inside it: `width: 4.5%; border-radius: 50%; margin: 0 1.2% 0 0; vertical-align: top;`
  (today 9.5% wide, square).
- The name line wrapper (the `<div style="font-size: 155%">` inside `.playmaininfo`): override to
  `font-size: 125% !important` via a selector such as `#stream_info .playmaininfo > div:first-child`.
- `#stream_info_title`: one line, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 70%; font-size: 100%;` (it contains twemoji `<img>` elements; keep them inline).
- `#stream_info_game`, `.stream_info_timers` inside `#stream_info`: `font-size: 80%; color: #c1b8cd;`
  Put game and timers on **one line**: make `#stream_info_game` `display: inline` and add the separator through
  JS (3b), not CSS `::after` (old WebViews and twemoji make pseudo-content fragile).
- Live/VOD/CLIP badge (`.partnericon_text`, built in `Play_partnerIcon`, `PlayEtc.js:445`): inside
  `#stream_info` only, `font-size: 60%; padding: 0.15em 0.45em; border-radius: 0.2em; letter-spacing: 0.04em;
  text-transform: uppercase; vertical-align: middle;`. Keep the inline background colors (red live, green VOD,
  orange clip); a labelled badge is allowed by DESIGN.md.
- Keep `.playerinfo`'s gradient and the `.shadow_text` drop shadow; they are what keeps white text legible
  over bright video.
- Theme: add `#stream_info_game,#stream_info .stream_info_timers` to `SettingsColor.js` only if a saved theme
  should recolor them; the minimum is to leave them at the fixed `#c1b8cd`, which is legible on the dark gradient
  in every theme. Document the choice in the results file.

#### 3b. Fix the info-line copy

In `app/specific/Play.js`:

- `Play_GetLiveTime` (~1727): replace `STR_SINCE + …` with `STR_UI.liveFor + …`. Add
  `liveFor: 'Live for '` to `STR_UI`. This function is only used by the player (single, PiP and multi info),
  so the change is player-wide and that is intended. Keep `Play_timeMs` formatting (h:mm:ss).
- `Play_UpdateMainStreamDiv` (~503): the viewers line is built as
  `STR_SPACE_HTML + STR_FOR + number + STR_SPACE_HTML + viewers`. Change it to
  `' · ' + Main_formatNumber(n) + ' ' + Main_GetViewerStrings(n).toLowerCase()` via `Main_textContent` (no
  HTML needed). Add `STR_UI.separator = ' · '` and use it instead of the literal.
- The game line: `STR_PLAYING + game` becomes just the game name (the word "Playing" is noise next to a
  category). Then prefix the live-time element with the separator when the game is non-empty, so the line reads
  `World of Warcraft · Live for 7:09:31 · 82,181 viewers · Watching 2:07`.
- `Play_RefreshWatchingTime` (~1688, the `else` branch around its line 36): `', ' + STR_WATCHING + …`
  becomes `STR_UI.separator + STR_UI.watching + …`, with `watching: 'Watching '` added to `STR_UI`.
  Do not change `STR_WATCHING` itself (used elsewhere).
- Check VOD (mode 2) and clip (mode 3) info text after this: they use other functions
  (`PlayVod_*`/`PlayClip_*` update paths). Only adjust them if they share these elements and now look broken.

#### 3c. Make the bar caption useful, remove the duplicate name

In `PlayerUI_Render` (`PlayerUI.js:283-287`):

- `#player-ui-name` currently repeats the channel name that the info block already shows in large type. Set it
  to `STR_UI.quality + STR_UI.separator + <quality playing>` (the quality value currently goes to
  `#player-ui-value`).
- `#player-ui-value` (right-aligned) now shows `STR_UI.paused` (`'Paused'`, new key) when
  `PlayerUI_State.paused` is true, otherwise empty.
- Raise `.player-ui-caption` from `font-size: 75%` to `80%` and give it `color: #c1b8cd; opacity: 1`.

#### 3d. Group the bar buttons and add icons

- `Navigation_Button(parent, id, label, callback, icon)` (`Navigation.js:157`) already supports an icon (5th
  argument, rendered as `<i class="icon icon-NAME">`). Pass icons in `PlayerUI_Render`'s bar loop:
  pause/play → `PlayerUI_State.paused ? 'play' : 'pause'`, chat → `'chat'`, quality → `'videocamera'`,
  layout → `'side-by-side'`, more → `'options'`, channels → `'feed'`. All of these exist in the icon font.
- Replace `#player-ui-buttons { justify-content: space-between; }` with left-aligned buttons and explicit
  spacing: `justify-content: flex-start;` and `#player-ui-buttons .navigation-button { margin-right: 0.5em; }`.
  Add a class on the Play/Pause button (`player-ui-bar-primary`) with `margin-right: 1.6em` and on the More button
  (`player-ui-bar-end`) with `margin-left: auto`. Result: `[Play]   [Chat][Quality][Layout]   …   [More][Channels]`.
- Icon spacing: `#player-ui-buttons .navigation-button .icon { margin-right: 0.35em; }`. Check that the shell's
  existing `.navigation-button` rules don't already add icon margins (rail buttons use icons); reuse them if so.
- Keep text labels. Do not make icon-only buttons.

#### 3e. Put the timeline inside the bar card

Today `#progress_pause_holder` floats at `bottom: 23%` (`.player-ui-active #progress_pause_holder` at
`index.html:3256`), outside the bar, over the video.

1. Find out when the timeline is visible: VOD always; live only in some states (check
   `PlayVod_RefreshProgressBarrStart` and what hides `#progress_pause_holder`/`#progress_bar_div` on live).
   Write the answer in the results file.
2. In `PlayerUI_Render`, toggle a class on `#player-ui`: `player-ui-has-timeline` when
   `Main_getElementById('progress_pause_holder').offsetHeight > 0` (do it after the legacy panel is shown; if
   the timing is unreliable, decide from the mode and the same condition the legacy code uses).
3. CSS: `.player-ui-has-timeline .player-ui-bar { padding-top: 3.4em; }` and
   `.player-ui-active #progress_pause_holder { bottom: <value>; left: 6.3%; width: 87.4%; }`, tuned so the
   timeline track sits inside the bar's top padding. Use `%` of the screen like the existing rule.
4. Acceptance (browser, 720p and 1080p): `getBoundingClientRect()` of `#progress_bar_div` lies fully inside the
   rect of `#player-ui-bar`, with at least 0.5em inner margin on every side. The time labels must not overlap the
   caption.
5. Up from the bar already hands focus to the timeline (`PlayerUI_Handle`, `KEY_UP` branch). The legacy focused
   timeline class is `progress_bar_div_focus` (`PlayEtc.js:4269`). Make its focus look like the rest of the
   overlay inside `.player-ui-active`: outline `0.13em solid #bca0ff`, no glow, and add the selector to the
   focus rule in `SettingsColor.js`.

#### 3f. Persistent paused indicator

When the viewer pauses and the bar hides, nothing says the stream is paused.

- Markup: add `<div id="player-ui-paused" class="player-ui-paused hide"><i class="icon icon-pause"></i>
  <span id="player-ui-paused-text"></span></div>` inside `#scene2`, as a sibling right after `#player-ui`.
- Text: set `player-ui-paused-text` to `STR_UI.paused` once (e.g. the first time it is shown).
- Show/hide: in `PlayEtc.js` right after `PlayerUI_State.paused = !State;` (~line 1324):
  `if (PlayerUI_State.paused) Main_ShowElement('player-ui-paused'); else Main_HideElement('player-ui-paused');`
- Reset: in `Main_hideScene2Doc` (`Main.js:1634`) set `PlayerUI_State.paused = false` and hide the element, so
  it never leaks into the next stream. Also check the stream-start paths (`Play_Start`, VOD/clip starts): if a new
  stream starts playing, hide it.
- CSS: `#player-ui-paused { position: absolute; left: 5%; bottom: 5%; z-index: 15; padding: 0.4em 0.8em;
  border-radius: 0.3em; background: #1e1b25; color: #f5f1fa; font-size: 90%; }`. Hide it while the bar is
  visible (the bar caption already says Paused): `player-ui-active` is a class on `#scene2`, so use
  `#scene2.player-ui-active #player-ui-paused { display: none; }`. Add `#player-ui-paused` to the surface
  background rule in `SettingsColor.js`.

**Phase 3 done when** the 720p and 1080p screenshots match the composition sketch, the title never wraps,
no channel name is repeated, PiP and multistream info still render (open each once), and section 4 passes.

### Phase 4, Drawer rows that read like a TV settings list (P2)

#### 4a. Quality as a list of choices (live, VOD, clip; single stream only)

Today the Quality drawer shows one spinner row (`Play_controlsQuality`): ←/→ changes a hidden index, OK applies.
Replace it with one row per available rendition, current one marked, OK applies. PiP (`Play_controlsQualityMini`)
and multistream (`Play_controlsQualityMulti`) keep their existing spinner rows.

Implementation in `PlayerUI.js`:

1. Add a helper `PlayerUI_QualityList()` returning `{items: [...ids], current: index}` for the current mode:
   - mode 1: `Play_data.qualities[i].id` for `i < Play_getQualitiesCount()`, current = index whose `id` equals
     `Play_data.qualityPlaying`;
   - mode 2: `PlayVod_qualities`, `PlayVod_getQualitiesCount()`, `PlayVod_qualityPlaying`;
   - mode 3: `PlayClip_qualities`, `PlayClip_getQualitiesCount()`, `PlayClip_qualityPlaying`.
   Verify these names exist with jcodemunch/grep before using them.
2. In `PlayerUI_Render`, when `frame.group === 'quality'` **and** `PlayerUI_Available(Play_controlsQuality,
   'quality')` is true, render the list instead of the control rows: for each item create a row with
   `Navigation_Button(menu, 'player-ui-quality-' + i, label, PlayerUI_QualityPick.bind(null, i))`. Label is the
   rendition id; append `' ✓'` and set `aria-checked="true"` plus class `player-ui-current` on the current one
   (use `role="menuitemradio"`). Set `frame.entries` to `'q:' + id` strings so the existing "restore previous key"
   logic keeps focus by identity, and set the initial `frame.index` to the current rendition when the frame is new.
   Leave the other quality controls (mini/multi) appended as rows below the list if they are available
   (they never are at the same time as the single-stream control, but keep the code general).
3. Navigation: in `PlayerUI_Handle`, treat this list like `more`. Up/Down moves, Left/Right does nothing,
   OK calls the pick. In `PlayerUI_Focus`, focus `#player-ui-quality-<index>` for this group. Make sure
   `PlayerUI_Handle`'s "re-render on every key for control groups" line does not break focus (it should not,
   because entries are identity strings).
4. `PlayerUI_QualityPick(i)`:
   - If `i` is the current rendition, just pop back to the bar (see below). **Do not call `enterKey`**: for live,
     re-applying the same quality calls `OSInterface_RestartPlayer` (`PlayEtc.js:2451`) and restarts the stream.
   - Otherwise set the mode's index (`Play_data.qualityIndex = i`, `PlayVod_qualityIndex = i` or
     `PlayClip_qualityIndex = i`), set `Play_PanelCounter = Play_controlsQuality`, and call
     `Play_controls[Play_controlsQuality].enterKey.call(Play_controls[Play_controlsQuality], mode)`.
   - Then `PlayerUI_State.frames.pop(); PlayerUI_Render(); PlayerUI_ScheduleHide();`. Do **not** call
     `PlayerUI_Back` here; it runs the quality reset path, which is for cancelling.
   - Confirm in the browser that after picking, the caption shows the new quality, and that re-opening the list
     shows the check on the new rendition (i.e. `qualityPlaying` was updated by `enterKey`).
5. Empty list (qualities not loaded yet, `Play_getQualitiesFail`): show `STR_UI.loadingQualities`
   (`'Loading qualities…'`, new key) in `#player-ui-menu` and keep Back working. `Play_showPanel` already
   retries `Play_getQualities`.
6. Help line for this group: see Phase 5.
7. Tests in `player-ui-tests.js`: stub a quality list of three items for mode 1; assert that picking the current
   one does **not** call the restart/set-quality stubs, picking another sets `Play_data.qualityIndex` and calls
   `enterKey`'s side effect once, and that the frame is popped. Keep the existing assertions for mini/multi
   quality availability.

#### 4b. Label left, value on the second line, no duplicates

The rows have a title line and a summary line. Several titles repeat the value that the summary already shows,
using `' - '`: `PlayEtc.js:202` (speed), `:2234` (generic setLabel), `:2535`, `:2602`, `:2897` (video mode).
Several summaries wrap values in parentheses: `:2954`, `:3213`, `:3247`.

- For each `' - '` site: if the same value is shown in the row's summary/value line, drop the `' - ' + value`
  suffix so the title is only the setting name. If the suffix carries information that appears nowhere else
  (e.g. a channel name in `:2602` for multistream audio), keep it. Record each decision in the results file.
- For each `'(' + … + ')'` site: drop the parentheses.
- Video mode (`:2897-2902`): title becomes `STR_CHAT_VIDEO_MODE` only; summary becomes
  `<current mode name>` on the first line of the summary and the action hint `STR_UI.switchTo + <next mode>`
  (`switchTo: 'OK · Switch to '`, new key), or, if two lines are too tall, only the current mode plus the hint in
  the help line. Do not keep `STR_PRESS_ENTER_TO_CHANGE` in the player (leave the string defined; other code may
  use it).
- Phone chat (`:3005`): `string: STR_PHONE_CHAT_OPEN + ' (6)'` → `string: STR_PHONE_CHAT_OPEN`. The number-key
  shortcut stays documented in Diagnostics → Controls.
- These titles are also shown by legacy code paths outside the drawer (e.g. multistream/PiP strips if any
  remain). After changing them, open PiP and multistream once and make sure nothing looks truncated or wrong.

CSS for the row (in the `.player-ui-action` block, `index.html:~3204`): title `font-size: 90%` (was 85%),
summary/value `font-size: 80%; color: #c1b8cd;` (secondary role), `min-height: 2.9em` and consistent padding so
one-line and two-line rows align. Add the secondary color to the theme generator only if needed (see 3a note).

#### 4c. Value arrows that are visible and truthful

Spinner rows show `.up`/`.down` CSS triangles inside a container with inline `font-size: 50%`
(`Play_SetControlsArrows`, `PlayEtc.js:4084`). In the drawer they are rotated (`index.html:1308-1316`) and
render about 8 px tall.

- Inside `#player-ui-actions`, override the arrow container size: `#player-ui-actions [id^="controls_arrows_"]
  { font-size: 100% !important; }` and size the triangles to about 0.45em × 0.6em.
- Lay out the value as `◂ value ▸`: left-pointing arrow before the value, right-pointing arrow after it.
  The DOM order is `arrows(up, down) → name`; use flexbox `order` on the summary line or move nothing and
  position with CSS. Do not change the DOM structure built by `Play_SetControlsArrows` (legacy code reads those
  IDs).
- **Verify the direction for every spinner control in the drawer** (quality mini/multi, speed, low latency,
  external player, chat position/size/brightness/font/delay, audio, preview, diagnostics): pressing the key on
  the side of a bright arrow must change the value; at a bound, the arrow on that side must be dim (opacity 0.2
  is set by `Play_BottomArrows`). Quality uses reversed index logic (`Play_updownquality`, "TODO fix this reversed
  logic"), so its mapping may differ from the others. If a control's bright arrow is on the wrong side, fix it in
  the drawer CSS for that control only (or swap which triangle sits left), not in the shared
  `Play_BottomArrows` logic. Add a `player-ui-tests.js` assertion for at least speed and one chat setting.

### Phase 5. Keep the viewer oriented while a drawer is open (P2)

1. **Origin marker.** In `PlayerUI_Render`, when `frames.length > 1`, add class `player-ui-origin` and
   `aria-current="true"` to the bar button `player-ui-bar-<frames[0].index>`; remove them otherwise. CSS:
   `.player-ui-origin { box-shadow: inset 0 -0.12em 0 #bca0ff; }` (an underline, which DESIGN.md reserves for
   "active", distinct from the focus outline). Add the selector to the `aria-current` color rule in
   `SettingsColor.js` (~line 483) using `box-shadow` with `focusColor`.
2. **Breadcrumb title.** When the drawer is a group opened from More (`frames.length > 2` and
   `frames[1].group === 'more'`), set `#player-ui-title` to `labels.more + ' › ' + labels[group]`.
3. **Bar recedes.** Add class `player-ui-drawer-open` on `#player-ui` while a drawer is open; CSS
   `.player-ui-drawer-open .player-ui-bar .navigation-button { opacity: 0.6; }` and
   `.player-ui-drawer-open .player-ui-bar .player-ui-origin { opacity: 1; }`.
4. **Drawer does not fight the HUD.** `#playsideinfo` (diagnostics) sits top-right under the drawer. While a
   drawer is open, hide it: `#scene2.player-ui-drawer-open #playsideinfo { visibility: hidden; }` (put the class
   on `#scene2` too, or use a JS toggle in `PlayerUI_Render`; cleanup must remove it).
5. **Scroll affordance.** `#player-ui-scroll` clips the last visible row mid-text. When it can scroll further
   down (`scrollTop + clientHeight < scrollHeight - 1`), add class `player-ui-more-below` to the drawer and show a
   bottom fade (`linear-gradient(to bottom, rgba(30,27,37,0), #1e1b25)` on a 2.5em absolutely positioned
   pseudo-element or extra div; a pseudo-element is fine here because it is decoration). Same for content above.
   Update these classes in `PlayerUI_Focus` after the scroll adjustment. Hide the native scrollbar inside the
   drawer (`::-webkit-scrollbar { width: 0; }` scoped to `#player-ui-scroll`).
6. **Truthful help line.** Replace the single `STR_UI.playerHelp` with one per drawer type:
   - control groups (rows you adjust): keep `playerHelp` (`'↑ ↓ · Choose    ← → · Adjust    OK · Apply    Back · Return'`);
   - More menu: `playerHelpMenu: '↑ ↓ · Choose    OK · Open    Back · Return'`;
   - Quality list: `playerHelpList: '↑ ↓ · Choose    OK · Select    Back · Return'`.
   Choose it in `PlayerUI_Render` from `frame.group`. Raise `#player-ui-help` from `font-size: 63%` to `76%`.
7. Tests: in `player-ui-tests.js`, assert the help text selected for `more`, `quality` (list) and `playback`, and
   that cleanup removes `player-ui-drawer-open` and the origin class (call the owner's cleanup and inspect the
   stub element state; extend the `element()` stub with a minimal `classList` that records classes if needed).

### Phase 6, Type sizes and minor polish (P3)

Apply and then measure at 1080p (section 3, step 5):

| Element | Now | Target |
| --- | --- | --- |
| `#player-ui-help` | 63% (~18 px at 1080p) | 76% (~22 px) |
| `.player-ui-caption` | 75% (~22 px) | 80% (~23 px) |
| `.player-ui-drawer h2` | 125% | 125% (keep) |
| `.player-ui-action .controls_button_title` (title line) | 85% | 90% |
| Value / summary line | 85% | 80%, color `#c1b8cd` |
| Bar buttons | 100% (~29 px) | keep |

Also:

- Drawer row focus already uses outline + fill. Keep `outline-offset` positive so the outline isn't clipped by
  `#player-ui-scroll`'s `overflow: auto` (it has `padding: 0.2em`; increase to `0.25em` if clipped).
- Check large-text and light themes once (Settings → interface): bar, drawer, caption, info block, paused chip.
  Light theme must not show white text on a light surface; fix through `SettingsColor.js` roles.

### Phase 7, Channel switcher: align the look only (P2, visual-only)

The **Channels** button (and Up during playback) opens the legacy feed (`UserLiveFeed`, `.user_feed` at
`index.html:961`). Change only colors, type and focus; **do not change sizes, positions, widths, paddings that
affect card width, or the scroll math** (the native preview uses fixed slot positions).

1. In the browser, open the switcher and inspect the focused card to find its focus class (likely
   `feed_thumbnail_focused` or `side_panel_feed_img_focus`, `index.html:2731`, which uses a purple glow).
2. Replace the glow with the overlay focus treatment: `box-shadow: none; outline: 0.1em solid #bca0ff;
   outline-offset: 0.05em;` (use `outline`, which does not affect layout). Add the selector to the focus rule in
   `SettingsColor.js` so themes apply.
3. Card text: name `#f5f1fa`, metadata `#c1b8cd`. Tab row: the active tab gets the same underline as shell tabs
   (`box-shadow: 0 0.12em 0 <focusColor>`), inactive tabs `#c1b8cd`. Do not rename or remove tabs.
4. `STR_HOLD_UP` ("Hold UP or key 2", `en_US.js:370`) is shown in the switcher footer. Leave the text; just
   give it the secondary color.
5. Verify with `getBoundingClientRect` that the first card's rect is identical (±1 px) before and after the change.
   If it is not, revert the offending rule.

### Phase 8, Documentation, build and release packaging

1. `DESIGN.md`, "Approved composition" player paragraph: record the new rules. Quality is a list with the
   current rendition checked; the origin bar button shows the active underline while its drawer is open; the
   timeline lives inside the bar card; diagnostics HUD is off by default; a paused chip appears when the bar is
   hidden; the info block uses one-line title and a `·`-separated secondary line.
2. Write `docs/player-ui-ux-implementation-results.md`: what changed per phase, every decision this plan left
   to you (3a theme note, 3e timeline visibility, 4b per-site label decisions, 4c arrow findings), test counts,
   720p/1080p screenshots (save under `docs/ui-redesign-screenshots/player-*.png`), and the follow-ups from
   section 1's out-of-scope list plus anything you could not verify.
3. Web release bump in `app/general/version.js`: `WebTag` +1 (752 → 753), `WebVersion` to the current date,
   and a changelog entry describing the player changes in user terms (follow the existing entry style).
4. Full build: `node release/scripts/maker.js`. Then run the section 4 checks again plus the `--built` variants:
   `node release/scripts/player-ui-tests.js --built` and `node release/scripts/ui-focus-tests.js --built`.
5. Run the remaining fixture suites once: `node release/scripts/phonechat-tests.js`,
   `node release/scripts/update-tests.js`, `node release/scripts/chat-optimization-tests.js`.
6. Stop. Report to the user with the results file. Do not commit unless asked (if asked, the regenerated
   `release/` files go in the same commit, as in previous "up main files" commits).

## 6. Final acceptance checklist

Browser (720p and 1080p, live; VOD and clip where noted):

- [ ] Bar hidden → OK: bar appears, playback state unchanged. OK again: toggles play/pause.
- [ ] Fresh storage: no diagnostics block on reveal. More → Diagnostics can turn it back on.
- [ ] Info block: avatar inside safe area, title on one line with ellipsis, secondary line
      `Game · Live for … · N viewers · Watching …`, labelled LIVE badge. VOD shows VOD badge, clip shows CLIP.
- [ ] Bar caption reads `Quality · …`; right side shows `Paused` only when paused. No duplicated channel name.
- [ ] Bar buttons have icons + labels, grouped `[Play]  [Chat][Quality][Layout] … [More][Channels]`.
- [ ] Timeline (where visible) sits fully inside the bar card; Up focuses it with the pale-violet outline.
- [ ] Pause, let the bar hide: paused chip bottom-left. Resume or leave the player: chip gone.
- [ ] Quality drawer lists renditions with the current one checked; picking the current one does not restart;
      picking another applies, returns to the bar, caption updates. Back cancels without change.
- [ ] Drawer rows: no `Title - value` duplicates, no parentheses, no `(6)`, no "Press enter to change to -".
- [ ] Value arrows visible, on the correct sides, dim at bounds, and match what Left/Right actually do.
- [ ] While a drawer is open: origin button underlined, rest of bar dimmed, breadcrumb for More groups,
      correct help line per drawer type, scroll fade when more rows exist, diagnostics hidden.
- [ ] Back closes one layer at a time and restores the originating row, then the originating bar button.
- [ ] Channel switcher: outline focus (no glow), themed text colors, first-card rect unchanged.
- [ ] PiP and multistream: info and audio/quality rows still render and work.
- [ ] Light theme and large text: everything legible, nothing clipped.
- [ ] Phone chat from Chat drawer still suspends and resumes the drawer at the same row.

Automated:

- [ ] Section 4 checks pass on source and (after the build) on `--built`.
- [ ] New tests from Phases 1, 4a, 4c and 5 exist and pass.

Not verifiable here (list as pending in the results file): native playback on a TV, D-pad center behaviour in the
Android WebView for Phase 1, overscan on real TVs, and feed preview alignment after Phase 7.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| `preventDefault` in the listener blocks a default some legacy flow relied on | It only fires when a legacy key-down opened a new owner; run the Search and rail checks in Phase 1 |
| Quality pick restarts the stream | Never call `enterKey` for the already-playing rendition (Phase 4a step 4) |
| Label changes break legacy strips that still show titles | Open PiP and multistream after Phase 4b |
| Theme colors ignored for new selectors | Every focus/surface/active selector is mirrored in `SettingsColor.js` |
| Feed preview misaligned after restyle | Phase 7 is outline/color only; compare card rects before and after |
| Old WebView CSS support | No CSS variables, no flex `gap`, no `inset`; flexbox and `calc()` only |
