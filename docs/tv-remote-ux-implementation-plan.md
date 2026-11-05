# TV remote ergonomics, implementation plan

Date: October 16, 2026.
Status: implemented for Web 752 except the documented device-only rows and the deviations listed in
[the implementation results](tv-remote-ux-implementation-results.md); application work is complete and
built, physical-TV acceptance is still pending.
Source: [remote UX review](tv-remote-ux-review.md).

**Confirmed choice:** preserve one-press watching and add separate Actions targets to cards.
The exact focus topology below is the proposed implementation of that choice. It is deliberately
specified so that coding does not introduce different behavior on different screen types.

## 1. Outcome and scope

Make SPTV predictable with only arrows, OK and Back. The selected element, visible focus indicator,
DOM focus and input owner must agree. Every normal action must have a visible path without numeric,
media or long-press keys. Keep those keys as optional shortcuts.

Preserve the approved purple/charcoal design, three-column live geometry, bundled Roboto, saved
themes, native preview bounds, playback functionality and existing account/history data. Make the
small layout changes needed for card actions and contextual instructions. Do not replace the app's
screen registry, player adapters or native bridge.

This plan covers all five priority findings and the additional recommendations: long-press
ergonomics, traversal cost, reading distance, stale/loading states, nested player flows and physical
remote verification. Measurements determine timing/layout refinements; untested device behavior is
not counted as complete.

### Coverage and deliverables

| Review recommendation | Implementation work | Completion evidence |
| --- | --- | --- |
| Correct rail/tab focus return | Phase 1 | Real DOM test of the next arrow and OK after every return |
| Reach channel actions without hidden holds | Phase 2 | Separate card action target, identity-safe menu and bounded key path |
| Preserve editable searches | Phase 3 | Populated query/type, correct Back chain, restored result identity |
| Align hints, value arrows and navigation | Phase 4 | Context-specific help and verified Search/Settings navigation routes |
| Match recovery to failure | Phase 5 | Auth/empty/error/loading matrix and successful recovery/cancellation |
| Reassess held Left/OK | Phase 6 | Preserved legacy behavior plus tested optional direct-input mode |
| Measure menu traversal and readability | Phase 7 | Button-count table, TV-distance checks, theme/font evidence |
| Verify nested/native behavior | Phase 8 | Browser and real-TV acceptance matrix |
| Ship the actual fixes to devices | Phase 9 | Web version/changelog, regenerated output and release checklist |

## 2. Interaction contract

1. Exactly one interactive target has the focus treatment. A selected tab/destination can retain its
   distinct active indicator; it must not look like a second focused control.
2. Short OK on a playable card starts it once. OK on its Actions target opens options once.
3. Directional movement follows the visible focus order. Horizontal movement never wraps to another
   content row. Value adjustment is indicated explicitly.
4. Back closes the current dialog/drawer, then returns through the actual navigation history. It does
   not activate the newly exposed target or create a search/results loop.
5. Returning restores account + screen + query/category context + content identity + card subtarget.
   If the content disappeared, choose the nearest surviving card body; if none remain, choose the
   appropriate recovery action or navigation control.
6. Requests and preview completion never steal focus from navigation, an editor, a modal or a player
   drawer. Account changes invalidate old return targets and pending presentation work.
7. A held press belongs to its original owner until release. A new owner requires a fresh press.
8. Use one lifecycle for each transition. No duplicated listener registration, parallel keyboard
   dispatcher, second refresh loop or hidden duplicate control strip.

### Proposed card focus topology

Each real card has a primary body and a smaller trailing Actions button in its metadata area.
Reserve the space without changing the thumbnail rectangle, native player measurement or row height.
Use a visible label or recognizable action icon with a full accessible label; make the selected
card's Actions affordance unmistakable at TV distance.

The spatial order within each row is:

```text
Card 1 body → Actions 1 → Card 2 body → Actions 2 → Card 3 body → Actions 3
```

| Input | Card body | Card Actions target |
| --- | --- | --- |
| OK | Existing primary action: watch/open | Open that item's options menu |
| Right | Same card's Actions | Next card body; clamp at row end |
| Left | Previous card's Actions; first card opens rail | Same card body |
| Up/Down | Same column body in adjacent row | Same column Actions in adjacent row; body if unavailable |
| Back | Existing nested return/root navigation behavior | Same card body first |

