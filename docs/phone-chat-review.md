# Phone chat implementation review

Reviewed October 9, 2026 against the current uncommitted implementation and `phone-chat-implementation-plan.md`.

## Verdict

**Not ready to ship.** The build and 115 existing assertions pass, but there are two independent blockers to real Twitch login. Received-chat rendering and emote support also have defects that the fixtures miss. Configuring a client ID alone will not make this implementation work.

This review leaves implementation source unchanged. The full build was rerun as verification; generated artifacts were regenerated through the maker.

## Checks independently performed

- `node release/scripts/maker.js jsh`: passes.
- `node release/scripts/maker.js`: passes, exit 0.
- `node release/scripts/phonechat-tests.js`: 115 passed, 0 failed.
- `git diff --check`: clean.
- Generated phone HTML references `githubio/js/PhoneChat.js` and `githubio/css/phonechat.min.css`; WebTag is 742; the TV bundle contains no `SPTVPhoneChat` mobile runtime.
- Opened generated/source phone pages through a local HTTP server and checked actual DOM/CSS behavior.
- Ran an independent VM reproduction loading **main.js as well as its dependencies**, using dummy credentials and mocked DOM/network. No real Twitch messages or login were performed.
- Checked Twitch's current API documentation and the validation endpoint without credentials. GET returned 401; POST returned 404.

The existing test harness omits `app/PhoneChat/main.js` entirely. Its emote fixture for Get User Emotes uses an `images` field the real endpoint does not provide, and its zero-width test asserts that overlays cannot resolve. Its history test never exceeds the ID-tracking limit. Passing these assertions does not establish the behavior promised in the handoff.

## Scores

| Dimension | Assessment | Reason |
| --- | --- | --- |
| Structure | Good | Separate phone bundle and responsibility-based files; no TV runtime on phone. |
| HTML | Needs work | Source stylesheet path is broken; controls rely on hidden behavior overridden by CSS. |
| CSS | Needs work | Picker/banner ignore hidden state in the generated page. |
| JavaScript correctness | Critical | Callback startup and validation request both prevent normal login. |
| Verification and scalability | Needs work | App orchestration is untested; message ID index grows without bound. |

ES5/global patterns are appropriate here under AGENTS.md; introducing modules or modern TV syntax is not a recommended fix.

## Findings, in priority order

### 1. [P1] Handle the OAuth return before rejecting a missing channel

**Location:** `app/PhoneChat/main.js:1249–1280` (especially 1254–1258).

The authorization request uses a registered callback URL with no `?channel`. Twitch returns to that URL with the token/state in the fragment. `init()` reads only the query, sees no channel, and returns before `handleCallbackIfNeeded()`. Consequently, it never recovers the channel from the pending record, never validates the token, and never removes the credential fragment from the address bar. Authorization denial has the same ordering problem.

**Reproduced:** A configured page with a valid pending record for `twitchdev` and a dummy token/state fragment produces `no_channel`, performs zero validation/scrub operations, and leaves the pending record present.

**Fix:** Process and scrub callback data at the start of boot, including failure paths. Validate callback origin/configuration and state, recover/normalize the channel from the verified pending record, and only then apply the ordinary-link missing-channel check. Do not fix this by adding an arbitrary channel to the registered redirect URI.

**Regression:** Boot the actual App with an empty query and valid callback fragment/pending record. Assert clean URL, single-use state consumption, restored channel, validation request, and chat startup. Also cover denial, invalid state and unavailable storage.

### 2. [P1] Use GET for Twitch token validation

**Location:** `app/PhoneChat/auth.js:260–264`.

