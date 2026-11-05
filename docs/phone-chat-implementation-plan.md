# Phone chat by QR code — implementation handoff

Prepared October 9, 2026 for Smarter Purple TV (SPTV).

## 1. Task and decisions

Implement a web-only feature: while watching a live stream in SPTV, the user selects **Chat on phone**, scans a QR code, opens a phone-friendly webpage, connects their Twitch account, and reads/sends messages in that channel. Video continues on the TV. Include **Twitch, BTTV, FFZ, and 7TV emotes in the first release**, both in received messages and an emote picker. The user explicitly requested all three third-party providers immediately.

This document is the implementation specification. Work through its milestones in order. Make routine implementation choices yourself; report actual external configuration requirements instead of repeatedly asking about them. Do not deploy, push, or change the owner's Twitch developer settings as part of this implementation task unless separately authorized.

Decisions for this version:

- Static HTML/CSS/JavaScript, consistent with this repository; no framework or dedicated backend.
- A separate mobile page, with its own bundle and lifecycle. Do not load the whole TV app on the phone.
- Phone connects directly to Twitch. TV supplies only a channel link.
- Custom chat interface, rather than a Twitch iframe, to support the requested third-party emotes and mobile UX.
- Use Twitch IRC over secure WebSocket for this bounded feature, matching the existing TV transport. Twitch currently recommends EventSub/API for new chat integrations; this is a deliberate reuse/complexity tradeoff. Keep transport separate from rendering so a future migration is possible. Do not migrate TV chat in this task.
- Twitch authorization on the phone is separate from TV authorization. The same account may be used on both. Never transfer the TV token through a QR code.
- Require Twitch login before joining chat in V1. An anonymous preview is optional future work, not an acceptance requirement.
- A QR link selects the channel at scan time. Changing streams on TV does not change an already-open phone page; the user scans again.
- Support the primary live stream in normal playback and picture-in-picture. The label/dialog must clearly say which channel it opens. Hide this control in multistream mode for V1, and in VOD/clip playback. Secondary-channel selection and multistream pairing are later features.
- A signed-in session survives reloads in the same phone tab via sessionStorage. Do not promise permanent login across closed tabs. Token expiration leads to an explicit reconnect action.
- The phone interface starts in English. TV strings follow the existing translation/fallback conventions. Do not invent translations for every language.

Out of scope: native smartphone app, Android bridge changes, local TV HTTP server, automatic TV/phone pairing, channel-follow synchronization, remote playback controls, VOD chat replay, moderation tools, whispers, purchases, channel points, offline chat history, service workers, provider-wide emote browsing, and a redesign of existing TV chat.

## 2. Repository constraints and useful starting points

Read root `AGENTS.md` before editing. Preserve existing uncommitted work. Edit source under `app/`; generated output must come from the maker. Scripts under `release/scripts/` are build source and may be edited.

Relevant files:

| File | Why it matters |
| --- | --- |
| `app/specific/PlayEtc.js` | Player control indices, `Play_MakeControls`, visibility flags, remote input routing. Existing chat-write control starts near line 2945. |
| `app/specific/Play.js` | Primary player data and playback teardown. |
| `app/specific/ChatLive.js` | Existing IRC connection, message parsing, channel/user state, Twitch and provider emote loaders. |
| `app/specific/ChatLiveControls.js` | Existing modal/key ownership, composer and emote picker patterns. |
| `app/specific/ChatVod.js` | Third-party global emote loaders; these globals are not all loaded in ChatLive.js. |
| `app/thirdparty/irc-message.js` | Existing `window.parseIRC` parser; prefer reuse, with explicit tag-unescape handling if needed. |
| `app/thirdparty/kapchat.js` | Reference for Twitch emote range handling, including Unicode via punycode. Do not import its TV dependencies into the phone page. |
| `app/index.html` | TV dialog markup, inline stylesheet, script markers, and documented charcoal/purple colors. |
| `app/languages/0_Strings.js`, `en_US.js` | TV string declarations and master translations. |
| `app/Extrapage/` | Example of a standalone page and separate bundle. Preserve its existing OAuth behavior. |
| `release/scripts/maker.js`, `tools.js` | Build and lint integration. File collection is not recursive. |
| `app/general/version.js` | Web version and changelog source of truth. |
| `firebase.json` | Hosting publishes `release/`; confirm new generated files are not excluded. |
| `apk/.../Constants.java` | Read only: current canonical TV hosting URL is under `https://yofardev.github.io/SmarterPurpleTV/release/`. |

