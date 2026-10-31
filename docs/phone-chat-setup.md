# Chat on phone — local TV hosting

The Android TV app hosts the phone chat webpage on its own Wi-Fi/Ethernet address.
APK **386** and web build **744** introduce this mode. No public hosting or per-TV
OAuth callback is needed for the phone page.

## Use it

1. Install the APK containing the local server and phone assets.
2. Connect the phone and TV to the same local network. An Ethernet-connected TV
   is supported when the phone's Wi-Fi reaches that network. Guest networks with
   client isolation cannot connect the devices.
3. Play a primary live stream and press **6** on the remote, or choose
   **Chat on phone** in the player controls. Press **6** again or **Back** to close
   the QR. This shortcut is available from web build **745** with APK **386**.
4. Scan the QR. It opens an address like `http://192.168.1.42:8978/chat/`.
5. Select **Connect** on the phone. Authorize in the Twitch tab and return to chat.
   The page also provides the activation link and user code if the browser blocks
   automatic tab opening. Login completes automatically after authorization.

The phone follows changes to the primary live channel without rescanning. When
playback ends, or the TV moves to VOD, clips or multistream, sending stops and the
page waits for a live stream. Each channel gets its own cleared history, emote
catalog, draft and moderation state. The phone's Twitch account remains signed in.
The TV QR control remains limited to primary live and picture-in-picture playback.

If SPTV closes, the phone loses its TV connection. Reopening the QR after a TV
restart or address change creates a new pairing; scan it again. A phone-page
reload and closing/reopening tabs retain login in the same browser at the same
TV address. Access and rotating refresh tokens stay in phone localStorage; sign-out
clears them. Old sessions without a refresh token may need one new sign-in. Clearing
browser data, private browsing, revoked/expired authorization, or changing the TV
IP address can require signing in again. Storage-blocked browsers fall back to a
tab session.

## Chat views (APK 388)

Partner messages have the same subtle purple background as TV chat. **All chat**
shows everyone; **Partners, VIPs & Mods** shows only messages carrying Twitch's
Partner/verified, VIP or moderator badge. Badge artwork does not need to load for
classification to work. Ordinary chat stays bounded by message count; qualifying messages are retained
for twenty minutes independently of ordinary traffic. Switching views preserves
message deletions and timeouts. Your own submitted messages use
Twitch's current USERSTATE badges.

The filtered tab excludes exact, case-insensitive logins `nightbot`,
`streamelements`, `wizebot`, `wisebot`, `moobot` and `fossabot`. Bots remain visible
in All chat. Custom bot names are not detected automatically; extend the exact
login list in `app/PhoneChat/render.js` if needed. System notices remain in All
chat; connection and account warnings continue to appear above both views.

These changes require APK 388 because the local phone page is bundled in the
APK. After updating the TV, scan its QR again and reload the phone page.

## Muting and repeat filtering (APK 395)

Tap another user's underlined name to open **Mute**, or hold their message for
half a second. Desktop right-click also opens the same actions. **Muted (0)**
is always available in the header; open it to see instructions or unmute users.
Muting removes that user's existing and future messages in both tabs on this
phone. The list survives page reloads in the same browser at the same TV address.

Repeat filtering is always enabled. An identical message repeated by the same
user within fifteen seconds is grouped into one row with an **(xN)** counter,
even when other users chat in between. Different messages from that user, expired
windows, and different authors remain separate. This groups repeated text and
emotes; it does not classify all unwanted messages or automatically mute bots.
Moderator deletions and timeouts still remove grouped content.

The phone page is bundled in the **APK**, independently of the downloaded TV
web app. Install APK 395 or newer, then reload the phone page (or scan the TV QR
again) to receive these changes. Updating only the TV web version is insufficient.

## Locked-phone history (APK 390)

Opening the TV QR starts an independent anonymous IRC collector for the primary
live channel, including when TV chat is hidden. The TV retains twenty minutes of
qualifying messages and moderation events in memory. Paired phone polls download
missed events using a cursor; returning from lock/suspension catches up without
relying on background execution on the phone. Collection begins when the QR is
opened, so earlier messages cannot be recovered from Twitch. Keep SPTV running
and connected: app restarts/channel changes clear this history, and network gaps
cannot be reconstructed. History is not uploaded to external storage. All chat
continues to be read directly through the phone's own IRC connection.

## Owner setup: one public Twitch client ID

