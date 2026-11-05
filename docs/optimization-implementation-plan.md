# Optimization implementation plan, Smarter Purple TV

Prepared October 16, 2026. This is an implementation handoff, not a completed optimization or a device performance report. Paths below are relative to the repository root. Function names are the primary navigation anchors because line numbers will change.

**Objective**

Reduce unnecessary build work, memory retained across channel changes, delayed-chat timer overhead, chat layout work, and Android request backlog. Preserve playback, remote navigation, chat timing, moderation, emotes, phone history, and old WebView compatibility.

Implement the packages below sequentially. Keep each package independently reviewable. Do not combine them with a framework migration, broad renaming, whole-file formatting, dependency upgrades, or player/Media3 changes. The earlier review's general HTML/CSS organization observations are not a request to reorganize the application.

**Known baseline and limits of the evidence**

- `node release/scripts/maker.js jsh` passed.
- `node release/scripts/phonechat-tests.js`: 384 checks passed.
- `node release/scripts/update-tests.js`: 19 checks passed.
- `node release/scripts/phonechat-collector-tests.js`: 11 checks passed.
- No Android build, TV profiling, or browser rendering benchmark was performed during the review.
- An instrumented lint comparison took 2.64 seconds with current behavior, including 1.98 seconds in 52 discarded minification calls; bypassing those calls took 0.39 seconds. These are illustrative local measurements, not a statistically controlled benchmark or an app startup improvement.
- The current JavaScript source uses per-channel caches with no eviction and one timeout per delayed message. The native executor has an unbounded queue and no shutdown call. These are source observations; quantify their user-visible impact during implementation.

**Repository constraints for every package**

1. Read `AGENTS.md` and `/Users/yofardev/.codex/RTK.md`; inspect `git status` before changing files. Preserve unrelated work.
2. Edit web application source under `app/`. Generated files under `release/` must come from the build. `release/scripts/` contains editable build/test source; it is not generated output.
3. Keep ES5-style syntax in runtime code: no modules, arrow functions, classes, `Map`, `Set`, or new browser requirements. Existing Node build/test scripts can use their existing modern syntax.
4. Preserve global function names referenced by the concatenated app and `release/api.js`. New internal helpers normally need no bridge export. If adding an APK bridge method becomes necessary, change Java and `OSInterface.js`, retain compatibility with older APKs, and test both paths.
5. Preserve the HTML script-block markers. New source files must be included in both development HTML and the production build in a compatible order; prefer small helpers in existing files when that avoids load-order changes.
6. Preserve CRLF where present, particularly `ChatLive.js`; avoid converting an entire file's line endings.
7. Do not publish, tag, upload, or deploy as part of implementation. Prepare reviewable source, generated artifacts, and validation results.

**0. Establish reproducible checks**

Re-run the four baseline commands above. Record the current commit, Node version, and results. Inspect the existing test harnesses before adding another framework. The Node `vm`/assertion approach already used by update and collector tests is suitable for timer and cache logic.

Capture a repeatable performance workload, with fixture messages and mocked network responses rather than credentials:

- Cold/warm lint timings, five runs per version, compared using medians on the same machine.
- TV chat at 20 and 100 fixture messages/second, with delay off, 5 seconds, and 30 seconds; test both chat slots.
- A burst of 1,000 messages, pause/resume, and channel change while messages are waiting.
- Visits to 100 fixture channels, then revisits to recent and evicted channels.
- Phone replay containing interleaved messages, deletions, user clears, and ordinary/priority rows.
- Native slow requests, queue saturation, a blocked UI callback queue, and activity destruction/recreation.

These rates are stress-test inputs, not claims about typical Twitch traffic. Prefer counters for pending timers, cache entries, admitted requests, and scroll calls; also use actual browser/TV traces for layout and responsiveness. Do not print tokens or response bodies in diagnostics.

**1. Skip minification in lint-only mode, small, low risk**

Files: `release/scripts/maker.js`; optionally `package.json` and documentation for check commands.