All TV source is concatenated into one global scope and wrapped by `release/api.js`. Use ES5-compatible syntax for app source, particularly code loaded by the TV. Avoid imports/modules, arrow functions, optional chaining, async functions, and framework tooling. Use the established formatting and JSHint rules. Node build scripts may retain their existing modern Node syntax.

Prefer studying existing algorithms and adapting small pure pieces over extracting/restructuring the whole legacy chat system. Do not copy the giant ChatLive.js or introduce a dependency on `Main_*`, `Play_*`, `Android`, or TV settings into the mobile page.

## 3. Files to add and modify

Suggested source organization; keep this small structure unless a concrete constraint requires a change:

```text
app/general/PhoneChatConfig.js     Public, non-secret configuration shared by TV and phone
app/specific/PhoneChat.js          TV link construction, QR modal and remote lifecycle
app/PhoneChat/index.html           Mobile HTML shell
app/PhoneChat/phonechat.css        Mobile layout and states
app/PhoneChat/auth.js              OAuth initiation, callback and session validation
app/PhoneChat/transport.js         WebSocket lifecycle and IRC dispatch
app/PhoneChat/emotes.js            Twitch + BTTV + FFZ + 7TV adapters and normalization
app/PhoneChat/render.js            Safe message rendering and bounded history
app/PhoneChat/main.js              Page state and interaction wiring
app/thirdparty/<qr-library>.js     Small, licensed, vendored ES5 QR generator
```

Modify `app/index.html`, `app/specific/PlayEtc.js`, playback cleanup where necessary, TV master/declaration string files, `release/scripts/maker.js`, and `app/general/version.js`. Add setup/testing documentation, either in `docs/phone-chat-setup.md` or a short feature section in README linking to that file.

Generated deliverables:

```text
release/phonechat.html
release/githubio/js/PhoneChat.js
release/githubio/css/phonechat.min.css
existing regenerated main bundles, index.html, version JSON and Changelog_Up.md
```

Suggested mobile namespace: `window.SPTVPhoneChat`, with small sub-objects for Auth, Transport, Emotes and Render. Bundle all phone scripts inside a consistent wrapper in explicit dependency order. Attach DOM handlers in JavaScript, not inline HTML. Do not expose phone helpers through `smartTwitchTV`; no APK-to-web calls are added.

## 4. Public URL and configuration contract

The production page path is `phonechat.html`. The TV link is:

```text
https://yofardev.github.io/SmarterPurpleTV/release/phonechat.html?channel=<login>
```

This is the proposed new route on the host configured in this repo, not a claim that the page is deployed already. Verify it after deployment. A channel login is lowercase and URL-encoded. Use `Play_data.data[6]` as the existing main channel login source after checking its actual assignment; do not use the display name at `data[1]`. Validate against Twitch login characters and a sensible length limit. Resolve the real broadcaster ID on the phone via Helix `GET /users?login=...`; do not trust a user-supplied ID as identity.

Define public configuration once in `app/general/PhoneChatConfig.js`:

- Canonical HTTPS phone page URL used by TV QR generation.
- Twitch client ID owned/configured by this fork, or an explicit empty placeholder until supplied.
- A small explicit list/map of supported page/callback URLs for production, optionally Firebase, and local development.
- Required scopes: `chat:read`, `chat:edit`, `user:read:emotes`.

Client IDs and callback URLs are public configuration. Client secrets and access tokens are not. Do not reuse an upstream client ID merely because it exists in AddCode.js; it is usable only if its owner can register this page's callbacks. Do not change existing TV scopes or device-code login.

Do not derive the TV link from `window.location`: the TV can load from app assets or an alternate origin. Do not accept an arbitrary `redirect_uri` or host from a query parameter. The phone may select only its actual page URL from the configured allowlist. Unknown origins show a configuration error and disable Connect.

Examples of exact callback URLs to register, depending on enabled hosts:

```text
https://yofardev.github.io/SmarterPurpleTV/release/phonechat.html
https://smarttv-client-for-twitch.web.app/phonechat.html
http://localhost:5000/app/PhoneChat/index.html
```

Register only URLs that will actually be used, matching scheme, host, path and case. Check current Twitch rules for localhost before choosing the development URL. A phone cannot reach a development server through the computer's localhost; use a deployed test page or an explicitly configured reachable HTTPS test origin for physical-phone OAuth testing.

## 5. Milestone A — independent mobile page and build

1. Create the shell with a real mobile viewport, title **SPTV Chat**, visible channel identity, account/connection status, message region, composer and emote picker.
2. Put `jsstart`/`jsend` markers around the source scripts, following the existing standalone-page pattern. Keep script ordering explicit.
3. Add separate phone lint/minification to `maker.js`. Lint the combined first-party phone source with its actual dependencies/predefs; do not silence undefined/unused checks globally. Include it in `maker.js jsh` before that branch returns.
4. Build `release/phonechat.html` with the correct bundle and stylesheet paths. The existing HTML rewriting helper handles the two old pages specifically; inspect relative paths instead of assuming it works unchanged for a differently located source page. Source and generated pages must both work.
5. Read CSS from `app/PhoneChat/phonechat.css` and generate its minified output. Do not use a hand-maintained release CSS file as the feature's source.
6. Reuse the IRC parser by explicitly including it in the phone bundle or as a copied build dependency. The mobile bundle must not contain Main_Start or TV code. Preserve vendor license notices when bundling.
7. Keep QR generation entirely local on the TV. Choose a small ES5 library with compatible license, vendor it with attribution, and integrate it with the existing TV concatenation/lint process. Do not fetch QR images from a remote generator or add runtime CDN scripts.
8. Make new build failures visible: inspect minifier errors and do not emit `undefined` output. Ensure any new lint/build failures propagate as failures. Do not undertake an unrelated maker rewrite.

Checkpoint: source page and generated page render correctly from an HTTP server; existing TV and extra-page builds still succeed. Missing Twitch configuration is a visible state, not a crash.

## 6. Milestone B — Twitch account connection

Use the [Twitch browser-only implicit flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/). It is currently documented for client-side apps without a server. Do not implement an authorization-code exchange that embeds a client secret in JavaScript.

Connect flow:

1. Validate channel/configuration before starting login.
2. Generate a cryptographically random OAuth `state` using Web Crypto. If unavailable, report that login cannot safely start; do not substitute Math.random.
3. Save a pending record in sessionStorage: state, channel login, chosen callback URL and creation timestamp. Expire pending records after 10 minutes.
4. Navigate the current tab to Twitch's authorization endpoint with `response_type=token`, configured client ID, exact callback, scopes and state. Use same-tab navigation, avoiding popup dependencies on phones.
5. On return, capture the fragment immediately and remove sensitive callback data from the address bar with history.replaceState before provider/image requests. Parse strictly. An expired/missing/mismatched state rejects the callback and discards returned credentials. Consume the pending record once.
6. Recover the channel from the verified pending record, since the registered callback has no channel query. Restore the clean `?channel=...` URL. Handle denial and malformed callbacks with an actionable message.
7. Validate the token through Twitch `/oauth2/validate`: client ID, authenticated user ID/login, granted scopes, expiration. Do not trust fragment scope claims alone. Use the validated identity for IRC nickname and API requests. Resolve display name through Helix when needed.
8. Store the validated session with expiration in sessionStorage, namespaced for this page/client. Keep active credentials in memory. If storage is unavailable, fail login clearly rather than lose state or loop.
9. Validate a saved session on startup, periodically according to current Twitch requirements, and after a long background interval. Network failures show retry state without immediately destroying a valid saved session; invalid/expired credentials are cleared and disable sending.
10. Disconnect closes chat, cancels reconnects, clears credentials/pending state and updates the UI. Distinguish ending the local session from revoking the app's Twitch authorization; do not imply that signing out also signs out of twitch.tv.

Set a restrictive referrer policy for the phone page. Never log token-bearing OAuth responses, PASS commands, Authorization headers, or storage values. Use a same-origin bundled script approach and safe DOM rendering throughout; sessionStorage does not protect tokens from injected scripts.