1. Register an application owned by this project in the
   [Twitch developer console](https://dev.twitch.tv/console).
2. Choose the **Public** client type. Twitch supports
   [Device Code Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow)
   for public clients without a client secret. For the console's required HTTPS
   redirect field, enter
   `https://yofardev.github.io/SmarterTwitchTV/release/phonechat.html` and click
   **Add**. Device authorization does not use this redirect; the phone page stays
   on the TV's LAN address. Do not register every TV's LAN address.
3. Set `PhoneChatConfig.clientId` in `app/general/PhoneChatConfig.js`.
4. Run `node release/scripts/maker.js`, then build the APK so its bundled phone
   configuration includes that ID. Deploy the regenerated web app for TV controls.

Required scopes remain `chat:read chat:edit user:read:emotes`. The owner's public
client ID is configured, and Twitch's device endpoint accepts it and these scopes.
Real account authorization and live chat still require the device checks below.
Do not reuse a client ID owned by upstream and never embed a client secret. If the
public ID is removed, the local page and TV channel following still work, but
sign-in shows a configuration message.

The optional hosted page remains available for browser development. It also uses
Device Code Flow by default. Legacy implicit callbacks are retained for existing
callback links/tests; a Public client cannot initiate implicit authorization.

## Data and lifecycle

- The QR contains a random 256-bit pairing capability in its URL fragment. The
  phone scrubs the fragment and retains the capability in phone browser storage.
- Pairing authorizes only the current public channel state. No TV Twitch token,
  password, phone OAuth token, debug log, or arbitrary file is served.
- The server binds to a private IPv4 address on Wi-Fi/Ethernet, port **8978**. It
  starts when the QR is first opened and closes on Android activity destruction.
  No router port forwarding is needed. IPv6-only networks aren't supported yet.
- The phone polls `/chat/state` every two seconds with `X-SPTV-Pairing`. The APK
  receives the TV's current channel through `SetPhoneChatChannel`; a ten-second
  missing heartbeat makes the channel inactive. A stopped publisher cannot leave
  sending enabled indefinitely.
- Only the exact page/JS/CSS routes and authenticated read-only state are exposed.
  Foreign Host/Origin requests, traversal, writes and invalid pairing are rejected.
  Requests have size/time limits and a bounded worker pool. One bad client does
  not stop the listener. Pairing rotates after a restart or address change.
- Local page/state delivery uses HTTP on the trusted home network. Twitch device
  authorization, validation, APIs, IRC and emote-provider requests go directly
  from the phone to HTTPS/WSS services. Twitch credentials never cross the LAN
  connection to the TV. The phone page isn't an offline Twitch service.
- Phone login remains separate from TV login. Tokens stay in phone memory and
  phone browser storage and are validated against client ID, identity and scopes.

## Build and verify

```sh
node release/scripts/maker.js jsh
node release/scripts/maker.js
node release/scripts/phonechat-tests.js
node release/scripts/phonechat-tests.js --built
node release/scripts/phonechat-server-tests.js
```

Optional browser regressions require Playwright and an installed Chrome browser:

```sh
node release/scripts/phonechat-browser-tests.js
node release/scripts/phonechat-browser-tests.js --source
node release/scripts/phonechat-browser-tests.js --android
```

The Android check uses a running emulator with Chrome. Set
`SPTV_PLAYWRIGHT_PATH` to reuse an existing Playwright installation and
`SPTV_ANDROID_SERIAL` to select a test emulator. The harness boots the real source
page or generated phone bundle with mocked Twitch requests and IRC events; it
never signs into Twitch or sends real messages. It checks tap/keyboard actions,
long-press and scroll gestures, muting across tabs and reloads, repeat filtering,
moderator deletion of a grouped message, and narrow-screen layout.

The Node maker generates `release/phonechat-assets/phonechat/{index.html,
PhoneChat.js,phonechat.min.css}`. Gradle includes that directory as an asset source
and checks all three files before building. Do not hand-edit generated assets.
The local APK's phone bundle is updated by rebuilding the APK; TV web controls
continue to ship through the existing hosted web app. Asset-mode TV development
(`up_assets`) does not remove this separate Gradle asset source.

The Java integration checks require JDK 17+ and Android SDK platform 35; set
`JAVA_HOME` and `ANDROID_HOME` if necessary. They exercise the production server
on loopback with the generated assets, without an Android device or Twitch token.
Use a JDK supported by the repository's Gradle version for the APK build.

## Verification limits

Automated checks cover existing chat behavior plus local pairing, following
streams during/after authorization, unavailable TVs, playback exit, revoked
pairing, canceled authorization, malformed activation URLs, and native HTTP
routing/lifecycle. Twitch device/token CORS preflight permits local HTTP origins.

A physical TV/phone check still needs to verify QR scanning, the router's device
connectivity, mobile browser tab/background handling, actual Twitch authorization
and sending, and live Twitch/BTTV/FFZ/7TV emotes. Tests use mock OAuth responses;
they do not substitute for those account/device checks.