At the top content boundary, Up enters the existing filter/header region or shell tabs as applicable.
At a missing neighbor or partial row, stay put or use the established nearest valid vertical target;
never jump to an unrelated item or silently wrap horizontally. Define partial-row fallback once and
use it across body/action targets.

**Known tradeoff:** moving horizontally between card bodies now takes two presses. Vertical browsing
remains one press per row; watching remains one OK. This cost must be measured explicitly in Phase 7.
Do not try to hide it with undocumented asymmetric Left/Right shortcuts. The chosen actions approach
can be refined after TV testing without removing the visible route.

Starting from any playable card body, the ordinary live path is **Right → OK → OK** to open channel
content when it is the first eligible menu row: three presses, independent of dataset length.
The old footer becomes metadata only; remove its duplicate interactive Channel content control and
the special last-row Down route. Continuous Down must continue to mean browsing vertically.

## 3. State and implementation boundaries

### Focus restoration

Extend the existing navigation/bookmark mechanisms with a small presentation return descriptor:
account, screen, context, item identity, fallback index, region, and subtarget (`body` or `actions`).
Search/settings need their own return adapters because `Main_values.Main_Go` alone does not identify
the active settings surface or input field.

Use an ephemeral descriptor, not persistent DOM references. Resolve the actual element after the
existing row virtualizer mounts it. Keep the existing bounded bookmark limit. Do not introduce a
second general-purpose router or persist every remote press to storage.

### DOM focus

Make the currently selected card body programmatically focusable and give it a meaningful label;
prefer a stable existing card node with `tabindex=-1` rather than a global invisible focus sink.
Use actual buttons for Actions where valid HTML permits; do not nest a button inside another button
or link. Maintain a deliberate browser Tab order as well as the remote order.

A handoff must release the departing element, update ownership, mount/resolve the target, transfer
DOM focus and apply the matching visual state. Use focus-without-scroll when supported, with a tested
fallback for older WebViews that preserves the app's existing virtualized scroll offsets. Never
depend on `:focus-visible`, modern focus options, `inert` or CSS variables for core behavior.

### Search session

Keep a bounded in-memory search session with entry origin, draft query, submitted query, result type,
result bookmark and form focus region. Continue exposing the submitted query through existing
`Main_values.Search_data` for loaders. The draft must not mutate live result requests until submitted.
No new saved search-history feature is part of this work.

### Recovery presentation

Represent status as a small descriptor containing state, message, allowed actions and focus target.
Distinguish first load from a refresh with usable same-account content. Derive state from the current
request outcome, not from the absence of DOM cards alone.

## 4. Ordered implementation phases

### Phase 0. Establish the regression baseline

**Files:** existing UI test scripts, `docs/ui-ux-remote-matrix.md`, this plan and the review evidence.

- Record HEAD, the starting working tree and current web version before code changes. Preserve the
  review documents/screenshots and any unrelated user changes.
- Run the four existing source suites once. The reviewed baseline was navigation 121, focus 342,
  player 68 and following 17 checks; counts are historical, not assertions to hardcode.
- Capture a short key trace for the broken rail and tabs returns with real `activeElement`, visible
  focus classes and the next navigation result. This becomes the first failing regression.
- Inventory actual return callers: grid/filter rows, rail/tabs, Search, Settings, account flows,
  thumbnail options, channel/category content, player bar/drawers, phone pairing and legacy dialogs.
- Record representative browser/TV task counts before changing input semantics.

**Exit condition:** a failing integration case demonstrates the reported bug against production
handlers; there is a known baseline for the journeys later claimed to improve.

### Phase 1. Repair focus ownership before adding new targets

**Primary files:** `app/specific/UIFocus.js`, `Navigation.js`, `Screens.js`, `PlayerUI.js` and scoped
focus CSS in `app/index.html`. Inspect `Main.js` and `Sidepannel.js` listener/lifecycle callers.

1. Add narrow capture/restore helpers around the current ownership model. Require an explicit return
   adapter for non-grid callers; do not infer Search/Settings handlers from the underlying screen ID.
