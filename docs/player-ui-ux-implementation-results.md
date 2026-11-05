# Player UI/UX implementation results

Date: October 19, 2026. Plan: `docs/player-ui-ux-implementation-plan.md` (October 18 critique).
All eight phases implemented; no app code committed (working tree left for review). A review pass
the same day found and fixed several defects; see "Review fixes" below. Sections above it describe
the final state.

## What changed per phase

### Phase 1. OK no longer toggles playback when it reveals the controls

`UIFocus_Listener`'s keydown wrapper (`app/specific/UIFocus.js`) now calls `event.preventDefault()`
when a legacy keydown hands input to a newly pushed owner, alongside the existing held-key
suppression. Play/Pause stays the bar's first button and default focus. Two new ui-focus checks
(352 total, was 350). Browser: with the bar hidden, Enter shows the bar with zero pause-bridge
calls; the next Enter toggles. Search and rail/grid regressions pass.

### Phase 2, Diagnostics HUD off by default

`Play_Status_Visible` default in `Play_PreStart` changed from `0` to `2` ("Never visible"). Viewers
who ever changed the option keep their saved value. Verified: reveal with value 2 keeps
`#playsideinfo` hidden; value 0 shows it. The `player-ui-tests` sandbox passes the value as an input
and asserts nothing about the storage default, so no test change was needed.

### Phase 3, One visual system for the player chrome

- Info block (scoped to `#scene_channel_panel #stream_info`, PiP/multi untouched): safe-area
  padding, round 4.5% avatar, name line at 125%, one-line ellipsized title, secondary line in
  `#c1b8cd`, badge styling. At 1080p: name line 31.5px, secondary 22.2px (≥ the 22px floor).
- Info line copy: game name without "Playing", "Live for …", "Watching …" as new `STR_UI` keys.
  The `·` separators between game, time, viewers and watch time are drawn by CSS
  (`#stream_info .stream_info_timers:not(:empty):before`, suppressed after an empty game), so the
  live, VOD and clip writers (some asynchronous) write plain values. VOD/clip date and views are
  joined with `STR_UI.separator`. The VOD game prefix "Started " was dropped with "Playing".
- Bar caption: `Quality · <rendition>` left, `Paused` right (`.player-ui-caption` 80%,
  `#c1b8cd`).
- Bar buttons: icons (`play`/`pause` flips with state, `chat`, `levels`, `side-by-side`,
  `options`, `feed`), grouped `[Play]  [Chat][Quality][Layout] … [More][Channels]` via
  `player-ui-bar-primary` / `player-ui-bar-end`.