Current path: `make_JS(jshOnly)` concatenates each source file and always calls `UglifyJS.minify(fileContent, options)`. It later exits when `jshOnly` is true. The compressed string is unused in that mode.

Implementation:

1. Keep source collection and all three lint checks unchanged: main TV bundle, Extrapage, and phone bundle.
2. Only populate `mainJSContentCompressed` when `!jshOnly`.
3. Preserve source ordering, the removal of `Main_Start();`, full-build minifier options, return values, and failure exit codes.
4. Do not redesign asynchronous build orchestration or remove the full build's second minification pass in this package.
5. Optionally add explicit npm scripts for existing lint/test commands. Do not use this as a reason to update dependencies or regenerate a lockfile unnecessarily.

Conceptual change:

```js
mainJSContent += fileContent;
if (!jshOnly) {
    mainJSContentCompressed += UglifyJS.minify(fileContent, options).code;
}
```

Acceptance:

- Lint-only mode makes zero minifier calls and reports the same lint results.
- Invalid source still causes a nonzero exit; verify using an isolated temporary fixture, not by leaving invalid application source in the checkout.
- A full build still generates valid TV, Extrapage, and phone bundles.
- Compare production bundle hashes before/after under the same dependencies. This package should not change runtime bundle content. Investigate any difference.
- Report median timing before/after. No new permanent test suite is needed solely for the timing shortcut.

**2. Replace delayed-message timers with one scheduler per TV chat, medium risk**

Files: `app/specific/ChatLive.js`; inspect `Main_setTimeout` in `Main.js`, delay-setting handlers in `ChatLiveControls.js`/`PlayEtc.js`, and callers of `ChatLive_ClearIds`, `ChatLive_Clear`, `ChatLive_Switch`, and `ChatLive_SetOptions`. Add focused Node regression tests under `release/scripts/`.

Current path: `ChatLive_LineAddCheckDelay` calls `ChatLive_LineAddDelay`, which creates an untracked timeout for every message. `Chat_Id` prevents stale rendering, but old callbacks and their message objects remain alive until their deadlines.

Implementation:

1. Add queue state per chat slot: pending entries, one timer handle, and a monotonically increasing sequence number for ties. Each entry contains the current chat generation, message object, and absolute due time.
2. Compute delay exactly where it is computed today. Preserve immediate insertion when delay is off or `addToStart` is true. Treat nonpositive/invalid latency consistently with the existing timeout helper.
3. Capture the due time at enqueue. Later latency/setting changes affect newly received messages, not messages already scheduled.
4. Order entries by due time, then sequence. A simple FIFO is incorrect when the delay decreases while messages are pending: later arrivals can legitimately become due sooner. A small binary min-heap is suitable; keep it ES5 and test its observable ordering.
5. Keep at most one scheduled timeout per chat. Rearm only if a new earliest deadline requires it. When fired, clear the handle, remove due entries, invoke the existing `ChatLive_LineAdd` path, and schedule the next deadline.
6. Remove queued references as entries are consumed. On chat replacement/clear, cancel the scheduler and release the queue immediately. Audit initialization with `SkipClear` and both sides of `ChatLive_Switch`; do not rely only on a stale-generation check at callback time.
7. Retain a generation check during draining to handle reentrant cleanup/channel changes safely.
8. Preserve pause behavior: due messages still flow through `ChatLive_LineAdd`, whose existing paused buffer is bounded. Do not bypass that method or change its overflow policy.
9. Do not add a new message-dropping cap to the delayed queue without a separate behavior decision. One timer bounds timer overhead; it does not bound storage for all messages arriving during a delay. State this limitation honestly.

Acceptance tests with a fake clock:

- Thousands of pending messages create at most one timer per slot.
- No message appears before its captured deadline; equal deadlines preserve arrival order.
- Decreasing/increasing delay midstream produces the same delivery order as the old per-message timeouts.
- `addToStart` bypasses delay; zero delay retains current behavior.
- Clearing one slot releases only that slot's queue and timer; the second slot continues.
- Channel switch, reconnect/reinitialization, and stale callbacks cannot render old messages.
- Pause/resume retains the existing buffer cap and order.