2. In navigation cleanup, release DOM focus only when it still belongs to the departing owner. Do
   not blur a newly focused modal, keyboard input or player control.
3. Restore the mounted card's DOM focus as well as its class. If restoration is deferred until data
   arrives, check current owner and account/context again before completing it.
4. Audit shell button `onkeydown`, static handlers and the existing wrapped body listeners. Dispatch
   each physical event once; a stale/detached/inactive shell target must not reopen navigation.
   Keep mouse clicks and intentional browser Tab entry functional.
5. Preserve held-key suppression across cleanup, suspension and restoration. Avoid clearing
   `UIFocus_SuppressedKeys` merely because a menu closes.
6. Apply the same release/restore discipline to player dismissal and nested legacy dialogs; do not
   rewrite playback-specific Left/Right handling that the overlay does not own.

**Required cases:** rail Right and Back; tabs Down and Back; refresh/reorder while rail is open;
empty-state return; player bar timeout; drawer → legacy dialog → drawer; removed target and account
switch. For each, assert both the immediate focus state and the effect of the next arrow/OK.

**Exit condition:** the original browser reproduction passes with exactly one focus treatment and
no hidden element receiving input. Ship this as an independently reviewable change.

### Phase 2. Add card action targets and remove the unreachable footer action

**Primary files:** `Screens.js` cell renderers and key handlers, `ScreensObj.js`, `Navigation.js`,
`app/index.html`, `SettingsColor.js` and language strings.

1. Introduce a presentation subtarget (`body`/`actions`) separate from the existing `posX`/`posY` card
   coordinates. Keep `ColumnsCount`, preview placement, row virtualization and data indexing intact.
   Do not turn a three-card row into six data columns.
2. Add Actions targets through the live/VOD/clip/channel/category renderers, including history and
   nested screens where applicable. Use an eligibility helper: real items with supported actions get
   a target; loading placeholders, empty cells and banners do not gain dead buttons.
3. Implement the topology in section 2 through one shared neighbor policy. Coordinate changes update
   selected identity; moving between body and Actions on the same card must not restart its preview,
   refetch metadata or count as a new content selection.
4. Reuse `Screens_ThumbOptionStart` and the existing callback/confirmation paths. Add an explicit
   entry adapter for the new button rather than pretending a long press occurred. Ensure data and
   menu eligibility are captured for the intended item before opening.
5. Focus Channel content first for ordinary live items when available. Other content types select
   their first safe applicable action; never default to delete/block merely because earlier rows are
   hidden. Preserve all existing advanced menu operations and confirmation dialogs.
6. Capture account/context/item/subtarget before entering the menu. Back restores Actions; Back from
   Actions restores the body. Returning from channel content restores the originating item and
   subtarget. If the item was removed, use the documented fallback and do not apply an action to its
   replacement at the same numerical index.
7. Make `navigation-details` informational, remove the duplicate footer button/handlers and remove
   the last-item Down special case. Remove obsolete references from static-key binding and hints.
8. Use the existing theme generator for action focus, readable labels and disabled states. Preserve
   image bounds, safe margins, source order and stable row dimensions under large text.

**Required cases:** first/middle/last card, one/two-card final row, unloaded next page, all renderer
types, placeholder/banners, refresh during menu, channel ending, account switch, mouse/Tab input,
history deletion and return from nested channel/category screens.

**Exit condition:** every applicable card exposes its own actions with short presses; OK on its body
still invokes the original primary action exactly once.

### Phase 3. Make search editing and Back history preserve intent

**Primary files:** `Search.js`, `ScreensObj.js`, `Navigation.js`, `Main.js`; inspect playback search
entry callbacks and `ChannelContent.js` where needed.

1. Separate leaving the form, submitting a query, editing a previous query and cancelling the search
   session. `Search_exit` should no longer erase text and choose a destination as one inseparable step.
2. Preserve the draft before blurring/cloning the input. Restore query/type in `Search_init`; submit
   into `Main_values.Search_data` only after validation. Keep explicit result-type mapping because
   search form button order differs from the shell's result-tab order.
3. Label the existing search-form tab as Edit search when results exist. Do not add an unnecessary
   second row of equivalent edit controls. Back from results opens the populated form; Back from
   the form returns to the original caller.
