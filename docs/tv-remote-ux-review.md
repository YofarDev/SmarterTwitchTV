# TV remote ergonomics review

October 16, 2026. Review only; no application changes, build, commit or deployment.

> Historical record: the findings below were implemented for Web 752. See
> [the implementation results](tv-remote-ux-implementation-results.md) for what shipped, the
> verification evidence and the remaining device-only rows. The findings themselves are unchanged.

Method: independent source assessment (`remote_design_review`) and browser/detector assessment
(`remote_browser_evidence`), with root verification and synthesis. A usage interruption ended the
source agent before its final report; its delivered findings were retained and verified by the root.
The browser assessment resumed. This is a focused navigation review, not a complete design audit.

Baseline: arrows, OK and Back are the only guaranteed remote buttons. Numeric/media/long-press
shortcuts should remain optional accelerators. Preserve the approved visual direction.

## Overall judgment

The new composition fits TV browsing: prominent streams, stable thumbnail geometry, distinct current
destination and focus treatments, and grouped player controls. The most valuable next work is
interaction consistency. The visual highlight and the actual input recipient can currently disagree.
That must be fixed before judging navigation speed or adding more shortcuts.

Android's [TV navigation guidance](https://developer.android.com/training/tv/get-started/navigation)
supports predictable directional movement, clear focus and returning to the previous destination.
The recommendations below apply those principles to the actual SPTV handlers.

## Priority findings

### P1. Closing the rail/tabs does not transfer DOM focus back to content

**Browser reproduced, source confirmed.** In Browse, open the rail, then press Right to return to the
grid. The first card regains its outline, but `document.activeElement` remains a rail button. The next
Down reopens the rail and selects its next destination instead of moving to the next grid row.
Closing tabs with Back likewise left the tab and card highlighted; the next Right moved the tab.

`Navigation_Focus` calls `target.focus()` (`app/specific/Navigation.js:322`). Its cleanup removes the
custom class but never releases DOM focus (`:341`). `Navigation_Close` restores the legacy card
highlight (`:357`), whose row renderer only adds a CSS class (`app/specific/Screens.js:1844`). The
focused shell button's own key handler (`Navigation.js:171`) can therefore reopen navigation before
the restored grid handler receives the event. The retained native `:focus` style also creates two
apparent focus indicators.

**Fix:** make the focus handoff explicit: release the departing DOM target and transfer input to the
restored card/content owner. Keep one authoritative relationship between DOM focus, highlight and
logical owner. Cover tabs, rail, footer actions and empty-state recovery; do not only hide the extra
outline. Test the *next* direction and OK after each return, not just the immediate CSS state.

Evidence: [collapsed rail with two focus indicators](ui-redesign-screenshots/remote-stale-focus.png)
and [next Down unexpectedly reopens the rail](ui-redesign-screenshots/remote-rail-reopened.png).
The captured variant has Search focused before collapse and Library selected after Down; the same
fault was also reproduced starting from Browse.

### P2. The visible Channel content action is not reachable for arbitrary selected cards

**Source confirmed and exercised with the actual extracted handler.** The footer describes the
currently selected stream and offers Channel content, but Down only enters that action when
`dataEnded` is true and there is no card underneath (`app/specific/Screens.js:2246`). On a long or
paginated live list, moving down changes the stream rather than reaching the action for the original
selection. At the right edge, Right returns immediately (`:2239`). Hold Left remains a workaround.

**Fix:** provide a visible, short-press route to actions for the selected channel, preserving that
channel's identity while entering the action area. Keep OK-to-watch fast and retain Hold Left as an
optional shortcut. The acceptance criterion is access to the selected channel's content without
scrolling to the dataset's end or changing the selected channel. Decide the exact action placement
before implementation; blindly remapping Down would break continuous grid browsing.

### P2. Correcting a search requires re-entering the query

