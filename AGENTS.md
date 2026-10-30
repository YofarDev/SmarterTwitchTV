# AGENTS.md

Twitch client for Android TV / Smart TVs. This is YofarDev's fork of fgl27/SmartTwitchTV; the user-facing app name is **Smarter Purple TV** (short: SPTV), while the repo keeps the name SmarterTwitchTV. Two cooperating parts in one repo: a vanilla JS/HTML/CSS **web app** (the whole UI and most logic) and a Java **Android APK** (WebView host + native players). The built web app is deployed to GitHub Pages and downloaded by the APK at startup, so web changes ship without a new APK.

## Directory map

- `app/` — web app **source** (edit here, never `release/`)
  - `app/specific/` — screens, players, chat, settings, `OSInterface.js` (web→APK bridge)
  - `app/general/` — utilities, `version.js` (version/changelog source of truth)
  - `app/languages/` — translations; `en_US.js` is the master, `0_Strings.js` loads them
  - `app/thirdparty/` — vendored libs (twemoji, punycode, irc-message…)
  - `app/Extrapage/` — separate page (OAuth etc.), built independently
- `apk/` — Android Studio project (`com.fgl27.twitch`), Java, minSdk 21 / target 35
- `release/` — **generated** output committed to the repo and served to devices
  - `release/githubio/` — minified JS/HTML/CSS + `version/version.json` (update check)
  - `release/api.js` — wrapper whose markers (`APISPLITSTART`/`APIMID`/`APISPLITCENTER`/`APIEND`) wrap the concatenated app code into the global `smartTwitchTV` API
  - `release/scripts/` — build scripts (`maker.js` is the current Node one; the `.sh` scripts are the older/global-tool variants)
- `jsonreferences/` — sample Twitch API responses for reference (see `how_to_get_jsons.txt`)

## Build / check commands (run from repo root)

```bash
npm install                        # dev deps: jshint, uglify-js, prettier, html-minifier, crass, shelljs
node release/scripts/maker.js jsh  # lint only — JSHint over all app JS (fast pre-check)
node release/scripts/maker.js      # full build: lint, minify JS/HTML/CSS into release/, regenerate version.json + apk/Changelog_Up.md
```

Focused fixture harnesses (not complete end-to-end coverage):

```bash
node release/scripts/phonechat-tests.js          # phone logic and mock DOM; add --built for generated bundle
node release/scripts/update-tests.js
node release/scripts/phonechat-collector-tests.js
node release/scripts/chat-badge-tests.js        # badge HTTP contracts/cache and playback recovery; add --built for generated definitions
node release/scripts/chat-optimization-tests.js # TV scheduler/cache with fake clock
node release/scripts/grid-window-tests.js        # browse grid row window; add --built for generated bundle
node release/scripts/ad-filter-tests.js          # ad playlist filter (JDK 8+) and web ad probe chain
node release/scripts/request-dispatcher-tests.js # production dispatcher, JDK 8+ (--release 8)
node release/scripts/phonechat-server-tests.js   # local server integration, JDK 17+ and Android SDK 35
```

Device and browser verification is also required (below). After a full build, commit the regenerated `release/` files (history shows commits like "up main files").

### Manual testing

- Browser: open `app/index.html` in Chrome (closest to the TV WebView), or `release/scripts/http-server.sh` then `https://127.0.0.1:5000/app/` for login/auth flows. Navigate with arrow keys / Enter / Esc to simulate the TV remote.
- Real device: `release/scripts/up_assets.sh` copies `app/` into `apk/app/src/main/assets/` and sets `LoadFromAssets = true` in `apk/.../Constants.java` (run with arg `1` to revert/clean), then build the APK.

### APK build

Requires Android Studio with the `apk/` folder open **and** a clone of https://github.com/fgl27/media as a sibling `media/` folder (custom AndroidX Media3 — see `apk/Media3 changes.md`). Firebase / Crashlytics / google-services were removed from the build (Web 768), so a plain build works with no private keys. Debug builds use applicationId suffix `.debug`.

## Architecture: web ↔ APK bridge

- Web → APK: every function in `app/specific/OSInterface.js` mirrors a Java method annotated `@JavascriptInterface` in `WebAppInterface` inside `apk/app/src/main/java/com/fgl27/twitch/PlayerActivity.java`. Adding a bridge call means touching **both** sides.
- APK → web: `WebView.loadUrl("javascript:smartTwitchTV.FUN_NAME()")` — the function must be exposed by `release/api.js`.
- Update flow: devices fetch `release/githubio/version/version.json` (written by the build from `app/general/version.js`) and compare against APK constants to announce "web update available".

## Critical rules

- **Never hand-edit `release/` output** — regenerate with `node release/scripts/maker.js` or your changes will be overwritten and devices won't get them.
- Keep the `<!-- jsstart ... jsend-->` markers in `app/index.html` and `app/Extrapage/index.html`; the build replaces that block with the single `<script src="githubio/js/main.js">` tag.
- All `app/` JS is concatenated (in order: languages, general, specific, thirdparty) into one global scope wrapped by `release/api.js` — no modules/imports; globals like `Android`, `smartTwitchTV`, `Twitch` are expected (predefined in JSHint). Load order between files matters.
- Target old TV WebViews: avoid modern JS syntax; the minifier is configured to not introduce arrow functions for this reason. JSHint enforces `===`, no unused/undefined vars.
- Version bumps (see comments in `app/general/version.js`):
  - APK release: `+1` on `publishVersionCode` (both `app/general/version.js` and `apk/versions.gradle`), update `ApkUrl`, add a `changelog` entry, and mirror the entry in `apk/Changelog.md`.
  - Web-only change: `+1` on `WebTag`, update `WebVersion` date, add changelog entry, run the full build so `version.json` updates.

## Style

- Prettier via `.prettierrc`: 4-space indent, width 150, single quotes, no trailing commas, no bracket spacing, `arrowParens: avoid`. Format on save is configured in `.vscode/`.
- Java: formatted with the prettier-plugin-java VS Code extension.

## Read before touching sensitive areas

- `README.md` — full architecture, build, test, translation workflow
- `apk/Media3 changes.md` — local modifications to the player library
- `release/scripts/HELP.md` — dev environment setup
- Translation rules (untranslated_*.txt convention) in `README.md` before editing `app/languages/`
