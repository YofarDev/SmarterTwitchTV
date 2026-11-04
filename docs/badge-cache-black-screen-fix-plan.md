# Fix plan: badge-cache crash leaves live playback on a black screen

Prepared October 30, 2026. Implemented locally as Web 772; see [implementation and validation results](badge-cache-black-screen-fix-results.md). This document retains the original implementation plan.

**Objective:** Opening or recovering a stream must reach native playback even when badge data is missing or invalid. Fix the duplicate request and callback mismatch, prevent partially built badge caches, and make optional chat initialization failures recoverable.

## 1. Evidence and root cause

### Confirmed on the Fire TV

- Device: Fire TV `AFTKRT`, local address `192.168.1.169`, running `com.fgl27.twitch.debug`, APK `3.0.390`.
- The visible WebView loaded this fork's GitHub Pages release.
- The screen showed a black background with a circular loading indicator. Android reported no active playback and playback position zero.
- A requested stream reload received a successful HTTP 200 playlist response. Its request ID matched the active playback load, `Play_isOn` was true, and the end dialog was hidden.
- Completion then threw `Cannot read properties of undefined (reading 'replace')` during global badge initialization. The exception occurred before the native player was started.
- The in-memory `Chat_GlobalBadges` value was `{}`, with no template at key `0`.
- Earlier WebView exceptions included a `.forEach()` failure in the badge transformer, reached through the basic HTTP callback path.
- Supplying an empty template in memory allowed the same stream to start. A normal refresh then restored 1920×1080 playback, and chat connected successfully.

Diagnostic notes, screenshots, and Android logs were saved under `/tmp/sptv-tv-diagnosis/` on the development machine. This is temporary storage, not a committed incident archive. Do not copy raw logs into fixtures without reviewing and removing sensitive values.

### Confirmed in the source

`Chat_loadBadgesGlobalRequestWithChannel()` in `app/specific/ChatVod.js` starts **two requests to the same endpoint** when the global cache is absent:

| Helper | Success callback contract | What the badge callback expects |
| --- | --- | --- |
| `BaseXmlHttpGet()` | `(responseText, chatNumber, generation)` | Parsed object, generation first, channel ID included |
| `BaseXmlHttpGetFull()` | `(parsedObject, generation, chatNumber, channelId, ...)` | This is the compatible contract |

Both requests currently use `Chat_loadBadgesGlobalSuccess(obj, id, chat_number, channelId)`.

The mismatched basic callback can also pass the generation check accidentally. A deterministic local reproduction using production function definitions established this sequence:

1. Set chat generations to `[1, 0]`: slot 0 is active, slot 1 has been cleared.
2. Request global badges for slot 0, generation 1.
3. Complete the basic request with valid HTTP 200 JSON containing `{data: []}`.
4. The callback receives `(rawJson, 0, 1)`. Its check becomes `0 === Chat_Id[1]`, so it accepts the response against the inactive slot.
5. The callback publishes `Chat_GlobalBadges = {}` before transforming the response.
6. The transformer treats the raw string as an object and throws on `responseObj.data.forEach(...)`.
7. A subsequent valid stream initialization sees the truthy empty cache and throws on `Chat_GlobalBadges[0].replace(...)`.

This reproduces both observed exceptions without a Twitch outage or malformed API response. The completion order of the two requests determines whether the valid full response repairs the cache or a late basic response leaves it broken.

### Why video remains black

The relevant live path is:

```text
PlayHLS_AdProbeResult / normal playlist completion
  → Play_loadDataResult
  → Play_loadDataResultEnd
  → Play_loadDataSuccessEnd
  → Play_UpdateMainStream
  → ChatLive_Init
  → ChatLive_SetOptions
  → Chat_loadBadgesGlobalRequestWithChannel
  → exception

Remaining work is never reached:
  assign the new playlist → Play_onPlayer → OSInterface_StartAuto
```

The successful HLS response cannot recover the player because synchronous chat setup interrupts its completion handler.

The reported ads are a separate observation. This plan fixes the reproducible hang during stream initialization/recovery. APK 390 predates the repository's newer native ad-filter changes; assess ads separately after this fix, with the installed APK version recorded. Successful recovery does not establish that all ads will be blocked.

## 2. Scope and implementation constraints

Primary files:

- `app/specific/ChatVod.js`: global badge request, transformation, cache publication, and cache reuse.
- `app/specific/ChatLive.js`: channel badge completion and a chat initialization failure boundary.
- `release/scripts/chat-badge-tests.js`: new focused regression harness using Node `vm` and assertions.
- `app/general/version.js`: web version and changelog, when preparing the implementation for release.
- `AGENTS.md`: document the focused regression command once it exists.

Read the HTTP helpers in `app/specific/Main.js` and `app/specific/ScreensObj.js`, and playback callers in `Play.js`, `PlayExtra.js`, and `PlayMulti.js`. Their contracts explain the fix; changing the shared HTTP contract is unnecessary.

Keep runtime code compatible with old TV WebViews: existing global scope, ES5-style syntax, no imports or new dependencies. Preserve existing callback names and argument order across the Java bridge. Preserve CRLF in `ChatLive.js` and avoid unrelated formatting.

The implementation should be a web-only change. No new Android bridge methods, Media3 changes, account reset, or persistent setting changes are required.

## 3. Implement in reviewable stages

### Stage A — Lock down the failure with production-code fixtures

Create `release/scripts/chat-badge-tests.js` using the repository's existing `vm`/assertion approach. Load real production definitions; stub network transport, DOM insertion, clock, and native playback effects.

The harness must exercise the HTTP callback adapters, not only call the badge transformer directly. Otherwise it can miss the raw-text/parsed-object and argument-order mismatch that caused this incident.

Add the `[1, 0]` reproduction above first. Before the fix, it must demonstrate the bad cache and subsequent initialization exception. After the fix, assert the desired behavior: one compatible request, valid cache state, and successful playback completion. Also cover basic-before-full and full-before-basic completion as recorded failure scenarios; after removing the basic request, assert that no such callback is registered.

Capture the exact dependency set used by the fixture so it cannot silently replace the production badge functions with permissive mocks. Existing chat optimization tests currently stub badge transformation, so they do not cover this failure.

### Stage B — Correct the request contract

In `Chat_loadBadgesGlobalRequestWithChannel()`:

1. Remove the `BaseXmlHttpGet()` call for global badges.
2. Keep `BaseXmlHttpGetFull()` as the single request path, carrying generation, slot, and channel ID explicitly.
3. Validate the requesting slot and active generation before request dispatch and before accepting completion. Accept the numeric/string slot forms used by existing callers; reject other slots, missing IDs, and cleared generation `0`.
4. Require a usable channel ID before creating channel-specific CSS or dispatching its request. Preserve the shared-chat participant channel ID rather than replacing it with the main channel.
5. Retain the existing auth refresh/error behavior supplied by the full HTTP helper.

“Single request” here means one request per uncached invocation. Cross-slot request coalescing would introduce waiter and cancellation state; it is not required for this fix. Preserve correctness if two valid slots make concurrent full requests.

**Acceptance:** a cold invocation emits exactly one full request and zero basic requests. Both Android and browser transport paths deliver the documented callback arguments.

### Stage C — Build valid caches before publishing them

Replace truthiness as the cache-ready test with an explicit invariant: the global template at key `0` must be a string. An empty string is a valid successful result.

For global badge completion:

1. Reject stale/invalid request context before touching shared state.
2. Validate that the parsed payload is an object with a `data` array. Treat `{data: []}` as successful empty data; raw strings, `null`, and error-shaped objects are invalid.
3. Build the template CSS, subscriber/bits fallback map, and requesting-channel CSS into local variables.
4. Publish the global CSS cache and subscriber/bits map together only after transformation completes successfully.
5. Apply CSS and request channel badges after publication and after confirming that the slot/channel is still relevant.

The current transformer writes subscriber/bits entries into `Chat_GlobalBadges_Bits_Subs` while building CSS. Remove that partial-publication hazard. A small internal builder returning `{css, bitsSubs}` is suitable; it can accept the existing global fallback map when building channel styles. Update its two consumers together and retain the existing CSS selectors and fallback behavior. No bridge export is needed.

Payload rules:

- Validate each badge set, its ID, and its `versions` array before iterating.
- Validate each version's ID and selected image URL before calling string operations. Preserve existing image-size selection for valid data.
- Skip individual invalid records while preserving usable badges from the same response.
- Accept a genuinely empty response or empty version list as empty successful data. A nonempty response consisting entirely of invalid records should remain retryable rather than being cached as a completed empty load.
- Preserve channel overrides of global subscriber/bits badges and the existing derived subscriber milestone IDs.
- Never replace a previously valid global cache with invalid or partially transformed data.