4. With the Android keyboard open, Back first dismisses the keyboard and returns to form navigation.
   Distinguish Android Back from a text-editing Backspace; typing must not accidentally leave Search.
5. Record the origin once per search session. Integrate `Main_OpenSearch`, `Navigation_Go(Main_Search)`,
   `Main_BeforeSearch` and `OpenSearchBefore` through one session entry rule so reopening Edit search
   does not overwrite the true origin with the current results screen.
6. Same query/type: restore results by identity. Changed query/type: reset the result bookmark for
   that context. Back from a channel/category opened from results returns to those results before
   the editable form. Preserve existing search-from-player return and playback lifecycle behavior.
7. Remove the old grid counter when the form opens. Empty/error results retain an Edit search path.
   Clear account-scoped return bookmarks on account switch; do not retain stale account result data.

**Required cases:** one-character correction, unchanged resubmit, changed type, empty/whitespace input,
no results, network failure, nested result → content → Back, search opened from playback, repeated
Edit search visits, keyboard dismissal and delayed input-focus timer after leaving the form.

**Exit condition:** correcting a query requires editing only the changed text, and Back reaches the
original caller without a form/results loop.

### Phase 4. Make navigation affordances and hints truthful

**Primary files:** `Navigation.js`, `Search.js`, `Settings.js`, `PlayerUI.js`, `PlayEtc.js`,
`app/index.html`, `SettingsColor.js`, `app/languages/en_US.js` and untranslated-string tracking.

1. Introduce a small contextual hint resolver keyed by active region, content kind, editing state
   and available action. Update on focus/owner changes rather than every rendered frame.
2. Use distinct hints for playable body, non-playable body, Actions button, tabs, rail, search field,
   search type, settings list, settings value editor, player bar, menu row, adjustable row and recovery.
   A query form must not say Watch; a bar must not say Up/Down choose when Left/Right selects.
3. In player drawers, replace/reorient inherited value arrows so they indicate Left/Right. Scope the
   change to drawer presentation; keep the original semantics if the same DOM is reused by a legacy
   control. Restore presentation when moving controls between owners.
4. Distinguish immediate adjustments from pending/apply controls in the hint text. Never promise
   Back cancels an immediately applied value. Preserve existing reset behavior for uncommitted
   quality/speed/latency selections.
5. Add a visible Navigation header target to Search and Settings. In Search, after the keyboard is
   dismissed: Up from type choices reaches the passive query target, Up again reaches Navigation;
   Left from the first type choice reaches Navigation instead of wrapping to the last choice.
   OK on the passive query starts editing; editing Left/Right stays with the text cursor.
6. In Settings, Up from the first ordinary row reaches Navigation. OK/Left on Navigation opens the
   rail; Down returns to the saved setting. Left/Right inside a value row continue adjusting it.
   Back from a settings subdialog returns to its row, then existing screen Back returns to its caller.
7. Pass explicit Search/Settings restore adapters to the rail. Right/Back closes the rail to the
   precise field/row; selecting a destination performs the existing exit/init lifecycle once.
8. Audit Add account and Accounts for the same visible-shell issue. Give the device-code screen an
   explicit navigation/cancel target that pauses/cancels its polling through the existing lifecycle;
   preserve account-picker selection and confirmation behavior.
9. Write English master strings and extend the existing untranslated `STR_UI` inventory. Preserve
   English fallback and named interpolation; do not copy English strings into translated functions.
   Local README delegates translation guidance upstream, so inspect that guidance before translation
   edits. Test long labels and directional symbols without relying on truncating the only instruction.

**Exit condition:** every visible hint describes the focused target's actual controls; Search and
Settings can enter/leave navigation without changing a value or losing their local state.

### Phase 5. Implement state-specific recovery

**Primary files:** `Navigation.js`, `Screens.js`, `ScreensObj.js`, `AddUser.js`, `Users.js`, relevant
existing auth callbacks in `AddCode.js`, `app/index.html` and language strings.