**Source confirmed, submission behavior executed in a small VM harness.** `Search_KeyEnter` saves
the query then clears the input (`app/specific/Search.js:145`). `Search_exit` clears it again (`:52`),
and `Search_init` does not restore it (`:27`). Back from results navigates to `Main_BeforeSearch`
instead of the editable search form (`app/specific/ScreensObj.js:188`). Browser testing confirmed
that submitting a query and pressing Back returned to Browse.

**Fix:** retain the query and search type; offer Edit search from results and prefill the input.
Define Back as results → populated search form → previous destination, preserving result focus when
re-entering results. A typo correction should never require typing the whole query with a remote.

### P2. Visible remote instructions disagree with the current interaction

**Source confirmed; search footer observed in browser.** The search form still shows the generic
"OK · Watch / Up · Tabs / Left · Navigation" footer. Its handler instead edits/focuses the input and
wraps among search-type buttons (`app/specific/Search.js:85`). Settings also renders the rail, but
Left changes a value and Up stops at the first setting (`app/specific/Settings.js:2056`); neither
screen provides the same directional route to the rail as the browsing grid.

Player value rows retain the old Up/Down arrow markup (`app/specific/PlayEtc.js:4084`), while the new
drawer uses Up/Down to choose rows and Left/Right to adjust values (`app/specific/PlayerUI.js:383`).
There is no corresponding orientation override in the drawer CSS.

**Fix:** generate hints for the active screen/region and orient value arrows horizontally. Give
search/settings an explicit, reachable navigation escape without overloading Left while editing.
Distinguish selection from editing, and describe the actual Back behavior. Do not change legacy
remote mappings globally merely to make one hint true.

### P2. Recovery actions do not match the reason content is missing

**Source confirmed, authenticated scenario not exercised.** Following's authentication message asks
the viewer to reconnect, but the only status action is always Try again → refresh
(`app/specific/Navigation.js:714`). The nobody-live state suggests browsing but likewise only offers
Try again. Refresh cannot repair an expired login, and repeatedly refreshing an empty feed adds work.

**Fix:** authentication failure → Reconnect account; nobody live → Browse live, with Refresh secondary;
network failure → Try again. Put focus on the appropriate enabled action and allow escape to
navigation during loading. Validate these against real account states.

## What already works well

- Fixed card geometry and a reserved title area reduce visual movement as focus changes.
- `UIFocus` explicitly tracks ownership, held presses and releases, including closing an owner while
  a key is held. Preserve this protection while fixing the DOM-focus gap.
- Player drawer frames retain parent selections, and drawer/phone-chat transitions suspend hiding.
  Existing fixtures cover important portions of this behavior; native end-to-end acceptance remains.

## Additional ergonomics observations

- Left and OK in grids act on release because holds open options or refresh. Settings currently
  defaults the hold threshold to 400 ms (`Settings.js:302`, index 6), although the early fallback in
  `Screens.js:26` is 250 ms. A slow OK press can reload instead of watch; holding Left does not provide
  normal repeated movement. Evaluate on real remotes and retain saved preferences. This is inherited
  behavior, not a newly proven regression.
- Six player bar choices and ten expanded rail choices add traversal. Fix correctness first, then
  measure common tasks before removing or regrouping destinations. Count alone is not proof of
  cognitive overload; labels and familiarity matter.
- Footer text is small in the 720p browser capture. Verify it at normal TV distance with default and
  large text; browser screenshots alone cannot establish viewing-distance readability.
- Nested playback controls are promising, but VOD seeking, PiP, multistream, physical key repeats and
  Android keyboard dismissal were not certified in this review.

## Provisional heuristic assessment

These are qualitative review judgments on the inspected journeys, not usability-test measurements.
Scale: 0 absent/broken, 1 weak, 2 mixed, 3 good, 4 excellent. Total **20/40**.