Checkpoint: valid login returns to the original channel; denial, tampered state, missing scopes, wrong client ID and expiry are handled. A reload in the same tab restores a valid session. TV login continues to work unchanged.

## 7. Milestone C — live chat transport

Follow [Twitch's IRC protocol](https://dev.twitch.tv/docs/chat/irc/), with existing ChatLive.js as a local reference. Connect to `wss://irc-ws.chat.twitch.tv:443`; authenticate with PASS then NICK, request tags/commands, and join the validated channel. Answer PING with matching PONG. Consume PRIVMSG, ROOMSTATE, USERSTATE, NOTICE, CLEARMSG, CLEARCHAT and RECONNECT.

Implementation requirements:

- Maintain explicit idle/connecting/authenticating/joining/connected/reconnecting/error states. Socket-open alone does not mean the room is joined. Use protocol replies and a bounded join timeout.
- Split WebSocket payloads into IRC lines before parsing. Handle multiple lines per payload, malformed/null parser results and IRC tag escapes. Avoid trimming message bodies and corrupting emote offsets. Keep protocol parsing independently verifiable.
- Use one active socket and one reconnect timer per page. Tag connections with a generation counter so callbacks from closed sockets cannot overwrite current state.
- Back off reconnects at approximately 1, 2, 4, 8, 16 and 30 seconds, with jitter and a cap. Stop automatic retries on invalid auth and intentional disconnect. Pause while offline; resume on network return. Ensure pagehide/pageshow and phone background/resume do not leave duplicate connections.
- Sending is enabled only with validated auth and a joined channel. Validate length against current Twitch limits. Reject CR, LF, NUL and other protocol control injection; normalize multiline paste deliberately. Disable duplicate submissions and respect current send limits/slow mode. Do not send on IME composition Enter.
- Preserve the draft on transport failure. Do not queue/replay messages after reconnect: it risks duplicates and stale comments. After a successful socket submission, clear the composer and add a local echo identified as local/submitted, without claiming server-confirmed delivery. IRC does not provide a general delivery receipt; rejection NOTICEs must remain visible. Deduplicate a matching server echo if one arrives.
- Show room restrictions from ROOMSTATE. Let Twitch enforce followers-only, verified-account and subscription eligibility; do not add unrelated scopes to reimplement those checks. Explain rejection notices instead of silently dropping messages. Third-party emote codes do not automatically satisfy Twitch's emote-only restriction.
- Support received action messages without breaking their emote positions. Sending slash commands/moderation commands is outside scope; give a clear unsupported-command response rather than pretending to execute them.
- Deduplicate received messages by message ID. Bound both message history and ID tracking. Remove/tombstone deleted messages; clear affected users/history for CLEARCHAT using identifiers, not display-name text comparisons. Handle own bans/timeouts visibly.
- A nonexistent channel is caught by the preceding Helix lookup. A quiet chat is an empty state, not automatically a connection failure.

Checkpoint: messages from another device appear on the phone; a manually sent phone message appears in Twitch and on the TV. Network loss, foreground return and server reconnect recover without duplicate messages, timers or sends.

## 8. Milestone D — all four emote providers

Use small adapters with a common record such as:

```text
provider, id, code, scope (global/channel/user), image URL,
optional static URL, dimensions, zero-width flag
```

Keep emote identity separate from code/name. Never let asynchronous response order decide collisions. Use deterministic precedence: Twitch ranges tagged on an incoming message always win; for third-party code collisions, channel beats global, then 7TV > BTTV > FFZ. Document this policy and use the same resolution in rendering and picker insertion.

### Twitch

- Render received Twitch emotes from IRC's emote ID/range tags, including subscriber emotes the viewer cannot use.
- Obtain global emotes and badges through Helix with the phone's user token/client ID.
- Populate usable Twitch picker entries from [Get User Emotes](https://dev.twitch.tv/docs/api/reference/#get-user-emotes), with `user:read:emotes`, user ID matching the token, broadcaster context where applicable, and pagination. Do not assume every emote belonging to the current channel is usable by the viewer.
- Follow API templates and formats when selecting images; provide text fallback on loading failure.
- Test offsets with emoji/non-BMP characters, multiple occurrences, adjacent emotes and action messages. The existing kapchat/punycode code is a reference for Unicode indexing; do not copy unsafe HTML assembly.

### BTTV / FFZ / 7TV

The following endpoints are already used in this repo and are starting points to verify from the phone's browser origin:

| Provider | Global | Channel |
| --- | --- | --- |
| BTTV | `https://api.betterttv.net/3/cached/emotes/global` | `https://api.betterttv.net/3/cached/users/twitch/<broadcaster_id>` |
| FFZ | `https://api.frankerfacez.com/v1/set/global` | `https://api.frankerfacez.com/v1/room/id/<broadcaster_id>` |
| 7TV | `https://7tv.io/v3/emote-sets/global` | `https://7tv.io/v3/users/twitch/<broadcaster_id>` |

Consult current [BTTV docs](https://betterttv.com/developers), [FFZ docs](https://api.frankerfacez.com/docs/), and [7TV source](https://github.com/SevenTV/SevenTV) if endpoint behavior differs. Verify status, response shape, HTTPS image URLs and browser CORS; do not assume the old TV integration proves browser compatibility today.

- BTTV includes both channelEmotes and sharedEmotes.
- FFZ responses require resolving emote sets; global responses identify default sets. Handle protocol-relative image URLs by normalizing to HTTPS.
- 7TV channel responses may have no emote set. Respect channel aliases, image file variants and zero-width metadata. Zero-width emotes overlay the previous emote when applicable; give a safe fallback for orphan overlays. Do not guess flag constants: verify against provider source.
- Load providers independently with bounded timeouts. Empty/404 channel data is normal when a channel has not enabled a provider. An outage cannot disable Twitch chat or the other providers.
- Fetch once per session/channel, cache normalized results, and deduplicate requests. Never fetch per message. Reject late results after account/channel teardown. A manual reload can refresh sets; live provider-event subscriptions are outside V1.
- Render recognizable whole emote tokens, case sensitively, without replacing parts of normal words or URLs. Preserve surrounding text and spacing. Animated formats should work where supplied; respect reduced-motion preference using a static fallback when available.
- Picker has searchable provider sections and channel/global grouping. Selecting an emote inserts its code at the caret with appropriate spacing; preserve the draft/selection and return focus to the composer. Do not eagerly create thousands of image nodes: render only the selected/filtered section in bounded chunks and lazy-load images.
- Third-party emotes are sent as ordinary text codes. Users in clients without those integrations may see the code as text.

Checkpoint: receive and insert emotes from every provider, including a BTTV shared emote, a 7TV channel alias/zero-width overlay, an animated emote, and a Twitch subscription emote available to the logged-in user. Provider errors leave chat usable.

## 9. Milestone E — rendering and phone UX

Preserve SPTV's established identity. Existing TV source documents charcoal surfaces (#0b0a0e, #15121c, #1f1b29), purple accents (#7635fc/#a78bfa), white primary text and muted secondary text. Adapt those values to a compact touch interface. No marketing landing page or new visual identity is needed.

Layout:

- Compact header with channel name and connection status, plus account/connect/disconnect action.
- Scrollable message region occupying remaining space; visible usernames, readable message text, Twitch badges and inline emotes.
- Bottom composer with text input, emote button and Send; remains usable when the software keyboard opens. Use safe-area insets and a dynamic-height approach with appropriate fallbacks. Do not copy the TV's fixed 1920×1080 viewport or disable zoom.
- Compact picker sheet/panel with search, provider tabs, loading/empty/error states and close action. Composer draft survives opening/closing it.
- Autoscroll while near the bottom; preserve reading position when scrolled up. Show a **Jump to latest** affordance. Bound history to roughly 300 messages and preserve scroll position when removing old rows. No unbounded paused buffer.

Safety and accessibility:

- Use textContent/text nodes for channel names, usernames, notices and message text. Build images/links as DOM elements, not raw remote HTML. Do not reuse the legacy chat HTML concatenation pipeline.
- Validate image URLs to HTTPS and the providers' known CDN hosts. Validate user colors rather than assigning arbitrary strings as CSS. Render unusual/malicious input as text.
- Give images useful emote-code alt text and text fallback. Keep long names/messages from causing horizontal overflow.
- Use actual buttons/labels, touch targets around 44px, visible focus, sufficient contrast and polite connection/error announcements. Avoid an always-announcing high-volume chat live region.
- Respect reduced motion; keep animations modest. Test portrait/landscape and widths around 360px/390px/430px.

Required states: missing/invalid channel, nonexistent channel, missing client configuration, signed out, authorizing, authorization denied, connecting/joining, connected but quiet, reconnecting, offline, expired credentials, restricted/rejected sending, provider loading/partial failure, and disconnected. Every error state offers a relevant recovery action.

## 10. Milestone F — TV control and QR dialog

Add `Play_controlsPhoneChat` through the existing control-index allocation in PlayEtc.js; avoid hard-coded numeric positions. Put it near the existing chat-write action, with the normal control labels/icons/focus behavior. Populate all visibility flags consistently. It must work even if TV chat is hidden or the TV user is not logged in, since phone auth is independent.

TV-side helpers should have clear responsibilities, for example `PhoneChat_GetChannel`, `PhoneChat_BuildUrl`, `PhoneChat_Show`, `PhoneChat_Hide`, and `PhoneChat_HandleKeyDown`. Keep them in app/specific/PhoneChat.js and follow existing Main element/event helpers.

Dialog content:

- Title **Chat on phone**.
- Selected primary channel display name/login.
- Instruction **Scan with your phone to read and write chat. Connect your Twitch account on the phone.**
- A sharp black/white QR code and a readable fallback URL.
- One focused **Close** action, with Back/Esc also closing the dialog.
- Short note **After changing streams, scan again.**

Generate the QR from the configured canonical URL plus channel; never include tokens, user credentials or a pairing secret. Render locally with adequate contrast and at least a four-module quiet zone, at a scan-friendly size around 350–450 physical pixels. Avoid interpolation blur. Confirm the encoded URL, not just that something resembling a QR is displayed.

Opening the dialog must hide/cancel normal player-panel auto-dismiss behavior as needed and transfer remote input ownership so arrow/Enter/Back cannot trigger playback beneath it. Playback/audio continue. Closing restores player input and focus to the originating control without duplicate listeners. Ensure the modal remains above the native video using established player-overlay behavior.

Call cleanup on player exit/shutdown, stream replacement, and transition to unsupported playback modes. Cleanup during teardown must not reattach player input after the player has gone away. Treat hide/dispose operations as idempotent; preserve/restore timers and focus only when the player is still active.

Add TV string declarations and English master strings using a consistent prefix (for example STR_PHONE_CHAT_*). Read the actual upstream translation workflow referenced by README before changing language conventions. Verify fallback for languages lacking these strings; if the current mechanism needs untranslated files, follow it rather than adding fake translated text. Phone English copy stays in its small own dictionary.

Checkpoint: the TV QR opens the correct channel on a physical phone; Back/Enter closes cleanly, stream exit cleans up, and ordinary player/chat navigation still works. VOD, clips and multistream do not expose the control.

## 11. Verification and regression checklist

Use focused checks for the new OAuth/protocol/rendering logic; do not introduce a broad testing framework or restructure the app to make it testable. A small Node assertion harness plus browser fixtures is sufficient. Test logic that could silently break or expose credentials, rather than snapshotting implementation details.

Suggested automated checks:

1. Channel normalization and URL construction: valid mixed-case login, invalid characters, missing channel, and no credential fields in QR URLs.
2. OAuth callback validation: success, denied/missing state, mismatch, expired/replayed pending state, wrong client ID/missing scopes, and channel recovery.
3. IRC frame dispatch: multiple CRLF lines, PING, tag unescaping, malformed lines, deletion events and stale-generation callbacks.
4. Outbound validation: control-character injection, empty/too-long messages, disconnected sends and IME handling.
5. Emote fixtures: all providers, missing sets, collisions in different fetch orders, zero-width metadata, Unicode ranges and provider failure isolation.
6. Browser rendering fixture: HTML/script-like text is inert; malformed image URLs are rejected; history and dedup state remain bounded.

Manual verification:

| Area | Required check |
| --- | --- |
| TV | Primary live stream QR, no TV login required, chat hidden, PiP primary channel, modal close/focus, exit/reopen, unsupported modes hidden. |
| Account | Real Twitch login/2FA if enabled, denial, reload, disconnect, expired token, missing configuration, preserved channel after callback. |
| Chat | Receive from another client; manually send from phone and observe on Twitch/TV; slow/restricted chat rejection; message deletion; Unicode; long names. |
| Emotes | Global/channel BTTV/FFZ/7TV, BTTV shared, 7TV alias/overlay, Twitch user emotes, search/insertion, image errors, one provider unavailable. |
| Phone | Chrome Android and Safari iPhone if available; keyboard visibility; orientation; zoom; safe areas; scroll pause/Jump to latest; background/resume. |
| Network | Airplane-mode transition/recovery, no duplicate sockets/timers, no replayed drafts, provider CORS from real deployment origin. |
| Build | Source and built phone pages; correct generated references; TV bundle excludes phone runtime; existing TV login and Extrapage still work. |
| QR | Decode/scan actual generated URL and scan from normal TV viewing distance. |

Use fixture/mock transport for automated checks; automated tests must not send real Twitch messages. Send only intentional manual test messages in a suitable channel. Report checks requiring a real account/device as unverified if unavailable; do not claim success based solely on mocks.

Run from repo root:

```sh
node release/scripts/maker.js jsh
node release/scripts/maker.js
git diff --check
```

Install existing dependencies only if needed. Inspect maker output as well as exit status because the existing script's early return on lint failure may not signal failure correctly. Verify that the phone bundle contains no minifier error placeholders and all generated files exist. Run any focused harness added for this feature.

## 12. Version, hosting and owner setup

Once implementation checks pass, bump `WebTag` by one from the current checked-out value, update WebVersion to the implementation date, add a concise user-facing changelog entry, and regenerate release artifacts. At plan-writing time WebTag was 741; re-read it before editing instead of hard-coding 742. This is a web-only feature: do not bump publishVersionCode, ApkUrl, or apk/versions.gradle.

Commit-ready output includes generated files the repository normally tracks. Do not hand-edit generated output to repair paths; fix source/build and regenerate. Do not commit temporary fixtures with real tokens, private config, or maker temp files.

The owner's external setup is:

1. Register or use an owner-controlled Twitch developer application with the supported client type for this browser flow.
2. Register the exact production and development callback URLs used by the phone page.
3. Supply its public client ID to the source configuration.
4. Publish generated assets through the existing authorized hosting workflow, then verify the new HTTPS route before advertising the TV action broadly.

The checked-in Firebase hosting config uses a named project; do not assume this fork's owner controls it. Prefer the GitHub Pages host already configured in the APK for the initial canonical QR URL. Additional hosts are enabled only when their hosting access and callback registrations are confirmed.

If the client ID/registration or deployment is unavailable, complete implementation/build/mock verification, provide exact setup instructions, and identify live OAuth/QR acceptance as pending. Do not conceal that gap behind a hard-coded upstream credential or a fake success state.

## 13. Definition of done and final handoff

The implementation is ready when:

- The TV action generates a valid QR for the actual primary live channel and cleans up correctly.
- The phone page can authenticate independently and read/send chat through the real Twitch integration when configured.
- Twitch, BTTV, FFZ and 7TV render and are usable through the picker, with graceful provider failures.
- The composer works with mobile keyboards and the feed stays bounded/scrollable.
- OAuth state validation, token expiry, safe text rendering and protocol-injection protections pass focused verification.
- Reconnection never replays messages or creates multiple live connections.
- Full build regenerates the phone page, phone bundle/CSS, TV bundle, and web version artifacts successfully.
- Existing TV playback, chat, login and Extrapage behavior remain intact.
- Setup instructions identify exact client ID/callback/hosting requirements and the actual verification performed.

Return a concise implementation summary with changed source paths, build/verification results, screenshots of the TV dialog and phone states if available, and any external setup still required. Explain material limitations: separate phone login, session lasts within a tab, scan again after changing channels, and no secondary/multistream selection in V1.

Do not call the integration fully verified until actual Twitch login, manual send/receive and physical-phone QR scan have succeeded. A buildable implementation awaiting owner-controlled Twitch registration is a valid handoff, but label that state explicitly.