| State | Primary action | Secondary action | Focus behavior |
| --- | --- | --- | --- |
| No account | Add account | Browse live | Existing onboarding, explicit selected button |
| Initial loading | None until actionable | Navigation remains reachable | Focus a visible navigation target, not hidden Retry |
| Refresh with usable content | Continue browsing | Refresh when permitted | Keep current item/owner; no forced jump |
| No followed channels live | Browse live | Refresh | Primary action if content truly empty |
| Expired/missing user authorization | Reconnect account | Browse live | Reconnect; preserve origin for cancel/success |
| Network/server failure, no content | Try again | Browse live | Retry; prevent duplicate in-flight activation |
| Refresh failure with same-account content | Try again | Continue browsing | Preserve selection; show stale/error status |
| Rate limit or other non-auth denial | Applicable retry/help | Browse live | Do not tell the user to reconnect without evidence |

1. Select message and action callbacks together. The current shared Retry callback must not remain
   behind a Reconnect label. Never infer that the user follows nobody solely from an empty live list.
2. Treat status classification carefully: a 403 is not universally an expired token; account/token
   state and the existing error response should determine whether reconnect can help. Keep existing
   app-token refresh and rate-limit handling intact.
3. Wrap the existing TV device-code flow for reconnection with expected account identity and return
   context. Reuse token acquisition and account storage; do not create a second OAuth implementation.
   Inspect `AddUser_SaveNewUser` deduplication/update behavior before connecting the new entry point.
4. Same account authenticated: update its credentials through existing save logic, invalidate stale
   presentation requests and reload Following once. Cancel/failure: restore the recovery action.
   Different account authenticated: make the mismatch explicit; never overwrite the old account's
   credentials under its ID. Preserve the app's existing add/switch-account semantics.
5. Retain only same-account usable content during transient refresh failure. Do not present the old
   account's content or treat stale data as freshly loaded. Clear stale indicators after success.
6. Disable/relabel an in-flight retry and suppress held/double activation. When a state changes,
   preserve focus outside the status area; only move it if the currently owned control disappears.
7. Cover Back/cancellation and late callbacks during reconnect, retry and account switching. No
   successful background request may steal focus from a rail or dialog the viewer opened meanwhile.

**Exit condition:** each primary action actually resolves its stated problem or leads directly into
the relevant recovery flow, with explicit same-account and cancellation behavior.

### Phase 6. Improve long-press ergonomics without silently changing saved behavior

**Primary files:** `Screens.js`, `UIFocus.js`, `Settings.js`, language strings and preference restore
paths only where the new setting requires them.

Implement a narrowly scoped **Browsing remote controls** preference:

- **Legacy shortcuts:** retain current release-to-move/watch behavior, Hold Left options and Hold OK
  refresh. Honor the existing `key_up_timeout` value. This remains the migration default for existing
  installations and backups lacking the new preference.
- **Direct navigation:** arrows move on keydown and repeat predictably; body OK activates once on
  keydown. Held OK never refreshes. Card Actions and the visible Refresh control provide the ordinary
  routes. Numeric/media keys retain their existing meanings. Playback seek/quality/mode handlers are
  outside this preference's scope.

For the first release, use Legacy as the missing-value default for everyone; label Direct as the
recommended choice only after physical-remote acceptance passes. A future new-install default change
would be a separately documented decision, not inferred from missing storage during backup restore.

1. Use one press/repeat/release policy per mode, not two simultaneous listeners. Cancel pending legacy
   hold timers when switching modes, leaving a screen, suspending or opening a modal.
2. Direct OK suppresses all repeats and the eventual release until a fresh press. Direct arrows repeat
   within the same owner; crossing into rail/dialog stops the held press from navigating that owner.
3. Direct Left on Actions returns to its body; Direct Left at the first body opens the rail. Legacy
   Left retains its configured hold option. A short OK on Actions opens options in either mode and
   must not inherit the card's Hold OK refresh timer.
4. Show the mode's real hints. Long-press hints are secondary, never the only instructions for actions
   or refresh. Keep accessibility implications visible in the settings description.
5. Test values below/at/above the configured threshold, slow taps, repeats with/without a browser
   `repeat` flag, missing/delayed key-up during backgrounding, and mode changes during a held press.