| Heuristic | Score | Reason |
| --- | --- | --- |
| System status visibility | 2 | Clear selection styling, but two apparent focus targets after handoff |
| Match with viewer expectations | 3 | Familiar content labels and TV composition |
| User control and freedom | 2 | Layered Back exists; search round trips and restored focus need repair |
| Consistency | 1 | Same-looking shell has incompatible directional behavior across screens |
| Error prevention | 2 | Held-key isolation helps; stale DOM focus redirects actions |
| Recognition over recall | 2 | Explicit drawers help; hidden holds and inaccurate hints hurt |
| Efficiency | 2 | One-step watching, but detail access and search editing add work |
| Minimal presentation | 3 | Coherent, restrained visual hierarchy |
| Error recovery | 1 | Messages identify causes but actions do not resolve all of them |
| Help and documentation | 2 | Visible hints and controls help exist, with contextual mismatches |

First-time viewer risk: following visible directions can move the wrong element or fail to reach an
action. Returning viewer risk: channel actions and query corrections cost unnecessary presses.
Slow-press/limited-dexterity risk: a slightly longer OK press invokes refresh rather than playback.
The main cognitive burden is remembering which screen owns each key. Browsing starts reassuringly,
but a mismatched highlight or a lost search query interrupts that sense of control.

## Proposed interaction contract

| Situation | Expected result |
| --- | --- |
| Focus indication | Exactly one visible focus target, matching the input recipient |
| Directional press | Predictable spatial movement or a visibly indicated value adjustment |
| OK on stream | Watch the selected stream |
| Back from overlay | Close one layer and restore its originating target |
| Back from results | Return to a populated query, then the previous destination |
| Return from player | Restore the originating item by identity, with nearby fallback if removed |
| Visible action | Reachable with basic remote keys, without a hidden hold or number key |
| Loading/error | Navigation remains available; recovery action matches the cause |
| Held key | No release leaks into the next layer; repetition remains predictable |

## Acceptance checklist for implementation

1. Grid → rail → Right/Back → Right, Down, OK: each next key affects the restored card, never the rail.
2. Grid → tabs → Down/Back → arrows/OK: exactly one focus indicator and correct action recipient.
3. Reach actions for the first, middle and last live cards without losing selected identity.
4. Enter a query, open results, edit one character, reopen results and Back twice. Query/type and
   result focus survive appropriate round trips.
5. Search/settings: every visible global navigation affordance has a discoverable remote route;
   adjusting values never accidentally navigates away.
6. Player: bar → drawer → nested drawer → Back twice; value arrows match the keys, and focus restores.
7. Following: expired authentication, no live follows, network loss and retry; action and focus fit
   the state, with navigation accessible while loading.
8. Physical TV: tap/hold/release arrows and OK, including after overlay closure; live/VOD/clip/PiP/
   multistream, resume after backgrounding and end-of-stream; default/large text and saved themes.

## Evidence and limits

- Actual production `app/` in the in-app browser, public unauthenticated Twitch data, 1280×720.
  Source and generated fixture suites each passed: navigation 121, focus 342, player actions 68,
  following/request handling 17 (**548 checks per variant**).
- Small isolated execution of the actual `Screens_handleKeyDown` and `Search_KeyEnter` functions
  confirmed the footer boundary condition and clearing of the editable query. These are narrow
  handler checks, not full application integration tests.
- `adb devices -l` showed no connected device. Native playback, authenticated error paths and
  real-remote timing remain unverified. No account or saved preference was changed.
- Detector: 47 warnings in `app/index.html`, using degraded regex-only scanning because parser
  dependencies were unavailable. 45 Roboto warnings are inapplicable to the approved bundled font;
  one violet focus-glow warning is not a reason to remove the focus cue; one incumbent margin-left
  transition at line 1483 is a performance candidate, not a measured navigation defect. No contrast
  result or browser-injected overlay was produced. Browser evaluation supports read-only inspection.

Recommended order: repair focus ownership; implement the detail/search/hint/recovery changes; then
measure the same journeys on a real remote. Keep the existing visual direction.

Implementation choices to resolve: repair the confirmed focus bug first or take all five findings in
one pass; keep legacy holds intact as optional shortcuts or revisit their timing after device tests.
