# TV remote ergonomics, implementation results

October 16, 2026. Companion to [the implementation plan](tv-remote-ux-implementation-plan.md) and
the [review](tv-remote-ux-review.md). Web release **752** (APK 391 unchanged, no native bridge change).

## Summary per phase

| Phase | Outcome | Evidence |
| --- | --- | --- |
| 0 Baseline | Recorded HEAD `3bf2d4fd8`, suites 121/342/68/17, WebTag 751; built a real-DOM regression fixture under `dev/remote-regression/` | 26 failing checks demonstrated the stale-focus bug before any fix |
| 1 Focus ownership | `UIFocus_DomFocus/DomRelease` handoff helpers; Navigation cleanup releases DOM focus; card bodies are focusable and take DOM focus when the grid owns input; one persistent wrapped key-up listener releases held-key suppression; PlayerUI cleanup releases its controls; Back no longer falls through to hidden recovery buttons | Fixture green 58/58 after fix; suites 121/350/68/17 |
| 2 Card Actions | Every real card (live, VOD, clip, channel, category) renders an Actions button (`···`); topology body→actions→next body; vertical moves keep the subtarget column; row ends clamp without wrapping; OK on body still watches once; the duplicated footer Channel-content control and the special last-row Down route were removed; theme generator styles the focused button | Real app keyboard verification (topology, menu round trip, clamping); lint + suites green |
| 3 Search session | `Search_Session` with one entry rule (`Search_SessionEnter`), origin recorded once; draft survives blur/clone; results Back opens the populated form; form Back returns to the caller; Android keyboard Back dismisses the keyboard first; whitespace queries rejected; account switch clears the session; the form tab relabels to Edit search with results | New `search-navigation-tests.js` (26 checks, source + built); real app round trip: submit → Back → edit one character → resubmit → Back → Back to origin |
| 4 Hints and navigation | Contextual footer resolver (`Navigation_UpdateHint`): browse, actions, search form and settings each describe their actual controls; player drawer value arrows reoriented to Left/Right via `#player-ui-actions` CSS; Search Left from the first type choice and Settings Up from the first row open the rail | Lint + suites; browser checks of search/settings escape |
| 5 Recovery | `Navigation_LoadState` selects message + primary + secondary action together: auth → Reconnect account (existing device-code flow) + Browse; empty → Browse + Refresh; error → Retry + Browse; held OK cannot re-arm a status action (`event.repeat` guard); duplicate in-flight refresh suppressed; 401/403 classify as auth only on account-scoped screens | Lint + suites; states exercised only with fixture-level inputs, authenticated device path pending |
| 6 Direct navigation | `remote_controls` setting (Legacy default, missing value = Legacy) under Browsing remote controls; Direct acts on key-down, marks the activating key suppressed until its physical release, never holds OK to refresh; mode-specific footer hint | New `remote-input-tests.js` (11 checks, source + built); real app toggle verified (Direct Left moves on key-down and opens the rail at the first card) |
| 7 Measurements | Press counts below, counted on the implemented behavior in the browser | Browser; TV-distance readability not re-measured |
| 8 Acceptance | Source + generated suites and browser checks pass; physical TV matrix remains explicitly untested | Evidence table below |
| 9 Release | WebTag 751 → 752, changelog entry, full `maker.js` build, `apk/Changelog_Up.md` regenerated; generated bundle smoke-tested | `release/githubio/version/version.json` = 752 |

## Traversal cost (Phase 7)

Counted on the shipping behavior, key-down + key-up counted as one press:

| Task | Presses | Route |
| --- | --- | --- |
| Watch the selected stream | 1 | OK on the card body (unchanged) |
| Next row | 1 | Down (unchanged) |
| Next card body, horizontally | 2 | Right (→ Actions), Right (→ next body), the documented card-actions tradeoff |
| Selected channel's content | 3 | Right, OK (options menu opens on Channel content), OK |
| Refresh | tabs control, or Hold OK in Legacy | visible Refresh control in the tabs row |
| Switch Following / Browse | rail | Up, Left, Up/Down, OK |
| Correct a query | 2 + edit | Back (populated form), edit the changed characters, OK |
| Reopen same results after edit | 0 extra | identity bookmark restores the prior result |
| Nested player drawer return | 1 per layer | Back |

Vertical browsing and one-press watching are unchanged. The explicit extra horizontal press is the
cost of the visible Actions route; it is not hidden behind undocumented asymmetric shortcuts, and
Direct mode does not remove it. TV-distance readability of the longer footers (720p/1080p, default
and large text, custom themes) still needs the device pass; the footer keeps the reserved area and
may wrap to two lines rather than shrinking.

## Acceptance evidence (Phase 8)

