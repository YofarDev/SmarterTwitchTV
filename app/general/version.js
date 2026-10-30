/*
 * Copyright (c) 2017-∞ Felipe de Leon <fglfgl27@gmail.com>
 *
 * This file is part of SmartTwitchTV <https://github.com/fgl27/SmartTwitchTV>
 *
 * SmartTwitchTV is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SmartTwitchTV is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartTwitchTV.  If not, see <https://github.com/fgl27/SmartTwitchTV/blob/master/LICENSE>.
 *
 */

//Spacing for release maker not trow errors from jshint
var version = {
    VersionBase: '3.0',
    publishVersionCode: 394, //Always update (+1 to current value) Main_version_java after update publishVersionCode or a major update of the apk is released
    ApkUrl: 'https://github.com/YofarDev/SmarterTwitchTV/releases/download/394/SmarterPurpleTV_3_0_394.apk',
    WebVersion: 'October 30 2026',
    WebTag: 772, //Always update (+1 to current value) Main_version_web after update Main_minversion or a major update of the web part of the app
    changelog: [
        {
            title: 'October 30 2026 (Web 772)',
            changes: [
                'Fix: opening or recovering a stream could stay on a black screen with a loading spinner after a duplicate badge request corrupted the chat badge cache; badges now use the correct request callback and incomplete caches recover safely',
                'Fix: missing or invalid chat badges no longer poison future stream loads, and a chat initialization failure no longer prevents video playback from starting'
            ]
        },
        {
            title: 'October 29 2026 (Web 771)',
            changes: [
                'Fix: when a stream reload fails mid ad break (the stream is declared offline while the old playback is still running), the app could end up on a black screen with the video playing in a small window and audio that never stops — the still-playing player is now stopped when the session ends instead of only clearing the empty picture-in-picture slot',
                'Fix: an ad escape or quality restore reload that completes after the stream-end dialog is already up no longer restarts the player behind the dialog with no session left to control it'
            ]
        },
        {
            title: 'October 27 2026 (Web 770)',
            changes: [
                'Fix: Web 768 and 769 never started — the app stayed on a black screen with a loading spinner after the splash, because the web API still exported a removed analytics function; the stale export is gone'
            ]
        },
        {
            title: 'October 26 2026 (Web 769)',
            changes: [
                'Fix: with "restore playback" on, the app could come back from a restart with the full-screen loading dialog still in the page behind the player — opening a stream, VOD or clip now clears any pending loading dialog as the player takes over',
                'Fix: the stream-end screen prepared the player controls dialog check without running it, so every stream end force-closed a dialog that was never open (and re-registered an empty key listener); the check now actually runs',
                'Hints: the top legend reads "Hold OK for thumbnail options" instead of "Hold left", matching the gesture the cards actually use',
                'Copy: the browser player setting summary now reads "Set to No to hide the browser Twitch player and see the Android player layout instead…", and viewer counts read "42,025 viewers" in lowercase everywhere, matching the player info line'
            ]
        },
        {
            title: 'October 26 2026 (Web 768)',
            changes: [
                'Privacy: removed Firebase / Google Analytics from the app — it no longer loads any analytics scripts or sends usage events'
            ]
        },
        {
            title: 'October 26 2026 (Web 767)',
            changes: [
                'Phone chat: the message box no longer hides behind the on-screen keyboard — the page follows the visible area when the keyboard opens (and the browser chrome moves), keeps the newest message in view if you were reading the tail, and long-press sheets stay inside the visible area'
            ]
        },
        {
            title: 'October 26 2026 (Web 766)',
            changes: [
                'Player: More › Channel / content no longer shows "undefined" under Channel content and Game content — the drawer kept overwriting the labels the player had already filled in',
                'Fix: a screen whose refresh was interrupted (for example by closing a stream during startup) could stay behind the loading dialog forever; it now reloads instead of waiting for a request that is gone',
                'Hints: the remote legend at the bottom of browsing screens keeps its key groups apart again and is a step larger — it used to run together into one sentence; it now also says "Hold OK · Options", which is the gesture the cards actually use',
                'Search: a query with no results says "No search results found" instead of claiming a connection failure, and the empty banner no longer shows the upstream app name',
                'Interface: Settings rows, the card options dialog, search type buttons and dialog buttons now use the same outline focus as the rest of the app instead of the old purple banner; the search box shows the outline while you type',
                'Readability: secondary text (settings descriptions, metadata, placeholders) is brighter and now passes the accessibility contrast threshold on every surface',
                'Accessibility: when the device asks for reduced motion the grid, rail and chat slide animations are turned off (the loading spinner stays); the in-app animation setting keeps working as before',
                'Account: the follow-related rows read "Sign in" and "Sign in to follow or unfollow channels" instead of "No user, Can\'t follow or unfollow"; settings submenus show a › chevron instead of "Press enter to access"',
                'Links: the About dialog project and releases links point at this fork (github.com/YofarDev/SmarterTwitchTV)'
            ]
        },
        {
            title: 'October 25 2026 (Web 765 / APK 394)',
            changes: [
                'Phone chat: fix muting on iPhone — long-pressing a message now opens the mute sheet on iOS browsers, which never report a long-press as a context menu (Android and desktop right-click are unchanged)',
                'Contact: the app email in the About and first-run welcome dialogs is now yofardev@gmail.com',
                'Fix: the browser/source build loads the raid module again — closing a restored stream during browser testing no longer freezes the app on a dead screen (TV playback was never affected)'
            ]
        },
        {
            title: 'October 24 2026 (Web 764)',
            changes: [
                'Chat: the same message repeated by the same user in a row now merges into one line with a growing "(xN)" counter — link and emoji spam floods no longer bury the chat (works in the TV chat and on the phone chat page)',
                'Chat: fix the merge — a repeat no longer disappears when its line already scrolled out of the chat window, and the merge never carries over from the previous channel',
                'Chat: performance pass for very busy chats — the line entry animation turns itself off during message floods, the chat delay delivers big bursts in small batches instead of one long freeze, and switching the multi view chat no longer re-parses every line',
                'Chat: non-Latin text (Cyrillic, Greek, CJK, Arabic…) renders faster — plain words skip the emoji scan entirely'
            ]
        },
        {
            title: 'October 24 2026 (Web 763 / APK 393)',
            changes: [
                'Ad blocking: ad breaks that can no longer be hidden now freeze the picture on the last live frame until the break is over, instead of playing the ad — some breaks are stitched into every fresh stream session and simply cannot be escaped',
                'Ad blocking: the escape reloads rotate the fallback stream types much faster (15 seconds instead of 60), so every type is tried within a single ad break',
                'Ad blocking: the pre-playback ad probe now checks every stream quality instead of only the first and last — ads stitched into a single quality can no longer slip into playback'
            ]
        },
        {
            title: 'October 23 2026 (Web 762 / APK 392)',
            changes: [
                'Memory: VOD seek preview images are released when the player closes instead of staying in memory until the next VOD',
                'Memory: game screen and live feed backups are now capped at the last 5 games instead of growing with every game visited',
                'Storage: history saves recover from storage quota errors by trimming old entries; block/unblock leftovers are trimmed on load; the stream playlist is no longer saved to storage',
                'Fix: the phone chat background sync keeps running after the player closes; it now stops cleanly',
                'Fix: scrolling the side panel could cancel a pending watch history save — it now cancels the right timer',
                'Fix: the channel context was never restored when returning to a channel\'s videos/clips after a search; multi view rewrote the game line on every refresh and could stack-overflow cycling empty slots; number key 2 jumped the clip while the feed preview was open',
                'Performance: moving focus back and forth no longer re-requests the same stream info within 15 seconds; multi view stops rewriting unchanged text and audio icons; the player options drawers stop rebuilding their button bar on every key press and multi view main-window switching no longer re-copies and re-parses the stream playlist on each left/right',
                'APK: fix leaks on player restart (activity held by the ad reload listener, handler threads and pending handlers never released, WebViews never destroyed)',
                'APK: fix the first notification run saving an empty live list which caused a burst of "went live" toasts on the next check; avatars past the first 100 follows never loaded',
                'APK: notification logos are downsampled before decode, downloaded once with timeouts, and cached; TV channel thumbnails no longer carry a cache buster that forced a re-download every sync; user switch no longer blocks the app bridge for seconds'
            ]
        },
        {
            title: 'October 23 2026 (Web 761)',
            changes: [
                'Phone chat: long-press a message to mute its author — messages from muted users are hidden on the phone and the list is remembered between visits; manage it with the Muted button in the header (bots not yet in the built-in list can be muted the same way)'
            ]
        },
        {
            title: 'October 23 2026 (Web 760)',
            changes: [
                'Fix: follow raids never activated — a settings check compared against the wrong value so the raid listener was silently off for everyone; it now runs as intended (the setting and login requirement are unchanged)'
            ]
        },
        {
            title: 'October 23 2026 (Web 759)',
            changes: [
                'Performance: the cache buster on thumbnails now changes every 5 minutes instead of every minute, so scrolling and screen refreshes reuse cached previews instead of re-downloading them every time — less bandwidth and smoother browsing on slower TVs'
            ]
        },
        {
            title: 'October 22 2026 (Web 758)',
            changes: [
                'Browsing: hold Up to refresh the current screen — same as key 2; handy because a screen you stay on never refreshes on its own, only the ones in the background do'
            ]
        },
        {
            title: 'October 19 2026 (Web 757)',
            changes: [
                'Performance: chat messages and titles made only of plain text skip the emoji scan, busier chats render with less work — the biggest gain is on older TVs'
            ]
        },
        {
            title: 'October 19 2026 (Web 756)',
            changes: [
                'Player: raids are followed automatically — when the watched streamer raids, the player switches to the raided channel; disable under Settings › End dialog options › Follow raids (requires login)'
            ]
        },
        {
            title: 'October 19 2026 (Web 755)',
            changes: [
                'Chat: deleted messages can stay on screen greyed out instead of being replaced, via the chat clear option Keep greyed out (now the default)',
                'Browse grid: Left and Right move straight to the previous or next card, hold OK to open the card options',
                'Navigation rail: the expanded rail now covers the page title instead of showing through it'
            ]
        },
        {
            title: 'October 19 2026 (Web 754)',
            changes: [
                'Browsing: going back up a grid keeps the focused card on screen, including near the end of a list and on short lists such as followed live channels',
                'Browsing: OK opens the focused stream as soon as it is pressed; holding it no longer refreshes the screen (use Refresh or key 2)'
            ]
        },
        {
            title: 'October 19 2026 (Web 753)',
            changes: [
                'Player: OK that reveals the controls no longer pauses the stream; the next OK toggles play/pause',
                'Player: the technical stats overlay is hidden by default; turn it back on under More › Diagnostics',
                'Player: one look for the player — one-line title, a Game · Live for · Viewers · Watching info line, icon bar buttons, the timeline inside the bar and a Paused chip when the bar hides',
                'Player: Quality is now a list of renditions with the playing one checked; picking it no longer restarts the stream',
                'Player: drawer rows lost their duplicate labels and leftover wording, and the value arrows are bigger and point where Left/Right actually act',
                'Player: while a drawer is open the bar button that opened it stays marked, groups opened from More show a More › title, and long drawers get scroll fades',
                'Player: channel switcher focus is a clean outline with a tab underline instead of the glow'
            ]
        },
        {
            title: 'October 16 2026 (Web 752)',
            changes: [
                'Remote: the highlighted control, DOM focus and key recipient now agree after closing the rail, tabs, menus and the player controls',
                'Remote: every channel, video, clip and category card has a visible Actions button opening its options; watching stays a single OK press',
                'Search: queries and result types are kept when going Back from results, so correcting a search only edits the changed characters',
                'Recovery: auth, empty and error states offer the action that matches the cause, with a secondary browse option',
                'Settings: optional Direct browsing controls move on each press and watch on an immediate OK; Legacy hold shortcuts stay the default',
                'Hints: footers describe the focused target and player drawers show Left/Right value arrows',
                'Updates: the update dialog never opens by itself; the rail Updates entry shows a badge when an update is available'
            ]
        },
        {
            title: 'October 16 2026 (Web 751)',
            changes: [
                'TV interface: Following home, stable navigation rail, browsing tabs and focused channel details',
                'Player: compact controls and named drawers for chat, quality, layout, audio and playback options',
                'Navigation: preserve channel focus during refresh and ignore stale account and preview responses'
            ]
        },
        {
            title: 'October 16 2026 (APK 391)',
            changes: [
                'TV chat: use one delay timer per chat and retain at most twenty inactive channel caches while keeping current shared channels available',
                'TV chat: message animation now fades and slides into its final height',
                'Phone chat: batch history maintenance and scrolling while preserving moderation and twenty-minute priority history',
                'Android: bound waiting network requests and prevent stale responses or APK installer callbacks after activity destruction'
            ]
        },
        {
            title: 'October 11 2026 (APK 390)',
            changes: [
                'Phone chat: remember Twitch login across tabs and refresh expired device-flow credentials automatically',
                'Phone chat: retain twenty minutes of Partner, VIP and moderator messages independently of ordinary chat traffic',
                'TV chat history: after opening the pairing QR, the TV anonymously collects filtered messages while the phone is locked and sends missed messages and moderation events when it returns',
                'History is local to the current live channel and resets when the channel changes or the TV app restarts'
            ]
        },
        {
            title: 'October 10 2026 (APK 389)',
            changes: [
                'App updates: fixed GitHub APK installation being rejected by Android because the install permission was missing',
                'App updates: open the install permission settings when needed, clear loading after download failure or installer handoff, and prevent duplicate downloads',
                'Update checks: clear outdated update warnings when the installed app is current; add a loading timeout for older APKs'
            ]
        },
        {
            title: 'October 10 2026 (APK 388)',
            changes: [
                'Phone chat: Twitch Partner messages now have the same subtle purple background as TV chat',
                'Phone chat: switch between All chat and Partners, VIPs & Mods; the filtered tab excludes known bot accounts',
                'Note: update to APK 388 for these improvements to the phone page hosted on your TV'
            ]
        },
        {
            title: 'October 10 2026 (APK 387)',
            changes: [
                'Debug logs: when the capture buffer fills, the downloaded logs now retain the newest messages instead of discarding them in favor of older rotated logs'
            ]
        },
        {
            title: 'October 10 2026',
            changes: [
                'Chat on phone: press 6 on the remote during a live stream to show the pairing QR, then press 6 again or Back to hide it; no new APK is needed if APK 386 is installed'
            ]
        },
        {
            title: 'October 10 2026 (APK 386)',
            changes: [
                'Chat on phone: the TV now hosts the phone webpage over your local network; scan its QR while on the same Wi-Fi and the phone follows live stream changes automatically',
                'Phone chat: sign in to Twitch independently on your phone using device authorization; no callback registration is needed for each TV address',
                'App updates: the update checker now checks Smarter Purple TV releases from this fork',
                'Note: local phone hosting requires APK 386 or newer; the phone page is bundled in the APK and does not need public web hosting'
            ]
        },
        {
            title: 'October 9 2026',
            changes: [
                'TV chat: messages from users with the Twitch verified (Partner) badge now receive a subtle purple background in live and replay chat, including when badge icons are hidden; controlled by the existing verified-user highlight setting'
            ]
        },
        {
            title: 'October 9 2026',
            changes: [
                'New: "Chat on phone" — while watching a live stream open the player controls, select "Chat on phone" and scan the QR code with your phone to read and write that channel chat from a phone friendly page, with Twitch, BTTV, FFZ and 7TV emotes and an emote picker; the phone signs in to Twitch independently from the TV and video keeps playing on the TV',
                'Phone chat: reconnecting or returning to the page preserves message history and deletions, and keeps timeout or ban explanations visible while sending is blocked',
                'Note: the phone chat page needs the app owner to register a Twitch application client ID before sign-in works (see docs/phone-chat-setup.md), until then the phone page shows a clear "not configured" message'
            ]
        },
        {
            title: 'September 22 2026',
            changes: [
                'New look: the side panel was redone — the black separator lines between items are gone (they also showed on the collapsed icon rail), the rail and the open panel are now one uniform elevated charcoal surface, and the purple highlight of the active item blends into it cleanly',
                'Removed the patchy pure black blocks the rail was made of (including a stray black sliver at its bottom corner)'
            ]
        },
        {
            title: 'September 22 2026',
            changes: [
                'Polish: the search and password inputs now follow the new design — dark charcoal field with white text, subtle hairline edge and readable muted placeholder, matching the buttons below them (they were still the old light gray pills)',
                'Polish: the chat message input follows the same treatment, with a purple edge when active and a red edge when sending is blocked, and its focus no longer causes a small size jump'
            ]
        },
        {
            title: 'September 22 2026',
            changes: [
                'Performance: the side panel live feed no longer re-downloads every channel thumbnail each time the panel opens or a new page of the feed loads, each image is now preloaded only once per feed load',
                'Performance: paging through a live game feed no longer re-clones the whole feed backup on every page load, a slowdown that grew the further you scrolled',
                'Performance: chat no longer builds up an ever growing message buffer while it is paused, and VOD seek preview thumbnails now load gradually instead of all at once so they don’t compete with the video stream startup for bandwidth',
                'Performance: removed a background layout recalculation that ran while VOD thumbnails animate, and a class scan of the whole side panel feed on every key press'
            ]
        },
        {
            title: 'September 22 2026',
            changes: [
                'New look: full visual refresh with a layered charcoal design — soft violet-tinted surfaces instead of flat black, rounded corners on cards, thumbnails, dialogs and inputs, refined text hierarchy (bold names, muted titles and metadata), and a stronger layered purple focus glow on the focused item',
                'New look: the side navigation, settings rows, dialogs, player overlays, progress bar and chat share the same new design language; the focus color styles and all themes still work as before',
                'General: Roboto Black is now used for screen titles and the clock, giving a heavier headline hierarchy (font was already bundled)'
            ]
        },
        {
            title: 'September 22 2026',
            changes: [
                'Player: Sub only VODs now play for users subbed to the channel: when a sub only VOD is detected the playback token is requested again with the user own authorization token, so Twitch serves the playlist to entitled users; users without a sub keep getting the clear sub only warning (this replaces a status check done against the long retired Twitch v5 API that never led to playback)',
                'General: removed dead code left by the retired v5 API sub check'
            ]
        },
        {
            title: 'September 21 2026',
            changes: [
                'Player: During an ad break the escape reload now rotates the player type each round (instead of retrying the same one when the ad check misses), and stops reloading for a few minutes once every type served ads so the break plays out calmly',
                'Player: The running web version is now written to the device debug log, and the ad escape decisions are logged too (helps diagnosing ad blocking behavior)',
                'Player: Improved the ad escape during streams: the ad check now covers both ends of the stream playlists, and when no full quality ad free stream exists it falls back to a low quality ad free one and restores the quality once the ad break is over',
                'Debug logs: the on device log capture now keeps around 8mb of history (it was filling up in a couple of minutes), no visible change otherwise',
                'Player: Midroll ads that the playlist filter cannot hide (longer than the playback buffer) now trigger a quick stream reload with a fresh playback token instead of buffering until the ad plays; ads still cannot be skipped when every token serves them, but playback no longer stalls into them',
                'Player: Fixed ad blocking against the current ad playlist format, ads are recognized again (they now carry a different marker and title format) and a blocked ad no longer ends with a player error',
                'Player: streams that are serving a preroll now start with an ad free playback token when one is available (tried before playback starts, never mid stream)',
                'Note: the ad blocking runs on the app (APK) side of the application, it only takes effect after updating to a newly built app version'
            ]
        },
        {
            title: 'September 21 2026',
            changes: [
                'Player: Reverted the 3.0.381 ad blocking changes, during ad breaks they could make the stream glitch, loop the last seconds and end with a player error. Ad blocking works like 3.0.380 again: ads stitched into the playlist are removed and the stream pauses briefly during a blocked ad',
                'New "Debug logs" option (Settings → Player, on by default): the app saves its own logs and serves them over the local network so they can be read from a computer on the same network to help diagnose issues. Only this app own logs are exposed, only inside your network',
                'Note: both changes run on the app (APK) side of the application, it only takes effect after updating to a newly built app version'
            ]
        },
        {
            title: 'September 20 2026',
            changes: [
                'Player: Ad blocking upgrade, an adaptation of the desktop twitchadsolutions (vaft) technique: when an ad is detected the player switches on the fly to an ad free copy of the same stream (requested with an alternate player token), so playback continues during blocked ads instead of pausing',
                'Player: Ad detection now also catches ads that carry no marker in the playlist, and the stream token is requested with the "popout" player type which gets less ads stitched in',
                'Fixed the app icon shown on the Android TV home screen, it now matches the splash screen one',
                'Note: the ad blocking runs on the app (APK) side of the application, it only takes effect after updating to a newly built app version'
            ]
        },
        {
            title: 'September 17 2026',
            changes: [
                'Player: Added a new ad blocking option, ads stitched into the stream are removed directly from the playback playlists using only Twitch servers, no proxy involved. During a blocked ad the stream pauses briefly and resumes where the ad ends. The option can be disabled in Settings',
                'New default look: focused items are highlighted with a purple outline and glow, and the Following hearts are purple',
                'The application is now named Smarter Purple TV',
                'New application icon',
                'Chat: messages from verified users are highlighted with a purple background, option available in the chat settings',
                'Note: the ad blocking runs on the app (APK) side of the application, it only takes effect after updating to a newly built app version'
            ]
        },
        {
            title: 'March 17 2026',
            changes: [
                "Allow devices running android 7.0 and older to run the app again (5.0 and up only), GitHub update they encryption done on the application page, the new encryption wasn't supported by old devices."
            ]
        },
        {
            title: 'January 27 2026',
            changes: ['Add more fast forward speeds', 'General performance improvements and bug fixes']
        },
        {
            title: 'Version December 30',
            changes: ['Add French application language by @UnicodeApocalypse', 'General performance improvements and bug fixes']
        },
        {
            title: 'Version June 17',
            changes: ['Add Turkish application language by @G-35']
        },
        {
            title: 'Version June 13',
            changes: [
                'Added Sync across devices, Backup, and Restore using Google Drive',
                'Sync across devices is disabled by default. It is recommended to enable it only if you use the app on multiple devices with the same Google Drive account',
                'Notifications: Added background notification support for Android 11 and above. This uses a simplified single-line text notification while running in the background',
                'Chat VOD: Improved chat synchronization when starting playback. For VODs of an ongoing live stream, there was a chance the chat could take a long time to load and/or sync',
                'Player: Added rewind button for live streams. This plays the VOD of the current live (when available) stream starting from the most recent point',
                'User Live Feed (accessed by pressing Up on the player): Live history now shows the last 100 watched channels that are Live',
                'User Live Feed (accessed by pressing Up on the player): Re-added the User VODs section',
                'Player: Removed buffer settings since they no longer provide any benefit in the current player version',
                'Updated Ukrainian language translation by @sladkOy',
                'General performance improvements and bug fixes'
            ]
        },
        {
            title: 'Version June 07',
            changes: ['Add Ukraine application language by @sladkOy']
        }
    ]
};
