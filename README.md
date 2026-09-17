# Smarter Purple TV

A Twitch client for Android TV. This is a fork of [SmartTwitchTV](https://github.com/fgl27/SmartTwitchTV) by Felipe de Leon — same app you know, slowly getting a mind of its own.

Same two-part architecture as upstream — a web app (UI and most features) loaded by an Android APK (players and platform glue) — same features, same remote-friendly navigation. The differences are listed below.

## What's different from SmartTwitchTV

- **Ad blocking, no proxy needed.** Ads stitched into live streams are removed directly from the playback playlists, using only Twitch's own servers. During a blocked ad the stream pauses briefly and resumes where the ad ends. On by default, can be turned off in Settings → Player → Block ads. (Requires an APK built from this fork.)
- **A new default look.** Purple accent throughout: focused items get a purple outline and glow, the Following hearts are purple, and so are the loading spinners. Same dark base, own identity.

## Everything else

Build instructions, translations, troubleshooting and the full story of the app live in the [upstream README](https://github.com/fgl27/SmartTwitchTV#readme). To build this fork, follow the same steps against this repository.

## Credits and license

SmartTwitchTV is © 2017–present Felipe de Leon, its contributors, and this fork's contributors. Licensed under the [GPL-3.0](LICENSE), as is everything derived from it.