For channel completion in `ChatLive_loadBadgesChannelSuccess()`, validate first, build locally, then publish CSS and the shared-channel-loaded flag together. Retain generation and `ChatLive_CachePins` checks. Treat cached empty channel CSS as ready by checking for a string instead of truthiness.

### Stage D — Recover from an already broken cache

The cache-read path must tolerate `{}`, `{0: null}`, or `{0: undefined}` without throwing.

1. Recognize these states as incomplete, clear the unusable cache state, and request fresh global badges through the compatible full helper.
2. Allow chat setup and playback setup to continue while that request is pending.
3. On validation or HTTP failure, leave the failed result retryable and allow messages to render with whatever badge styles are already valid.
4. Preserve already-valid channel CSS while global badges are unavailable. A subsequent successful global completion resumes normal channel badge loading; chat text and video must not wait for either request.
5. Do not install a permanent empty template merely to suppress errors: that would mark a failed load as successful and prevent a later valid response from restoring badges.
6. Do not add recursive immediate retries or an unbounded timer. The next normal initialization can retry. Any future background retry policy should be a separate behavior decision.

Invalid JSON is parsed inside `BaseXmlHttpGetFull_Process_End()` before badge completion. Keep that shared parser outside this patch's scope unless testing shows a required change. A malformed transport response may still produce an asynchronous diagnostic, but it must never publish a broken badge cache or prevent video startup. Do not claim that all HTTP parsing errors are eliminated by badge validation.

### Stage E — Keep chat initialization failures from aborting video

Add a narrow failure boundary at the `ChatLive_Init()` entry point, covering its chat-only synchronous initialization work. This protects the main stream, secondary stream, and multistream callers that already use that entry point.

- On an unexpected chat initialization error, record a concise diagnostic and return control to the playback caller.
- Invalidate the failed slot's generation before cleanup so pending callbacks cannot repopulate it.
- Reuse existing slot cleanup for timers, delayed messages, sockets, and cache pins. Make cleanup best-effort so a second cleanup exception cannot propagate back into playback.
- Keep the other slot running. Preserve the user's chat visibility and account settings. Permit a later ordinary initialization to try chat again.
- Preserve the normal playback ordering and existing checks for a stream that ended or was replaced while requests were in flight.

This boundary catches synchronous initialization failures. Asynchronous badge callbacks still need the validation and publication rules above. VOD chat calls `ChatLive_SetOptions()` through its own initialization path, so its badge failure behavior must also be covered by the badge fixtures and manual verification.

Avoid adding a broad catch around playlist processing or hiding the loading spinner unconditionally. A hidden spinner does not establish that a native player started. Let the existing player-ready callbacks control normal loading behavior.

Diagnostics should identify the operation, slot/generation, failure category, and whether cached styles were retained. Use the existing debug logging path. Do not log OAuth tokens, request headers, signed stream URLs, chat messages, or full response bodies.

## 4. Regression test matrix

| Scenario | Required observable result |
| --- | --- |
| Cold global badge load | One full request; callback receives parsed data and correct slot/generation/channel |
| Original `[1, 0]` callback collision | No basic request can corrupt the inactive slot or global cache |
| Two valid slots finish in either order | Both retain their correct channel styles; cache remains valid |
| Missing cache template on stream reload | No exception; fresh request starts; native playback is reached |
| Valid global `{data: []}` | Empty template is cached and reused without repeated requests |
| Raw string, missing `data`, `null`, error object | No partial cache publication; later valid response can recover |
| Invalid sets, versions, IDs, image URLs | Usable records survive; invalid records cannot throw |
| Existing valid cache followed by bad response | Valid CSS and subscriber/bits fallback remain intact |
| Valid empty channel styles | Loaded state is cached without a request on every reuse |
| Global badges fail, then recover | Existing channel styles remain usable; a later valid global result resumes normal channel loading |
| Channel changes while requests are pending | Old callback cannot style or repopulate the replaced slot |
| Shared participant leaves during a request | Existing pin checks reject its late channel result |
| Global/channel subscriber and bits variants | Existing overrides and derived milestone styles are preserved |
| Auth error, server error, timeout | No poisoned cache; normal auth behavior retained; video starts |
| Unexpected synchronous chat initialization throw | Native startup continues exactly once; failed chat is cleaned up |
| Cleanup itself throws | Playback still proceeds; other chat slot is unaffected |
| Ad-recovery and quality-restore completion | Successful current playlist reaches native startup despite unavailable badges |
| Stream already ended/replaced | Late completion does not resurrect native playback |
| VOD chat initialization | Missing/invalid badges cannot synchronously abort its startup |