6. Add the preference using existing settings serialization conventions. Test old backup restore,
   new backup round trip and unknown-key handling; never renumber existing value arrays or rewrite
   saved `key_up_timeout` values.

**Exit condition:** users can choose immediate browsing without losing any action, and existing
users keep their remote semantics unless they change the new preference.

### Phase 7. Check traversal cost, readability and response time

**Primary files:** scoped shell/card/player CSS, `SettingsColor.js`, `Navigation.js`, `PlayerUI.js`
only if the measurements demonstrate a necessary adjustment; validation documentation.

- Preserve current rail destinations and player groups initially. Measure before adding grouping,
  hiding destinations or changing default focus. Fix functional reachability before counting options.
- Record presses for: watch selected stream; next card body; next row; selected channel content;
  refresh; switch Following/Browse; edit query; toggle chat; change quality; phone chat and return;
  return from a nested drawer. Count keydown/keyup as one physical press, and record holds separately.
- Expected contract: watch = 1 OK; next row = 1; next horizontal body = 2; live channel content from
  body = 3 when eligible. Preserve drawer parent indexes so reopening/reversing does not add travel.
- Compare against the original build on the same device and content. Investigate added presses
  beyond the explicit card-actions tradeoff; retain necessary advanced functionality.
- Check at 1280×720 and 1920×1080, normal TV distance, default/large text, dark/light/custom themes
  and long labels. Verify the Actions target, footer help and inactive metadata remain readable.
- If footer hints cannot fit legibly, shorten them to the current primary controls and move secondary
  shortcuts to Controls help. Allow reserved two-line layout where needed; do not solve overflow by
  shrinking essential instructions or covering content.
- Maintain safe margins and image geometry. Scroll long menus so the focused row is fully visible.
  Do not scale cards, add blur or animate layout dimensions in the new interaction paths.
- Measure keydown-to-focus feedback separately from network/preview latency. Record median and
  slow-tail behavior for a repeatable sequence of at least 30 presses; use same-device baseline for
  regression decisions. A proposed target is focus feedback within 100 ms for ordinary direct-mode
  navigation, subject to supported hardware validation; do not claim this is already measured.
- Inspect the incumbent margin-left animation only if traces show a relevant performance issue.
  Preserve the approved font and focus glow despite the generic detector warnings.

**Exit condition:** task counts and TV-distance observations are recorded, accepted tradeoffs are
explicit and focus is not delayed by remote/network/preview work.

### Phase 8. Complete regression, browser and device acceptance

Use the test layers in section 5. Correct all P1 failures before the final acceptance pass. Keep a
single evidence matrix with pass/fail/not-tested, environment, steps and captured output. Do not
convert a browser-only check into a native pass.

**Exit condition:** source/generated checks and required browser cases pass; device-dependent rows
have actual TV evidence. If hardware is unavailable, implementation can be code-complete but the
release remains explicitly unvalidated for those rows.

### Phase 9. Package the web release and document the behavior

**Primary files:** `app/general/version.js`, generated assets, existing redesign/remote validation
docs, `DESIGN.md` interaction notes and Controls help.

- Update WebTag by one from the actual current value and use the release date in WebVersion. At the
  reviewed baseline that would be 751 → 752, but re-read before editing to avoid overwriting a newer
  release. Add concise changelog entries for focus repair, card actions, retained searches, recovery
  and the optional direct-navigation mode.
- Keep APK version, APK URL and native APIs unchanged unless actual implementation discovers a
  necessary native change. A native change requires both bridge sides and its separate APK checks.
- Run the full maker; never hand-edit generated `release/githubio/` files. Build/test scripts under
  `release/scripts/` are source tooling and may be changed normally.
- Run generated-definition fixtures after the build and smoke-test the actual generated app.
  Include regenerated `release/` files and `apk/Changelog_Up.md` in the implementation change.
- Update `docs/ui-ux-remote-matrix.md`, `docs/ui-ux-redesign-validation.md`, the feature parity record
  and DESIGN interaction rules with the final behavior and explicit device results. Preserve the
  review as a historical record; link it to completed fixes rather than silently rewriting findings.
- Prepare coherent commits/PR units only as requested during implementation. Publication/deployment
  is a separate action; this plan does not publish anything.

## 5. Test strategy and concrete acceptance cases

