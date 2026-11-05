# UI/UX redesign production integration validation

October 16, 2026. The approved purple/charcoal composition is integrated into production source and
regenerated release assets. Hardware acceptance and authenticated end-to-end coverage remain pending;
this document does not certify a TV release. No deployment or commit was performed.

## Implemented behavior

- Seven stable destinations: Following, Browse, Search, Library, Account, Settings and Exit. About,
  Controls and Updates remain in the expanded rail. Tabs reuse existing screen lifecycles and loaders.
- Normal browsing defaults to Following with an account, or Add account / Browse recovery without one.
  Existing saved screen, account-picker preference, playback restoration and external intents retain
  their existing precedence. No saved preference keys or account/history schemas were replaced.
- Three-column live browsing uses fixed thumbnail geometry, a reserved focused-title/details area,
  a visible refresh action and the existing per-card options. Category/channel/video/clip/history
  renderers retain their real sorting, filters, playback and navigation operations inside the shell.
- Refresh captures channel/content identity and restores a surviving item or nearest index. Restoring
  a distant item rebuilds the bounded virtualized row window. Native and browser request callbacks use
  serial tickets to reject obsolete screen/feed results after refresh or account changes. Preview
  completion additionally checks the focused identity. No second polling loop was added.
- The compact player bar opens Chat, Quality, Layout, More and Channels. Drawers reuse the actual 48
  action descriptors, original control DOM and callbacks. Mode visibility, populated audio slots and
  per-mode callback arguments are preserved. Audio, Preview and Chat settings run their existing
  initializer before rendering their rows. Back cancels pending selections and restores the parent row.
- Phone chat suspends the player drawer and resumes its precise row when closed. Timeline operations,
  media/numeric shortcuts, playback engines and the existing feed switcher remain authoritative.
- Existing body key listeners dispatch to one presentation owner. Consumed key-downs and key-ups,
  including a legacy key-down that opens an overlay, cannot activate the next owner while held.
- Theme CSS resolves from existing saved colors; default purple/charcoal uses pale-violet focus.
  English fallback and help are included. Six language translations are tracked in
  `app/languages/untranslated/untranslated_ui_js.txt`.

The old navigation DOM is retained for legacy feed/native geometry dependencies, but the old main
menu listener and horizontal player strip no longer present the primary navigation/control UI.
Prototype assets stay under `dev/` and are excluded from the production build. No new APK bridge was added.

## Working-tree ownership and version

Starting HEAD: `aac56c84db8d79229a7f7aabbfa4f6eb4afa50af`. Existing phone chat, chat scheduler/cache,
Android request dispatcher, build tooling, APK version/changelog and related documentation changes
were already present and have been preserved. Generated artifacts reflect all integrated source,
including that pre-existing work. Do not revert whole shared files to isolate this redesign.

WebTag is **751**, dated October 16 2026, with a web redesign changelog entry. APK 391 and its existing
changelog were not incremented for the redesign. Generated assets are rebuilt with `maker.js`.

## Phase status

| Phase | Result | Remaining acceptance |
| --- | --- | --- |
| 0 Baseline | Revision/dirty-file record; 27 screen IDs, 48 actions, 141 settings; existing fixture baseline | Authenticated and hardware performance baseline |
| 1 Visual specification | User approved purple/charcoal and concrete prototype layout; DESIGN.md records it | TV reading-distance verification |
| 2 Navigation/focus | Production listener, lifecycle, account, preview and bookmark integration | Held keys and lifecycle behavior on physical remotes |
| 3 Shell | Seven destinations, tabs, utilities and no-account recovery integrated | Authenticated account permutations |
| 4 Following | Real loader, cards/details, refresh identities and guarded callbacks integrated | Real followed data, expired token, offline/online transitions on TV |
| 5 Browsing | Existing browse/search/category/channel/library/account renderers use shell | Exhaustive authenticated/nested round trips |
| 6 Player adapter | All 48 descriptors inventoried and mapped; original callbacks/DOM reused | Every native mode/action on TV |
| 7 Player UI | Compact bar, nested drawers, phone-chat suspension and feed switcher integration | Native overlays, PiP and multistream layer/focus checks |
| 8 Compatibility | Theme integration, original preferences, help and English fallback | Custom theme and backup/restore hardware matrix; light/+2 text checked in browser; translations tracked |
| 9 Validation/release | Build and applicable source/generated fixtures pass; browser paths below checked | Device matrix, measured performance budgets, staged rollout/publication |

## Automated results