Keep DOM batching out of this package so timer correctness can be reviewed independently.

**3. Bound reusable TV channel caches, medium risk**

Primary file: `app/specific/ChatLive.js`. Inspect `ChatLiveControls.js`, `ChatVod.js`, `AddUser.js`, and `app/thirdparty/kapchat.js` for consumers and derived state.

Cache inventory:

| Storage | Treatment |
| --- | --- |
| `extraEmotesDone.bttv`, `.ffz`, `.seven_tv` | Channel-scoped, evict together by channel ID |
| `extraEmotesDone.ChannelEmotes`, `.BadgesChannel`, `.cheers` | Channel-scoped; include in the same eviction operation |
| `cheers[channelId]` | Delete with its corresponding loaded marker |
| `ChatLive_sharedProfileImg[channelId]` | Include in channel ownership/eviction |
| `extraEmotes[chat_number]` | Active rendering data; preserve while in use, release on clear |
| Global Twitch/FFZ/7TV data | Preserve; not entries in the recent-channel cache |
| `userEmote`, dynamic `KnowBots` entries | Separate ownership audit; do not blindly delete |

Implementation:

1. Introduce a named limit of **20 inactive cached channel IDs**, a proposed conservative starting value rather than a measured optimum. Use one recency index for the union of channel caches, not 20 unrelated entries per provider.
2. Touch recency on successful population and cache reuse. Evict the least recently used inactive channel after insertion and after the active-channel set changes.
3. Pin both active chat channels and the current shared-chat participants they require. Maintain pins per chat slot, rebuilding them from the latest shared-session response. Unpin on departure/clear; do not pin every participant ever seen.
4. Shared-session processing already caps participants at 100 per slot. The acceptance bound is `inactive <= 20`, plus the current pinned union. Do not claim the total cache is limited to 20 or that channel count is a strict byte limit.
5. Evict all matching provider entries, badges, cheer marker/data, and profile images together. Never leave a loaded flag after deleting its corresponding data.
6. Apply old-chat generation checks before resolving mutable channel state or writing results. An obsolete request must not refill a departed channel's active data. Build successful response data locally before publishing where practical.
7. Distinguish an empty successful response from a failed/incomplete load. Existing Twitch channel-emote loading creates an empty object before its request completes; ensure failed loads remain retryable after the cache change.
8. Preserve emote precedence/collision behavior. `ChatLive_updateExtraEmotes` deliberately copies fields because different channels can use the same code for different images. Do not replace this with shared mutable references.
9. Audit secondary copies: `ChatLive_loadTwitchEmotesSuccess` also writes into `userEmote`, and the composer reads it. Deleting a channel cache alone does not release those copies. Document their intended account-wide semantics. If making them bounded too, first track source ownership so eviction cannot remove global or still-needed emotes, and add composer tests. Do not promise all chat memory is bounded while these remain account-scoped.
10. Likewise, avoid deleting accumulated bot names without preserving bot-filter semantics. Report any intentionally retained account/global state as a limitation of this package.

Acceptance:

- Visiting 100 fixture channels leaves no more than 20 inactive channel records across the indexed cache union.
- Two active channels and their shared participants remain usable during eviction.
- Removing one chat's pin does not evict a channel still used by the other.
- Revisiting retained channels reuses data; revisiting evicted channels reloads all needed data.
- Stale responses, empty results, failure/retry, overlapping requests, and emote-code collisions behave correctly.
- Badge CSS and emotes already rendered remain correct; account switching and the TV emote picker still work.
- Heap inspection distinguishes evicted cache objects from legitimate account/global copies and browser image caching.

**4. Optimize chat rendering without changing retained content, split into three patches**

**4A. TV message animation**

Files: `app/index.html` (`.chat_line_animation`, `@keyframes height_animation`); inspect `ChatLive_ElementAdd` in `ChatLive.js` and the animation setting in `Settings.js`.