`validateToken()` sends POST to `/oauth2/validate`. Twitch documents GET, and an unauthenticated endpoint probe confirms POST returns 404 while GET reaches validation and returns 401. After fixing finding 1, this still prevents callback sessions and saved sessions from validating. [Twitch validation documentation](https://dev.twitch.tv/docs/authentication/validate-tokens/).

**Fix:** Change `method: 'POST'` to `method: 'GET'` (or omit the method) and require a successful status before trusting the validation response. Update the misleading POST comment as well.

**Regression:** Mock fetch and assert the actual method/Authorization header. Cover HTTP failure separately from a network rejection; testing `evaluateValidateResponse()` alone misses this defect.

### 3. [P2] Parse the actual Get User Emotes response

**Location:** `app/PhoneChat/emotes.js:64–81`, called by `main.js:752–764`.

The only Twitch picker loader calls Get User Emotes, but its normalizer requires `emote.images.url_4x`. That endpoint supplies format/scale/theme metadata in each emote and a **top-level URL template**, without per-emote `images`. Every real entry is skipped, leaving the Twitch picker empty. [Get User Emotes response contract](https://dev.twitch.tv/docs/api/reference/#get-user-emotes).

**Reproduced:** Normalizing the documented HypeLol entry returns zero records. The passing harness fixture models a different Helix emote response.

**Fix:** Pass the response template to the adapter; substitute supported ID, format, theme and scale values to create safe URLs. Include broadcaster context when requesting usable follower emotes. Preserve pagination. Keep any adapter for image-bearing endpoints separate or explicitly support both shapes.

**Regression:** Use the documented response shape including the top-level template, without an images field. Verify nonempty records, supported variants and pagination.

### 4. [P2] Make hidden picker/banner states actually hide

**Location:** `app/PhoneChat/phonechat.css:107–109` and `202–205`.

Author rules set `display: flex` on `#pc-banner` and `#pc-picker`, overriding the browser's hidden-attribute display rule. Setting `element.hidden = true` does not hide either element. The picker appears even while signed out, and Close cannot remove it. Banner text can remain visible after code tries to dismiss it.

**Reproduced in the generated page:** Both elements had `hidden: true` and computed `display: flex`; clicking Close left the picker visible.

**Fix:** Add explicit selectors such as `#pc-banner[hidden], #pc-picker[hidden] { display: none; }`, or a consistently enforced hidden rule with sufficient cascade priority. Keep visibility controlled in one place.

**Regression:** Browser-check visibility before login, on picker open/close, and after banner dismissal. Attribute inspection alone is insufficient.

### 5. [P2] Allow zero-width 7TV emotes to reach the renderer

**Location:** `app/PhoneChat/emotes.js:299`, together with `render.js:182–202`.

`buildResolver()` explicitly skips every zero-width record. The text tokenizer can only render records returned by that resolver, so overlay codes remain text and never reach the DOM helper's `pc-emote-zero` branch. The existing test asserts this exclusion, contrary to the specified feature.

**Reproduced:** With records for `Base` and zero-width `Overlay`, rendering `Base Overlay` yields an emote for Base, then literal Overlay text.

**Fix:** Keep overlay records resolvable and give token/DOM construction explicit previous-emote attachment behavior. Handle an overlay without a preceding emote safely. Use a bitmask for combined provider flags rather than assuming flags must equal exactly 256. Avoid relying on a fixed negative margin for differently sized base emotes.

**Regression:** Test a complete base-plus-overlay rendering chain, an orphan overlay, and combined flags. Replace the assertion that a zero-width code resolves to null.

### 6. [P2] Evict active IDs from the bounded dedup index

**Location:** `app/PhoneChat/render.js:220–224`.

When an ID ages out of `idOrder`, it is removed from `byId` only if its value is false. Normal messages have value true forever, so essentially every message ID remains in memory for the lifetime of chat. Bounding the messages array does not bound this index.

**Reproduced:** With history limit 3, after 1,000 distinct messages, only three rows remain in the store but `has('msg0')` is still true. The same occurs indefinitely for every ordinary ID.

**Fix:** Evict the corresponding old index entry when its tracking window expires, preserving only the intended bounded window/tombstones. If duplicate/deletion handling can reinsert IDs, design that eviction consistently rather than conditionally leaking all true entries.

**Regression:** Append substantially more than twice the history limit; verify recent IDs remain tracked and the oldest ones do not. Also test deleted IDs and duplicate arrivals.

### 7. [P2] Load the new TV dependencies in the source entry page

**Location:** `app/index.html:4477–4527`; new calls are in `PlayEtc.js:2997` and `Play.js:2242`.

The maker discovers the new TV source files automatically, but app/index.html's manual script list contains neither PhoneChatConfig.js, PhoneChat.js nor qrcode.js. Opening the source TV app using the documented workflow therefore leaves the new globals undefined. Selecting the control throws on PhoneChat_Show; ordinary playback exit also reaches an undefined PhoneChat_Cleanup.

**Verified:** The source entry page has zero script references matching PhoneChat or qrcode. Generated TV output contains the files, so a full-build test conceals the source-entry regression.

**Fix:** Add all three source dependencies to the existing script marker block in compatible order. Preserve the markers so the maker still replaces the block for release.

**Regression:** Load app/index.html directly through the source development server; invoke the QR action and exit playback without reference errors. Also verify the asset-based source APK workflow when available.

### 8. [P2] Correct the phone source stylesheet path

**Location:** `app/PhoneChat/index.html:28`.

`../release/githubio/css/phonechat.css` resolves from app/PhoneChat/ to app/release/, which does not exist. Copying CSS to the root release directory during the build does not fix the relative URL. The source phone page is unstyled even after building.

**Reproduced:** The requested `/app/release/githubio/css/phonechat.css` returns 404.

**Fix:** Reference the source stylesheet directly as `phonechat.css` and explicitly rewrite that reference in the generated HTML, or correct the relative path and update build rewriting accordingly. Prefer source pages that do not need a previous build to load their source CSS.

**Regression:** HTTP-load both app/PhoneChat/index.html and release/phonechat.html; assert stylesheet requests succeed and the intended rules are applied.

### 9. [P2] Recognize Twitch's real authentication failure notice

**Location:** `app/PhoneChat/transport.js:354-366`.

Authentication rejection is recognized only through selected msg-id tags. Twitch documents an untagged `NOTICE *` containing "Login authentication failed". That actual response is treated as an ordinary notice, leaving the transport authenticating; the subsequent close schedules retries using the same invalid credentials. [Twitch IRC authentication response](https://dev.twitch.tv/docs/chat/irc/#authenticating-with-the-twitch-irc-server).

**Reproduced:** Feeding the documented untagged response emits a normal notice and leaves state `authenticating`. The passing test adds a login_failure tag that the documented failure does not have.

**Fix:** Recognize the documented untagged auth failure while authenticating, emit the auth-error path, stop retries and clear/disable the session as appropriate. Keep ordinary room notices from being mistaken for authentication failure.

**Regression:** Replay the documented untagged failure and socket close; assert no reconnect timer and an actionable login state.

## Additional issues to address during the repair

These are smaller or need wider integration coverage; they should not distract from the two login blockers:

- `showBanner()` expects keys from Strings, but several callers supply `config_missing`, `no_channel`, `origin`, `storage` or `no_crypto`; the UI displays raw internal keys. The pageshow/online handler also hides banners unconditionally even when no session is ready. Repair state-to-copy mapping and recovery actions together.
- Local send echoes use `S.localName` (undefined) instead of `Strings.localName`, so they read `undefined: ...`. Their visible mark says sent even though only socket submission is known. They bypass emote rendering, and matching one echo removes the first echo DOM row regardless of which record matched.
- HTTP continuations have no account/session generation guard. Disconnect during channel lookup or revalidation can let late callbacks dereference a cleared session or mutate the new session. Test disconnect/sign-in races in main.js, not just WebSocket generations.
- After a user timeout, sending is disabled without a scheduled recovery, and only slow mode is surfaced from ROOMSTATE; other specified restrictions are missing.
- New lint failures still return false without setting buildFailed, so they can leave maker exit status 0. Make the lint-only success path distinguishable from failure.
- FFZ global normalization ignores default_sets and consumes every returned set. The current public response contains a non-default set as well. Reduced-motion CSS does not stop animated image assets; provider normalization needs correct static-variant selection.
- TV modal cleanup is wired only to Play_Exit, although shutdown/replacement has other paths. Closing also cannot restore the originating control because Play_hidePanel resets it; audit these against the planned lifecycle behavior.

## What is working well

- Phone/TV credential separation and public-only QR URLs.
- A local vendored QR encoder instead of a remote generation service.
- A distinct mobile bundle and explicit source ordering in the maker.
- Safe text-node message construction and strict user-color validation.
- Cryptographic OAuth state generation and the pure callback validation helper.
- WebSocket generation guards and no outgoing-message replay queue.

## Recommended repair order

1. Fix callback boot and GET validation; add tests that load main.js and exercise the complete return flow.
2. Repair hidden-state CSS and both source entry pages; run source and release browser smoke checks.
3. Correct Twitch response normalization and 7TV overlay rendering using representative provider responses.
4. Repair dedup eviction and actual IRC auth failure handling; extend fixtures past their current blind spots.
5. Address the additional app-state issues, rerun lint/full build/harness, and regenerate release output.
6. With owner configuration in place, verify real login, intentional send/receive, provider CORS, phone keyboard behavior and a physical QR scan. Until then describe the integration as awaiting live verification.

Do not equate a passing mock harness with a verified Twitch integration. The owner setup remains necessary after these code defects are fixed.