| Command | Result |
| --- | --- |
| `node release/scripts/maker.js jsh` | Pass |
| `node release/scripts/maker.js` | Full JS/HTML/CSS/version generation passes |
| `node release/scripts/navigation-tests.js` and `--built` | 121 each |
| `node release/scripts/ui-focus-tests.js` and `--built` | 342 each |
| `node release/scripts/following-tests.js` and `--built` | 17 each |
| `node release/scripts/player-ui-tests.js` and `--built` | 68 each |
| `node release/scripts/phonechat-tests.js` and `--built` | 396 each |
| `node release/scripts/update-tests.js` | 19 |
| `node release/scripts/phonechat-collector-tests.js` | 11 |
| `node release/scripts/chat-optimization-tests.js` | 773 |
| `git diff --check` | Pass |

The generated-definition fixtures extract actual functions/descriptors from `main_uncompressed.js`
using UglifyJS ASTs. They expose no test API in the shipped bundle. Player checks execute real action
callbacks with observable state/bridge stubs; they do not certify native decoding or the entire DOM.
Following checks include named native callbacks, request/account generations, identity fallback and
bounded row mounting. Focus checks include held opening-key isolation and nested cleanup.

The local Android SDK is available, but `adb devices -l` reports no connected devices.
Native fixture suites/APK build were not run for this web-only redesign. Existing unrelated native
changes require their own acceptance. There is no claim of full end-to-end automation.

## Browser evidence

Environment: Codex in-app browser, source and generated app. Chrome was unavailable to the connector.
Actual public Twitch browsing loaded data. Embedded Twitch playback reports unavailable media in this
environment, and the repository's existing BrowserTest behavior supplies debug player values; screenshots
of controls prove presentation/input integration, not native playback. No credentials were entered.

Checked with actual keyboard input:

- No-account Following offers Add User and Browse. Focusing Browse then Enter selects Browse.
- Live grid movement updates the reserved details. Up reaches tabs; Left opens the rail. Search opens
  the existing query interface; Back and the Settings shortcut return through existing lifecycles.
- Generated startup honored saved playback restoration. After exiting, the original first-run browser
  help could be dismissed and Browse loaded through the new shell.
- Enter reveals the real compact bar. Right/Enter opens Chat with phone chat first.
- Enter opens the actual phone-chat pairing dialog. Escape restores `controls_22` in Chat.
- Back restores Chat's bar button. More → Playback renders real speed/external/rewind/latency actions;
  Back restores `player-ui-row-1` in More, then its original bar button.
- At 1280×720 the Browse viewport ends at 554.39px and details start at 568.80px (14.41px separation).
  The generated drawer renders readable labels; row controls and bar remain separately reachable.
- The 1920×1080 source Browse grid loaded real thumbnails and a fixed title/details region.
- Existing appearance settings applied White theme and global font offset +2. The shell canvas/rail
  both resolved to rgb(235,235,235), with black text/metadata; grid/details remained separated.
  Default colors and font offset 0 were restored after testing.

Integration defects found during these checks were corrected: overlapping card rows, the Settings
nested offset, hidden-class restoration, inherited strip-label transforms, clipped drawer rows, theme-rule specificity,
legacy hidden-control focus, stale metadata writes, and distant bookmark mounting.

Observed limitations: one source reload logged `PlayClip_isOn` undefined during existing startup; later
source and generated startup proceeded. Live unauthenticated requests also produced an existing chat
badge-transform error and Twitch iframe GraphQL/media errors. These observations are not recorded as
passing playback or an error-free authenticated session. Reproduce against a native TV before release.

The Impeccable detector ran in degraded regex-only mode (parser dependencies unavailable). It reported
47 incumbent font/margin-animation/glow findings; bundled Roboto is explicitly retained by DESIGN.md.
It did not compute contrast or certify legacy styles. No new width animation is used for the rail.

Production captures (older files without `production-` are synthetic prototype evidence):

- [Browse, generated 720p](ui-redesign-screenshots/production-browse-720.png)
- [Expanded rail, generated 720p](ui-redesign-screenshots/production-navigation-720.png)
- [Chat drawer, generated 720p](ui-redesign-screenshots/production-chat-720.png)
- [Light theme, generated 720p](ui-redesign-screenshots/production-light-720.png)
- [Light theme and font offset +2, generated 720p](ui-redesign-screenshots/production-light-large-720.png)

## Remaining release checks

Use the remote matrix for authenticated Following (empty/no-follow/expired-token/offline/reordered
refresh), account switches during fetch/preview, all nested callers, large text/light/custom colors,
backup/restore, numeric/media shortcuts and no-account startup. On a real TV verify native preview
coordinates, phone-chat overlays, live/VOD/clip, seek/chapters, PiP/50:50/multistream slots, background
resume, held keys and the oldest supported WebView. Measure navigation latency, startup and sustained
scrolling against the same-device baseline before setting numeric performance budgets.

Deployment is separate. Review the shared dirty tree before making scoped commits. Preserve the
previous deployed source/bundle reference, stage the generated build for TV acceptance, then publish
only after that matrix passes. Roll back by reverting the relevant source changes and rebuilding with
WebTag **greater than 751**; lowering a served version will not reliably update installed devices.