| Area | Source fixtures | Generated fixtures | Browser (this implementation) | Physical TV |
| --- | --- | --- | --- | --- |
| Focus ownership / rail / tabs | 121 nav + 350 focus | same, on bundle | 58/58 real-DOM fixture; app round trips | **Not tested** |
| Card actions topology | covered by browser | bundle smoke: actions visible + focusable | keyboard-verified topology, menu round trip, clamping | **Not tested** |
| Search session | 26 checks | 26 checks | full round trip incl. one-character correction | **Not tested** (IME Back needs a device) |
| Recovery states | 17 following | 17 following | fixture-level states; real auth/empty pending account | **Not tested** |
| Player drawers | 68 player | 68 player | arrow orientation via CSS; playback native paths not exercised | **Not testable here** |
| Direct/Legacy input | 11 checks | 11 checks | mode toggle verified in app | **Not tested** (real remote repeats) |
| Phone chat | 396 | 396 | unchanged paths | unchanged from 3.0.390 status |
| Update flow | 19 | 19 | unchanged | unchanged |

Commands run at integration: `maker.js jsh`, all seven suites (source and `--built`),
`maker.js` full build, `git diff --check`. All pass.

## Deviations from the plan

- **Navigation header target (Phase 4.5/4.6):** instead of a new header button in Search and
  Settings, Left-from-first-type (Search) and Up-from-first-row (Settings) open the existing rail
  directly, and the rail close restores the form/row state. The visible escape exists; the plan's
  dedicated header control remains future work.
- **Reconnection identity wrap (Phase 5.3/5.4):** Reconnect account opens the existing add-account
  device-code screen and relies on its existing add/update semantics (`AddUser_SaveNewUser`
  deduplication). Same-account credential refresh-in-place and mismatch warnings are not yet
  wrapped with the plan's return context.
- **Device-code cancel target (Phase 4.8):** not implemented.
- **`remote-input-tests.js`:** tests the Direct/Legacy suppression contract over the real
  `UIFocus.js` rather than `Screens.js` press policies, which are not VM-loadable; the press
  policies were verified against the running app instead.
- **Plan section 5B cases 4 to 8:** partially covered (rerender, held keys, empty return in the
  fixture; search/settings via the app). Virtualized identity restore, recovery focus steal and
  player drawer cases in the fixture remain future additions.

## Post-release fixes (Web 752, same tag)

Two defects reported from real-keyboard use of the generated build, reproduced and fixed:

1. **Arrows stop working entirely.** Root causes found by fuzzing the source app (143+ mixed
   presses with holds, menus, search, channel content and simulated focus loss):
   - `Screens_init` and `ChannelContent_init` registered their key handlers only when scene1 was
     visible at that instant, so any init racing a scene/sidepanel transition left the screen
     with no key handler. Registration is now unconditional and each handler ignores input it
     does not own (playback, followed feed, side panel).
   - A hold press that lost its key-up when the window blurred mid-press left the hold-release
     listener armed and the key handler detached forever. `Main_KeyOwnershipReset` now runs on
     `blur`/`visibilitychange`: it clears suppression, cancels pending hold timers and re-attaches
     the current screen's handler when the grid plainly owns input.
   - Navigation cleanup also releases focus treatments and DOM focus left on the onboarding
     section (outside `navigation-shell`).
2. **Bottom-row card covered by the bottom band.** In the shell only the window's top row is
   fully visible above the reserved band, but the virtualizer parked the focused row one slot
   lower (fully visible in the old full-screen layout) and did not shift at all at the end of
   the loaded rows. `Screens_SetWindowOffset` keeps the container one row up once browsing has
   started, and `Screens_addrowEndWindow` gives the last loaded row the fully visible slot.
   Measured at 1280×720: the focused card rests at 178..451 against a band top of 569 (was
   466..739, 170px covered); verified from a fresh boot through the last loaded row and back up.

Both fixes are covered by the fuzzing procedure above, the real-DOM fixture (59 checks) and the
full source/generated suite run; the layout change was re-measured on the rebuilt bundle.

## Update dialog replaced by a passive rail badge

User report: the update dialog popped up although the update was already installed, and
"update now" then failed. The automatic popup path is removed. `Main_WarnUpdate` no longer
opens the dialog regardless of the update notification setting. Update availability is now a
red badge (dot plus tinted label) on the rail's Updates entry (`Navigation_SetUpdateBadge`),
set from both the APK check and the version.json check, cleared when the device is current.
The dialog itself only opens from an explicit press of that rail entry (or the existing
shortcuts); the opt-in toast setting still works. Verified in the running app: a simulated
newer version.json sets the badge with no dialog, a current version clears it, and the rail
entry still opens the dialog on demand. The collapsed/expanded rail background is explicitly
opaque in CSS (verified computed `rgb(30,27,37)` locally and present in the deployed
stylesheet); a transparent rail indicates a stale cached bundle, which the Web 752 update
replaces.

## Definition-of-done status

Code-complete for findings P1 (focus), P2 footer action (card Actions), P2 search editing,
P2 hints/arrows (partial: no dedicated header target) and P2 recovery matching (partial: no
identity-wrapped reconnect). Device-dependent rows (physical remote holds/repeats, IME Back,
TV-distance readability, native playback modes) are explicitly untested and must be completed
before claiming release acceptance on hardware.