Replace the `max-height` animation with a restrained opacity/translate animation on the message wrapper, retaining the existing setting and its enabled/disabled semantics. Keep layout height at its final value; animate presentation only. Do not apply transforms to preview/card containers whose geometry is used by the native overlay. Remove the persistent `will-change: height, max-height`; avoid adding permanent layer hints to every row.

The visual behavior changes: rows occupy their final height immediately instead of expanding. Verify wrapped text, tall emotes, highlights, hidden chat, both slots, VOD chat, and pause/resume on a browser and TV. Profile layout during the same message workload. Keep this patch separate so it can be reverted if motion/scrolling is worse. No CSS-variable migration or broad stylesheet extraction is needed.

**4B. Phone chat chronological insertion and batched maintenance**

Primary file: `app/PhoneChat/main.js`; inspect `render.js`, `transport.js`, and existing phone tests.

Current `appendRow` scans from the first row to find an insertion point, scans again in `pruneRows`, checks empty state, and may read `scrollHeight` for every insertion. `receiveTVHistory` repeats this for a whole replay. Priority messages deliberately survive for 20 minutes independently of the ordinary-history cap.

Implement the lowest-risk changes first:

1. Fast-path an incoming timestamped row if the tail's timestamp proves it belongs at the end. Fall back to existing stable insertion behavior for older timestamps, equal-time edge cases, or ambiguous/system rows. Do not assume the last element always has a timestamp.
2. Introduce explicit begin/end batch handling for synchronous history replay. Continue inserting message rows and applying moderation events in original sequence, but defer pruning, empty-state refresh, and scrolling until batch completion. Use `try/finally` so batch state cannot get stuck.
3. Keep DOM visibility immediate for moderation. In particular, a deletion/clear later in the replay must see rows inserted earlier in that same replay. Deferring DOM insertion itself would require additional pending-row moderation logic and is unnecessary for this first patch.
4. For live traffic, coalesce scroll/maintenance to one scheduled flush per frame with a compatible timer fallback. Track and cancel the scheduled handle during channel/session resets and page teardown. Re-check current scroll intent at flush time so a user who scrolls up is not pulled back down.
5. Preserve unread prompts, priority-tab filtering, empty state, local echo replacement, and message-ID deduplication. Existing DOM lookup catches priority IDs retained beyond the bounded dedup store; do not remove it unless replacing it with an equally long-lived, correctly pruned index.
6. Keep ordinary history at its existing limit and priority retention at 20 minutes. Do not cap all DOM rows at 300. Virtualization may be a later project if traces show priority history remains expensive; it is not required here.
7. Preserve the TV/phone clock-offset adjustment, history sequence cursor, and timestamp-scoped historical clears in `receiveTVHistory`.

Acceptance:

- A replay with 1,000 events performs one final scroll decision rather than one per visible row; row ordering/content matches baseline.
- Chronological live insertion avoids a full ordering scan in the normal case.
- Duplicate delivery, local echo, out-of-order history, equal timestamps, system notices, deletion-before-message, user clear, and whole-room clear remain correct.
- Priority rows survive ordinary traffic and expire according to the same 20-minute rule.
- Switching channels before a scheduled flush cannot affect the new channel; both tabs and jump-to-latest behave correctly.
- Use a real browser for scroll/layout verification. Pure Node assertions cannot establish layout performance.

**4C. TV DOM insertion batching, only after tracing confirms benefit**

Files: `ChatLive.js` (`ChatLive_ElementAdd`, `ChatLive_ElementAddCheckExtra`, `ChatLive_MessagesRunAfterPause`), `ChatVod.js` (`Main_Addline`, `Chat_Clean`).

The browser can already coalesce synchronous DOM writes. Do not claim one append causes one forced layout. First measure pause replay and due-message bursts after packages 2 and 4A.