Test the actual `Play_loadDataSuccessEnd()` path with badge functions present. A unit test that stubs `ChatLive_Init()` as a no-op cannot verify this bug. A separate deliberately throwing chat stub is appropriate for testing the failure boundary itself.

Support `--built` in the focused harness by extracting production definitions from `release/githubio/js/main_uncompressed.js`, following the existing test-only AST extraction pattern. Do not add test-only exports to the shipped web API. This checks generated definitions; real browser/device verification must also load the minified bundle to verify callback names and closure behavior.

## 5. Validation and release preparation

Run focused checks after source changes:

```bash
node release/scripts/chat-badge-tests.js
node release/scripts/chat-optimization-tests.js
node release/scripts/ad-filter-tests.js
node release/scripts/player-ui-tests.js
node release/scripts/phonechat-tests.js
node release/scripts/update-tests.js
node release/scripts/maker.js jsh
```

The ad-filter harness requires its documented JDK prerequisites. Its passing result verifies existing ad behavior against fixtures, not the absence of ads on Twitch.

Prepare a web-only release entry: increment the current `WebTag` by one, update `WebVersion` to the implementation date, and describe the badge failure and playback recovery fix. At the time of this plan, the source is Web 771, so the next tag would be 772 if no intervening change lands. Keep the APK version unchanged.

Build generated output and verify it:

```bash
node release/scripts/maker.js
node release/scripts/chat-badge-tests.js --built
node release/scripts/player-ui-tests.js --built
node release/scripts/phonechat-tests.js --built
```

Inspect the generated diff, including `release/githubio/js/`, the update manifest, and generated changelog. Commit regenerated artifacts with the source fix when preparing the implementation commit; never repair generated bundles by hand.

### Browser verification

- Load both source and built pages in Chrome; use fixture badge responses instead of account credentials where possible.
- Start with the exact active/cleared slot state from the reproduction, then open and reopen streams.
- Test global and channel badge failures, a delayed successful recovery, shared participant departure, and switching both chat slots.
- Verify chat messages continue without unavailable badges, valid badges return after recovery, and no `.forEach()`/`.replace()` errors occur.
- Exercise remote navigation, Back, chat toggling, and VOD replay. Use Android-backed fixtures for native-start assertions because a browser alone cannot establish real native playback.

### Fire TV verification

- Use a local debug asset build to test the implementation before publication. Restore temporary asset-loading changes afterward and keep them out of the final diff.
- Verify against the incident APK 390 where feasible: this is a web fix and should not depend on a new bridge. If the local build uses a newer APK, record that difference explicitly.
- Open JeefHS or another available live channel, inject missing/invalid badge cache data through the debug session, and trigger an ordinary stream reload plus ad-recovery/quality-restore flows.
- Confirm actual video frames and native ready/playing state, working audio, and removal of the spinner through normal player callbacks. Playback position alone is insufficient because a live window can slide while its reported position stays near a constant offset.
- Observe at least two minutes after recovery, including channel switching and a normal-quality refresh. Verify the stream has not remained on the 360p fallback.
- Test the main/secondary chat, switching or closing the secondary player, and VOD chat. Confirm login and persistent chat settings survive unchanged.
- Record APK/web versions, scenario, result, selected resolution, and any remaining exceptions. Do not report a real ad-break test as completed unless a break was actually observed.

## 6. Completion criteria and handoff

The implementation is complete when the deterministic reproduction passes against source and generated definitions, no incomplete badge cache can be published or reused as ready, current playlist completion reaches native playback despite badge failure, stale/ended sessions remain rejected, and browser plus Fire TV verification pass.

Deliver the source fix, focused regression harness, generated web artifacts, and concise validation results. Document any unavailable device scenario rather than claiming it passed. Publishing the web update is a separate action; the plan itself does not deploy changes.

The immediate request-contract fix and regression can be reviewed first. Cache publication/recovery and the chat failure boundary should follow in the same fix series before calling this incident resolved. A review should pay particular attention to subscriber/bits badge fallback, empty-success caching, slot cleanup, and minified callback behavior.