### A. Existing focused fixtures

Extend actual production-function tests rather than copying the intended navigation into a second
test implementation. Test behavior/side effects, not source-string shape.

| Suite | Additions |
| --- | --- |
| `ui-focus-tests.js` | Owner return descriptors, suspend/resume, stale-element guard, held transitions |
| `navigation-tests.js` | Card subtargets, Search/Settings adapters, all boundary/partial-row neighbors |
| `following-tests.js` | Recovery classification, retry deduplication, stale data/account races |
| `player-ui-tests.js` | Bar/drawer hint selection, value adjustment vs selection, parent restore |
| New `search-navigation-tests.js` | Draft/submitted query, type mapping, Back chain, player origin |
| New `remote-input-tests.js` | Direct/Legacy taps, holds, release isolation and preference fallback |

Support `--built` on the new suites using the current AST extraction convention. Update extraction
only for production definitions actually needed by the tests; do not expose test APIs in `release/api.js`.

### B. Real DOM integration regression

The old focus fixtures cannot catch the main defect: `focus()` is absent or a no-op in their stubs.
Add a focused browser regression fixture under `dev/` using production helpers/handlers and actual
DOM event bubbling, focus/blur, buttons and content targets. Keep deterministic local data and no
live credentials. Synthetic records are acceptable; a synthetic replacement navigation controller
is not. Keep this fixture out of the shipped `app/` and build.

Run sequences with untargeted browser keyboard input after initial setup. Do not click/refocus the
expected next element between keys, which would conceal the stale-focus bug. Capture `activeElement`,
logical owner, visible focus targets, card identity and observable primary action.

Minimum cases:

1. Rail Right/Back → Right/Down/OK affects content; tabs Down/Back behaves equivalently.
2. Body → Actions → menu → Back restores Actions; Back again restores body; fresh OK watches once.
3. A held opening/closing key does not activate the next owner, including a default browser button
   click on Enter key-up. No duplicate native click + custom-handler activation.
4. Virtualized row removal/reorder restores identity and intended subtarget; missing target falls
   back to a safe visible body/recovery control.
5. Search keyboard/form/result transitions preserve text and origin, with no stale focus timer.
6. Settings/navigation round trip preserves cursor/value; arrows in editors do not navigate away.
7. Recovery state replacement does not steal focus from a currently open rail/dialog.
8. Player drawer/phone-chat return and idle bar dismissal leave no hidden active control.

Use the available browser tooling for execution. A permanent headless runner/dependency is optional
infrastructure to decide during implementation; neither adding a large browser stack nor running only
the VM tests is a substitute for real DOM acceptance.

### C. Production browser checks

Test source and generated app, including real public browse data, with only keyboard arrows/OK/Back.
Use controlled fixture responses for expired auth/empty/error cases when live accounts are unavailable,
and label them as simulated. Confirm no duplicate IDs, hidden tabbable actions, scroll jumps or
new console errors in changed paths. Check mouse and Tab entry without letting them mask remote bugs.

### D. Physical TV matrix

| Area | Required scenarios |
| --- | --- |
| Input | Basic remote and media-capable remote where available; taps/holds/repeats/release; Direct and Legacy |
| Browse | Long/paginated lists, partial rows, action targets, native preview position, focus after refresh |
| Search | Android keyboard shown/dismissed, single-character correction, result type and nested returns |
| Accounts | No account, username-only where supported, expired auth, reconnect cancel/success/mismatch |
| Playback | Live, VOD, clip; bar/drawers; seek/timeline/chapters; media/number shortcuts |
| Layout modes | Full/side chat, PiP, 50/50, multistream; correct selected/audio/quality slot |
| Lifecycle | Background/resume with held key or drawer; stream ends; external launch intent |
| Presentation | 720p/1080p, normal viewing distance, default/large text, dark/light/custom theme |
| Compatibility | Oldest supported WebView/device available; backup/restore of existing and new settings |

For each mode, also close an overlay while a key is held and release afterward. Verify one layer is
closed and no action is executed on the exposed content. Use native asset-loading workflow only when
needed for device testing, and restore its `LoadFromAssets`/asset changes afterward.

### Commands at integration points