If there is a measurable bottleneck, use a `DocumentFragment` for a synchronous append-only burst, preserving highlight transformations, alternating backgrounds, extra-message placement, counters, and cleanup. Treat `addToStart` separately: preloaded history is iterated in reverse and prepended; naively appending its nodes to a fragment reverses the result. Do not move incoming message processing asynchronously across moderation events without covering pending messages in moderation logic. Retain the existing immediate path for isolated messages. Skip this patch with recorded evidence if it adds complexity without a useful gain.

**5. Bound native network work and tie it to activity lifetime, highest risk, two patches**

Files: `apk/app/src/main/java/com/fgl27/twitch/PlayerActivity.java`, possibly a small package-private request dispatcher/helper; inspect `Tools.java`, `OSInterface.js`, and the Java test harness pattern under `release/scripts/java/`.

The executor is shared by startup update-file work, `XmlHttpGetFull`, `BasexmlHttpGet`, and APK downloads. Preserve those workflows. Do not change playback executors or media networking.

**5A. Lifecycle cleanup first**

1. Add explicit activity-owned request-dispatch state with thread-safe visibility. Mark it closed early in `onDestroy`, including partial initialization paths before the existing `AlreadyStarted` return.
2. Reject new submissions after closing and call `shutdownNow()` on the owned executor if initialized. Clear owned queued references/results safely. Do not wait for executor termination on the main thread.
3. Suppress stale completions before posting callbacks and again inside the UI runnable. A callback posted before destruction can execute afterward. Guard actual WebView/installer interactions, not only request submission.
4. Audit `LoadUrlWebView`, error callbacks, `finishAPKUpdate`, and the APK-download completion path. No old activity should launch an installer, show a toast/loading UI, or call JavaScript after destruction.
5. Do not shut down on every `onStop`; launching permissions/install UI and ordinary background/resume are supported flows.
6. `shutdownNow()` requests interruption; it does not guarantee an active `HttpURLConnection` immediately stops. Existing requests have connect/read timeouts and a `finally` disconnect. If prompt active cancellation is required, introduce request-owned connection cancellation and test it. Otherwise document that active I/O drains until completion/timeout while all stale delivery is suppressed.

Tests: destroy before initialization, destroy with queued/running/completed-but-unposted work, recreate repeatedly, destroy during APK download, and normal stop/resume. Use latches/fake jobs instead of timing-dependent sleeps where possible. Verify old pools terminate after running jobs settle and no old UI callback executes.

**5B. Bounded admission and result ownership**

1. Preserve 12 workers initially to isolate the effect of queue changes. Introduce a named waiting-queue limit of **128** as a starting value; validate against normal startup/shared-chat bursts before release.
2. Use explicit rejection (`AbortPolicy` or equivalent). Never use caller-runs behavior, which can execute networking on the UI/bridge thread. Never silently discard ordinary requests or APK update requests.
3. Route rejected bridge requests through the existing failure contract while the activity is alive; make update rejection release its busy/loading state and permit retry. Audit all four submission sites, including startup update-file work.
4. Preserve exactly-once completion for admitted requests. Handle success, network error, executor rejection, and teardown without double delivery.
5. Audit the shared 500-element `BaseXmlHttpGetResultArray`. A bounded worker queue alone does not make its rotating slot ownership safe: completed callbacks can wait on the UI thread while new submissions wrap the ring. Define synchronized slot reservation, publication, consumption, and release before changing admission.
6. Keep the existing bridge signatures if possible. Reserve a free result slot for each accepted bridge request, retain it until `BasexmlHttpGetResult` consumes the value, and release it on terminal cleanup. Verify all getter consumers first; do not assume repeated reads are unsupported without checking.
7. If no result slot is available, report failure without overwriting an occupied slot. A response-free/error callback or an inline serialized existing failure response can avoid needing another slot; preserve the existing callback argument types and safely quote data. Test this path, including more than 500 arrivals while the UI callback queue is blocked.
8. Do not repurpose `checkResult` or callback keys as unique cancellation IDs. They carry existing application semantics and can repeat.
9. Activity teardown cancels queued obsolete work. Cancelling individual screen/channel requests while the same activity lives requires explicit ownership/IDs spanning JS and Java; defer that extension unless evidence shows it is needed. If implemented later, add an optional bridge with old-APK fallback rather than guessing ownership from URLs or keys.

