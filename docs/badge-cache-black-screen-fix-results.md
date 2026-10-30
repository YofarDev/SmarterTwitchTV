# Badge-cache black-screen fix — implementation and validation

October 30, 2026. Web 772; APK version unchanged.

## Changes

- Removed the duplicate basic HTTP request for global badges. The remaining full request supplies parsed JSON, generation, chat slot, and channel ID in the callback's expected order.
- Reject inactive slots, invalid contexts, stale generations, and departed shared-chat participants before using badge responses.
- Build CSS and subscriber/bits fallback styles locally, then publish the completed cache. Invalid responses preserve an existing valid cache and remain retryable. Individual invalid records are skipped.
- Treat empty CSS as a completed successful result. Incomplete global caches trigger a fresh request while chat and video initialization continue.
- Catch synchronous failures at the live-chat initialization entry point, invalidate the failed generation, and attempt cleanup without interrupting native playback. Secondary-slot failure cleanup preserves the main chat sender timers.
- Added a production-definition regression harness and documented its command in `AGENTS.md`. Rebuilt the committed web assets and update manifest for Web 772.

## Automated verification

| Command | Result |
| --- | --- |
| `node release/scripts/chat-badge-tests.js` | 94 checks passed |
| `node release/scripts/chat-badge-tests.js --built` | 94 checks passed against generated definitions |
| `node release/scripts/chat-optimization-tests.js` | 807 checks passed |
| `node release/scripts/ad-filter-tests.js` | 19 Java filter checks and 19 web probe checks passed |
| `node release/scripts/player-ui-tests.js` | 84 checks passed |
| `node release/scripts/player-ui-tests.js --built` | 84 checks passed |
| `node release/scripts/phonechat-tests.js` | 472 passed, 0 failed |
| `node release/scripts/phonechat-tests.js --built` | 472 passed, 0 failed |
| `node release/scripts/update-tests.js` | 20 checks passed |
| `node release/scripts/maker.js jsh` | Passed |
| `node release/scripts/maker.js` | Full build completed |
| `git diff --check` | Passed |

The focused harness executes production HTTP adapters, badge builders, chat initialization, ad-probe completion, quality-restore scheduling, and live playback completion with isolated transport/UI effects. It covers the original `[1, 0]` callback collision, both slot completion orders, invalid/empty responses, cache recovery, badge overrides, stale callbacks, auth/server errors, cleanup failures, and rejection of ended sessions.

## Browser verification

- Ran the same 94 checks in the available in-app browser against source definitions: no failures.
- Ran them against generated definitions: no failures.
- Loaded the full minified release page from a temporary local server. Startup reached the Following screen; Browse navigation worked.
- The browser fixtures use synthetic transport and native effects, without account credentials. They do not establish actual native video decoding.

## Fire TV verification

Used the incident Fire TV `AFTKRT`, debug package `com.fgl27.twitch.debug`, APK `3.0.390`.

After the user authorized reopening SPTV, supplied the local generated **minified** Web 772 bundle through a temporary WebView debugger resource interception. No APK installation, persistent asset-loading changes, or public deployment was needed. Closing the debugger removes the interception; the current loaded page retains the tested code until its next reload.

Confirmed an active main stream before the fault injection. Replaced the in-memory global badge cache with `{}` and requested the existing ordinary stream reload. Native playback restarted at 1920×1080, chat connected, and the badge cache recovered to a valid string template. No badge `.forEach()` or missing-template `.replace()` exception appeared in that recovery.

The trace also captured two exceptions already seen in the original incident diagnosis: a chat `.split()` failure and a history/thumbnail `data[4].replace` failure. These are outside the badge-cache path and remain unfixed. A clean full-app exception trace is therefore not an acceptance claim for this patch.

Post-recovery monitoring sampled native playback every 20 seconds for 120 seconds: all seven samples reported playing. The same pre-existing chat `.split()` exception recurred once; no badge-cache exception appeared. Screenshots showed changing video content, and Android logged 1920×1080 decoding. Screenshots and transient debugger logs are kept under `/tmp/sptv-badge-verification/` on the development machine; they are not committed.

## Limits

- The malformed-JSON parser in the shared HTTP adapter is unchanged. A non-JSON HTTP 200 body can still throw asynchronously before the badge callback, without publishing a broken badge cache. A regression check verifies that distinction.
- Secondary-chat, shared-participant races, VOD initialization, forced chat exceptions, and quality-restore scheduling were covered by fixtures. They were not all exercised as manual hardware scenarios.
- No real ad break was observed as part of acceptance testing. This patch does not update APK 390's native ad filter or establish that Twitch ads will always be blocked.
- Source and generated artifacts are prepared locally. Nothing has been pushed or published.
