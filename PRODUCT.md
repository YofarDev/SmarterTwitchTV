# Smarter Purple TV

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

A Twitch client for Android TV and Smart TVs. The primary experience should help viewers quickly open followed channels that are live.

## Users and Operating Context

Viewers use a television from a distance, primarily with a directional remote, OK, and Back. The UI is a web app hosted by an Android WebView, with native playback supplied by the APK. Browser keyboard navigation supports development and verification.

## Capabilities and Constraints

- Preserve all existing capabilities while making advanced controls less prominent. This is the user's confirmed redesign boundary.
- Existing capabilities include live streams, categories, videos, clips, follows, history, accounts, chat, phone chat, picture-in-picture, multistream, and detailed playback/interface settings.
- Retain old TV WebView compatibility, translations, native player integration, and the web/APK bridge.
- App JavaScript shares a global scope. Source lives in `app/`; generated release assets are rebuilt, never edited by hand.
- Layout changes must account for native preview/player positioning and remote focus calculations. Existing source warns against scaling focused elements because these systems measure their bounds.
- The navigation, home, and player redesign has been integrated into the app and ships in web releases. Future design work refines the integrated redesign rather than proposing a new one (inferred from repo history: commits `3bf2d4fd8`, `e12bb2037`, and web 794–796; the question round to confirm this went unanswered).

## Brand Commitments

The user-facing name is Smarter Purple TV, abbreviated SPTV. The repository remains SmarterTwitchTV. The user wants the fork to feel more like their own app, simpler, more premium, and more modern. The existing purple theme is context; a replacement palette, typeface, and logo have not been approved.

## Product Principles

1. Put followed live channels at the start of the experience.
2. Keep everyday actions easy to find and advanced capabilities accessible through explicit controls.
3. Make navigation predictable with a basic TV remote.
4. Preserve capabilities and user preferences through the redesign.

## Evidence on Hand

`README.md`, `app/index.html`, `app/specific/Main.js`, `app/specific/Sidepannel.js`, `app/specific/ScreensObj.js`, `app/specific/PlayEtc.js`, `app/specific/Settings.js`, and `app/languages/en_US.js` describe the current product and implementation. Repository screenshots are historical, not verification of the current UI.

## Open Decisions

The visual identity, exact layouts, and any changes to existing remote shortcuts remain proposed until reviewed. No build workflow preference has been selected.