```bash
node release/scripts/maker.js jsh
node release/scripts/navigation-tests.js
node release/scripts/ui-focus-tests.js
node release/scripts/following-tests.js
node release/scripts/player-ui-tests.js
node release/scripts/phonechat-tests.js
node release/scripts/search-navigation-tests.js
node release/scripts/remote-input-tests.js
node release/scripts/maker.js
node release/scripts/navigation-tests.js --built
node release/scripts/ui-focus-tests.js --built
node release/scripts/following-tests.js --built
node release/scripts/player-ui-tests.js --built
node release/scripts/phonechat-tests.js --built
node release/scripts/search-navigation-tests.js --built
node release/scripts/remote-input-tests.js --built
node release/scripts/update-tests.js
git diff --check
```

The two new suites do not exist yet; create them in their relevant phases. Run additional chat/native
suites only when changed dependencies or observed regressions justify them. Run the UI detector once
after UI implementation, interpret pinned-font/focus false positives, then do one consolidated fix
and confirmation pass. Do not repeatedly rebuild or polish unchanged screens.

## 6. Dependency order and review units

```text
Baseline → Focus handoff → Card Actions
                      ├→ Search session → Contextual navigation/help
                      └→ Recovery states
Card Actions + contextual help → Direct/Legacy input option
Integrated behavior → Traversal/readability measurement → Device acceptance → Web release
```

Recommended review units, implemented sequentially where shared handlers overlap:

1. Focus return fix plus real-DOM regression.
2. Card action targets and identity-safe menu return.
3. Search session/Back behavior and Search/Settings navigation adapters.
4. Contextual hints, drawer arrow orientation and translations inventory.
5. Recovery descriptors and reconnection return flow.
6. Direct-navigation preference, migration and input tests.
7. Measured layout/readability refinements, final evidence and generated release.

Keep source changes and corresponding tests together. Do not make cleanup/refactoring of unrelated
legacy files a prerequisite. No multi-agent implementation is assumed by this plan.

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Fixing appearance while stale buttons still own input | Assert real activeElement and the next action, not only CSS |
| Browser focus scroll fights virtualizer/native preview | Focus mounted targets; preserve scroll; test measured thumbnail bounds |
| Two card targets add too much horizontal work | Keep vertical travel/OK fast; record the explicit two-press tradeoff |
| Selected menu item changes during refresh | Resolve by captured account/context/identity; never act on a replacement index |
| Search origin rewrites create Back loops | One session entry origin; explicit edit/submit/cancel transitions |
| IME Back or Backspace incorrectly exits Search | Separate keyboard editing ownership from form navigation; device test |
| Reconnect authenticates another account | Validate returned identity and use existing add/switch semantics |
| Long-press compatibility regresses | Legacy migration default, unchanged thresholds, isolated Direct mode |
| Drawer arrows/hints misrepresent immediate changes | Derive presentation from actual control capabilities and commit behavior |
| Late request steals focus or leaks account data | Revalidate ownership/account generation before presentation updates |
| Browser success is mistaken for TV acceptance | Separate evidence columns and leave untested native rows explicit |
| Rollback leaves incompatible saved settings | Additive preference with safe missing-value behavior; retain existing schemas |

## 8. Definition of done

- All five review findings have a linked implementation change and passing reproduction case.
- Body OK remains one-press watching; Actions is visible and reachable on every eligible card.
- DOM focus, visible focus and input owner agree after every covered transition.
- Search draft/type and return origin survive editing; Back terminates at the correct caller.
- Hints, arrows and recovery actions match actual behavior in each supported context.
- Legacy saved controls remain intact; Direct navigation has device evidence and migration coverage.
- Card action traversal cost, reading distance and navigation latency are recorded, not assumed.
- Source/generated fixtures, real-DOM tests, production browser checks and required TV cases pass.
- Native playback/phone-chat functionality, themes, translations fallback and preview geometry remain
  valid. Any outstanding device limitation is explicit and prevents claiming release acceptance.
- The full web build, version/changelog and generated assets represent the final implementation.

Next step after accepting this plan: implement Phase 0 and the independently testable Phase 1 focus
repair, then proceed through the dependent phases. No additional visual redesign is required.