- Timeline inside the bar: `player-ui-has-timeline` on `#player-ui` (offsetHeight check in Render
  plus one 700 ms re-check for VOD's delayed reveal). Layering: `#player-ui` has no stacking
  context; the bar is z 14, the info panel (which contains the timeline) is raised to z 15 while
  the bar is up, the drawer is z 16. The timeline's `bottom` is `calc(5% + 5.45em)` so it tracks the
  em-based bar at any text size; seek-only hints (`#progress_bar_jump_to`, `#progress_bar_steps`)
  and the legacy focus box are hidden while the bar owns input. Timeline focus (Up from the bar,
  which closes the bar) uses the overlay outline, scoped to `#progress_bar_div`.
- Paused chip `#player-ui-paused` after `#player-ui` in `#scene2`: shown from
  `Play_PlayPauseChange`, hidden on resume; `PlayerUI_ResetPaused` clears it on
  `Main_hideScene2Doc` and whenever the main player (re)starts through the bridge
  (`OSInterface_StartAuto`/`ReuseFeedPlayer`/`RestartPlayer` with player 0), because the native
  player starts playing (`SetupPlayer`) without notifying the web side. Hidden while the bar is
  visible via `#scene2.player-ui-active`.

### Phase 4, Drawer rows

- Quality (single stream, all modes) is a list: `PlayerUI_QualityList` + `PlayerUI_QualityPick`.
  Rows are `role="menuitemradio"`, the playing rendition gets `' ✓'`, `aria-checked` and the themed
  `player-ui-current` color. Picking the playing rendition only pops back to the bar (never calls
  `enterKey`, so no `OSInterface_RestartPlayer`); picking another sets the mode's quality index and
  commits once. Empty list shows `Loading qualities…`. PiP/multistream keep their spinner rows
  (their availability is covered by the existing unit assertions).
- Labels: dropped the `Title - value` duplicate on the Speed and Low latency rows, restructured the
  Video mode row to title `Video mode` + summary `current · OK switches to next` (new
  `STR_UI.switchTo`), removed
  the parentheses on Chat enable / Force disable chat / Disable shared chat summaries and the
  `(6)` on Chat on phone. Kept the channel-name suffixes on "Open VOD - name" and the multistream
  audio value lines. That information appears nowhere else on those rows.
- Arrows: rebuilt inside the drawer as `◂ value ▸` on the value line. The summary line is a
  shrink-wrapped positioning box, triangles sit at its edges, the value is padded between them,
  container font-size forced to 100% (was 50%). Rows render arrows before labels (the descriptors'
  own order), so formatted values such as `1x (Normal)` survive. Direction: `Play_BottomArrows` brightens
  the up triangle at the first value, so **up sits on the Right and down on the Left**; the bright
  side is always the in-bounds direction (verified at both bounds in the browser, speeds 0/last).
  Triangles use `currentColor` so themes keep them visible.

### Phase 5, Drawer orientation

`PlayerUI_Orient` (called from Render): adds `player-ui-drawer-open` to `#player-ui` and `#scene2`,
underlines the originating bar button (`player-ui-origin` + `aria-current`, themed box-shadow),
dims the other bar buttons to 0.6, and breadcrumbs groups opened from More as `More › Playback`.
Help line follows the focused row: More → `playerHelpMenu`, quality list → `playerHelpList`, rows
with a value range → `playerHelp` (adjust), other rows → `playerHelpAction` (OK only); its wide
gaps between key groups are kept (`white-space: pre-wrap`). `#playsideinfo` gets
`visibility: hidden` while a drawer is open. `#player-ui-scroll` scrollbar hidden; scroll fades
(`player-ui-more-above/below` pseudo-elements) update from `PlayerUI_Focus`, with the gradient
color supplied by the theme generator so light themes get a light fade. Cleanup drops the
drawer-open classes (unit-asserted).

### Phase 6, Type sizes

`#player-ui-help` 63→76%, caption 75→80%, row titles 85→90%, value/summary lines 85% at 0.75
opacity (inherit, so themes work), row min-height 3.4→2.9em. The drawer ends a gap above the bar
(`calc(5% + 6.7em)`, `+ 9.1em` with the timeline). Measured at 1080p: help 21.3px, caption 22.4px.
Focus outline offset (0.04em + 0.13em) fits the 0.2em scroll padding, nothing clipped. Light theme
(White preset) verified: themed fade, dark arrows, no white-on-white.

### Phase 7, Channel switcher

`.side_panel_feed_img_focus` and the theme generator's `.feed_thumbnail_focused` rule now use the
outline treatment (`box-shadow: none; outline 0.1em/0.05em focusColor`); `.feed_thumbnail_focused`
keeps its themed background/text. Focused feed tab (`feed_end_name_focus`) lost its `scale(1.25)`
and border glow in favor of the shell tab underline; inactive tabs and the footer hint use the
secondary color; card names `#f5f1fa`, metadata `#c1b8cd`. First-card rect unchanged (outline and
shadow are layout-neutral); tab colors use `#user_feed`-scoped rules so the focused tab wins.

### Phase 8, Documentation and release

DESIGN.md "Approved composition" gained a "Player composition (Web 753)" paragraph. Web version
bumped: `WebTag` 752→753, `WebVersion` October 19 2026, changelog entry added. Full build run;
`release/` regenerated.

## Decisions the plan left open

- **3a theme note**: the secondary info-line colors stay fixed `#c1b8cd` (over the dark info
  gradient in every theme); drawer value lines and arrows instead inherit the themed text color.
- **3e timeline visibility**: live shows the timeline whenever the panel/overlay is up except in
  the offline "stay" dialog; VOD shows it once playback starts (`PlayVod_PosStart`, up to ~500 ms
  after start, covered by the re-check timer). The browser embed flow does not reach that show
  call, so the class check was verified by forcing the show; on device the flow is the legacy one.
- **4b label decisions**: kept channel-name suffixes at the "Open VOD" title and the multistream
  audio value lines; dropped everywhere else as recorded above. `STR_PRESS_ENTER_TO_CHANGE` left
  defined for other callers.
- **4c arrows**: sides swapped relative to the first draft (up=Right) so the bright arrow marks the
  in-bounds direction; quality's reversed index logic is unaffected because both directions change
  its wrapping value.
- **Icon substitution**: the plan's `videocamera` icon does not exist in the font; Quality uses
  `levels`.

## Test counts

- ui-focus: 352 (source and built), +2 from Phase 1
- player-ui: 84 (source and built), +16 (quality list ×8 including the array-hole index case,
  spinner ×2, help lines ×4, paused reset ×1, cleanup ×1)
- navigation 121, remote-input 11, search-navigation 26, following 17, unchanged, all pass
- phonechat 396, update 20, chat-optimization 773, all pass
- Full build: `node release/scripts/maker.js` completed; JSHint clean

## Screenshots

`docs/ui-redesign-screenshots/player-live-1080.png`, `player-live-720.png`,
`player-quality-list-1080.png`, `player-playback-drawer-1080.png` (breadcrumb + origin + dim),
`player-paused-chip-1080.png`. These are staged: a neutral gradient replaces the video and the info
block shows demo text ("SPTV Demo", the app icon) so no third-party stream content is committed.
Plus the earlier `player-bar-1080.png` / `player-drawer-1080.png`
for before/after comparison.

## Pending on a real TV (not verifiable in the browser)

- D-pad center behavior in the Android WebView for Phase 1 (the synthetic keyboard path proves the
  app-side suppression; only a device confirms the browser's default-action path).
- Native playback after a quality pick (the browser simulates the restart cascade differently).
- PiP and multistream info/rows with real feeds (availability covered by unit tests; browser has
  no native PiP/multi player).
- Overscan margins and feed preview alignment after Phase 7 (geometry rules untouched by design).
- Large-text setting on a TV. In the browser, a 1.3× body font kept the timeline inside the bar
  and the drawer above it; the drawer help line may wrap at very large text.
- VOD and clip info lines in the browser (no account data to open them): the CSS separator rule and
  writers were checked in code only.

## Review fixes (October 19, 2026)

- **Timeline painted under the bar** (P1): the bar's own stacking context covered the info panel,
  so the timeline never showed (the original screenshots showed an empty band). Fixed by the
  layering above.
- **Paused label/chip stuck after a channel switch or player restart**: now reset on every main
  player start through the bridge. `Play_PreStart` runs once at app start, so its reset was removed.
- **VOD/clip info line**: the inline game ran into the date with no separator, and VOD read
  "Started <game>". Separators moved to CSS; "Started " dropped.
- **Value arrows** centered on the whole row, far from the value; speed lost its unit. Fixed as
  described in Phase 4.
- **Timeline/drawer geometry** used fixed percentages against an em-sized bar; both now use
  `calc(5% + …em)`.
- Minor: duplicate caption line removed; quality picks store the rendition's own array index;
  Left/Right ignored in More; help line no longer advertises Left/Right on toggle/action rows;
  `.progress_bar_div_focus` scoped to the timeline; `app/general/version.js` line endings restored to
  CRLF; quality tests model the real `[bar, quality]` frame stack.
- Screenshots replaced with staged, neutral captures (the earlier set used a real clip whose frame
  and title were not suitable for the repository).
- Observed, not changed (pre-existing): after Up to the timeline and Down back to the bar, the info
  block stays hidden (`opacity_zero` set by the legacy timeline focus is not cleared).

## Follow-ups (out of scope here, from the plan)

- Reducing the channel switcher's nine tabs; changing its card geometry or safe margins (needs
  `OSInterface_SetFeedPosition` validation on device).
- Multistream and PiP info layout restyling (`#stream_info_pp`, `#stream_info_multi*`).
- The legacy `Play_updownquality` "TODO fix this reversed logic".
- STR_UI translations for the new keys (tracked by
  `app/languages/untranslated/untranslated_ui_js.txt`).