Acceptance:

- Worker count and waiting work remain within configured limits under a stalled-network fixture.
- Saturation cannot block UI/bridge threads, overwrite another request's result, silently leave loading state stuck, or duplicate completion.
- Slow/out-of-order requests always receive their own payload and callback context.
- More than 500 requests with delayed UI consumption cannot corrupt result pairing.
- No result is delivered to a destroyed activity. Existing update checks, APK install permissions, download failures, retry, and installer handoff continue working.
- Exercise actual dispatcher/result-ownership logic in a focused JVM test if extracted; avoid a test that merely searches Java source for keywords. The existing server harness demonstrates local Java compilation without a full APK build.

**6. Integration, release artifacts, and handoff**

Run relevant focused checks after each package; run the full set once after integration:

```sh
node release/scripts/maker.js jsh
node release/scripts/phonechat-tests.js
node release/scripts/update-tests.js
node release/scripts/phonechat-collector-tests.js
# Run the new scheduler/cache/native tests using the commands added by their package.
node release/scripts/maker.js
node release/scripts/phonechat-tests.js --built
node release/scripts/phonechat-server-tests.js
git diff --check
```

The server harness needs a JDK and Android SDK platform 35. The full APK additionally needs the sibling custom `media/` checkout and the repository's private-services workaround. Read `apk/Media3 changes.md`, `release/scripts/HELP.md`, and `docs/phone-chat-setup.md`. If prerequisites are absent, report exactly which checks were unavailable; do not report an Android pass based on JS/JVM checks. Do not commit private service files or unrelated build-configuration workarounds.

Manual acceptance on a representative older TV/WebView:

- Remote navigation and native previews still align with cards.
- Live, VOD, picture-in-picture, and multi-chat playback remain functional.
- Chat delay off/automatic/manual, pause/resume, fast switching, emotes, badges, highlights, moderation, and both chat slots work.
- Phone pairing, login, background/resume, 20-minute priority history, filtered tab, scrolling, local echoes, and deletion replay work.
- Activity recreation and APK update flows do not retain old callbacks or become stuck.
- Compare the same workload traces before/after; report layout time, timer counts, cache counts, request counts, and observed responsiveness. Avoid unsupported FPS or memory-saving percentages.

Prepare versioning once per intended release, not once per patch. Tooling-only changes need no runtime bump. For a web-only release, increment the then-current `WebTag`, use the release date, add the changelog, and build. For the combined native/web release, follow `AGENTS.md`: increment APK code in both sources, update `ApkUrl` to the intended matching artifact, mirror `apk/Changelog.md`, and also advance the web tag/date for shipped web changes. Do not hardcode the reviewed versions (APK 390 / WebTag 749) if the branch has advanced. Build-generated version/changelog and phone assets must match the source. Keep publishing separate.

Update `AGENTS.md`'s stale "no test suite" statement with the actual focused harness commands and new checks. Do not describe fixture tests as complete end-to-end coverage.

Final implementation report must include:

- Completed packages and any explicitly deferred conditional work, with reasons.
- Behavior preserved and any deliberate visual change.
- Changed source and generated files.
- Exact check results, unavailable device/build checks, and before/after measurements.
- Remaining limitations: account/global cache copies, delayed queue storage, native active-I/O cancellation, and any unprofiled rendering work.

**Suggested implementation-agent prompt**

> Implement `docs/optimization-implementation-plan.md` sequentially, honoring `AGENTS.md`. Start with package 0 and the lint-only optimization, then make each package a separate reviewable change. Preserve old WebView syntax, callback contracts, chat ordering/moderation, and 20-minute phone priority retention. Use focused regression tests for lifecycle/cache/scheduler behavior. Keep conditional TV DOM batching dependent on measurements. Regenerate release artifacts through the build, perform the specified checks, and report any unavailable Android/device validation accurately. Do not publish or deploy. Do not perform unrelated architecture or dependency changes.
