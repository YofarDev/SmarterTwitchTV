Smarter Purple TV latest changes
==============

Bellow changes are just a resume of all changes made to the repo to check the full changelog list check the [commit list](https://github.com/fgl27/SmartTwitchTV/commits/master).

The App is divided in two part, **Apk** and **Web** you can check it version in the about of the app:
* The **Apk** is updated via play store it contains the app video player and the basic function that don't work on the web part of the app.
* The **Web** is update every time that the app is closed and you re-open it (of course if a update is available in the web server), it contains the user interface and related functions. If the app is open and you change apps that process doesn't closes the app only minimizes it unless the system run out of memory and close the app, to manually close it's needed to select close on the exit dialog or simply holding the return key to force close it.

The app has a building update check function, so whenever there is a update a red text will show up bellow the main pages clock, also a short warning will pop on the screen let you know if is a **Apk** or **Web** update.

November 24 2026 (3.0.405)
==============

* APK: the CH+/CH- keys on the remote change channels like a TV tuner — they open the followed-live strip, step through it with live previews, and tune the focused channel once the presses settle; holding the key sweeps
* APK: ad breaks fenced only by the SCTE-35 CUE-OUT/CUE-IN markers (some edge nodes serve them without the stitched-ad range) are now stripped and escaped like the stitched ones, on both the APK filter and the web pre-playback probe
* New: stream opens get a master playlist cache — opening a channel again within 90 seconds (channel surfing, feed previews, quality restore after a 360p ad escape) skips the playback token request and starts from the cached playlist, and focusing a feed card with previews off resolves its stream in the background so pressing OK is instant
* Improvement: chat emotes download smaller images (2x instead of 3x/4x for the main source; high-res versions are still fetched on high-density screens through srcset), cutting chat bandwidth on busy channels
* Needs APK 405, older APKs keep the previous behaviour

November 22 2026 (3.0.404)
==============

* Fix: on long VODs with stream drops, chat ran behind the video by the time the stream was down, about 2 minutes 43 hours into a long subathon VOD — Twitch counts chat time from when the VOD started recording, while the VOD video skips the minutes the stream was offline. The APK now reads the real time stamped on each video segment and VOD chat follows it, so chat lines up again after every drop; needs APK 404, older APKs keep the previous behaviour (#43)

November 22 2026 (3.0.403)
==============

* APK: new launcher banner on Android TV home screens
* Fix: opening an ended stream from History > Live as a VOD could throw before the player started and leave the remote unresponsive — the live badge is now looked up by class instead of by position in the row
* Improvement: secondary text on TV (card metadata, viewer count, detail band, footer key hints, Refresh and rail utilities) is now at least 24px at 1080p and uses a lighter tint instead of reduced opacity, so it reads from the couch
* Improvement: the key hint footer and the navigation rail icons moved inward to sit inside the TV title-safe margin, so older TVs that crop the screen edge no longer cut them off
* Improvement: LIVE, VOD and CLIP badges use deeper colours that keep white text readable, a focused live card shows a LIVE text badge instead of only a colour dot, the card button reads Options and the Following status panel no longer lingers after you change screen

November 11 2026 (3.0.402)
==============

* APK: during an ad break the player and the grid previews hold a still frame until the break ends, instead of replaying the last seconds of the stream over and over; playback resumes at the live edge the moment the break is over (by @Dryness, #38)
* APK: an "Ads In Progress" label sits over the held picture, on grid previews and in the player, so a frame held by a break no longer looks like a stalled stream (by @Dryness, #39)

November 7 2026 (3.0.401)
==============

* Points: watch time reporting keeps running after the main stream changes without a new stream load — picture in picture swaps, multistream main window changes and broadcast restarts — so channel points, drop progress and bonus claims continue instead of stopping until a stream is opened again (by @Dryness, #34)
* APK: an ad break the filter can only freeze no longer ends the stream — the frozen picture used to trip the player failure counter and show the stream ended screen about ten seconds into the break; failures during a freeze reset the player without counting, and a stream that really ends during a break still ends (by @Dryness, #35)

November 5 2026 (3.0.400)
==============

* Channel points: watching a live stream now reports watch time, so channel points, drop campaign progress and the bonus chest accrue like on the Twitch site (by @Dryness, #13)
* Channel points: new settings dialog with auto claim, the bonus chest and finished drops can be claimed automatically (off by default, Settings › Channel points), with optional toast notices (by @Dryness, #14)
* Chat: new Animated emotes option, still images instead of animations, a big processor saving on slower TVs (by @Dryness, #23)
* Interface: key hints (the footer, player drawer help lines and the controls dialog) draw the remote keys as glyphs with group dividers, and the footer now advertises Hold Up Refresh (by @Dryness, #8)
* Remote: holding OK on a card or an account can no longer pick an option in the dialog it opens through key auto-repeat (by @Dryness, #9)
* Account: user cards are no longer clipped under the tabs, the tabs and rail are reachable again, and the leftover page counter is gone. Add User no longer lets a late answer act as Back on the next screen (by @Dryness, #10)
* Welcome screen: the buttons show a single highlight, and Left reaches the navigation rail (by @Dryness, #11)
* Home screen: User Live and Games fill in on custom TV launchers, and items opened from the home channels open in their own section. A game shows under Browse › Categories (by @Dryness, #12; the channel loading part is APK side)

November 5 2026 (3.0.399)
==============

* Player: the bar caption shows what quality Auto is actually playing, e.g. Quality · Auto (1080p60 | source) (by @Dryness, #18)
* Player: leaving the timeline keeps the bar and the stream info in sync. Back no longer reopens the bar over a hidden panel, and Down brings the stream info back (by @Dryness, #17)
* Player: reopening the channel feed (Up or the bar's Channels) starts on the live list again instead of showing the last visited list underneath (by @Dryness, #4)
* Settings: dialogs with many options (like Chat options) scroll just enough to keep the focused option in view. Option heights differ, so a fixed row count could not (by @Dryness, #24)
* Browsing: followed VODs no longer fail to load when a VOD has no category (by @Dryness, #6)
* APK: the preview player falls back to a software decoder when the single hardware decoder is already in use, and a preview that fell back is no longer promoted to the main player (by @Dryness, #19)
* APK: playback no longer stops and returns to the menu when a Bluetooth remote disconnects or goes to sleep (by @yo1frenchtoast, #1)

November 5 2026 (3.0.398)
==============

* Chat: busy live chats insert their new lines together at most twice a second. Every single insert re-laid out and re-rasterized the whole chat box, a real CPU cost on slower TVs (by @Dryness, #22)
* Chat: value-less IRC tags from the message history no longer take their own name as their value, which could drop the chat history on join (by @Dryness, #5)
* Player: the timeline no longer carries a drop-shadow filter. The GPU re-applied it on every animated frame while the menu was open, stalling the video on weak TVs (by @Dryness, #16)
* Settings: section headings appear together with their first option while scrolling, the focus outline stays inside the list, and the screen uses the same background as the navigation rail. Closing the rail returns the focus to the row (by @Dryness, #7)
* APK: the ad-filtered playlist stream is closed so its gzip inflater is freed after each ad check instead of leaking (by @Dryness, #21)

November 5 2026 (3.0.397)
==============

* General: the repository is now github.com/YofarDev/SmarterPurpleTV. The update check, the About dialog project and releases links, the hosted phone chat page and the APK now use the new addresses, and old links keep working through GitHub's redirect. The app is named Smarter Purple TV everywhere

November 5 2026 (3.0.396)
==============

* Settings: the list now scrolls row by row keeping the focused setting on screen. It used to flip between the top and the bottom of the page, which left settings permanently invisible on screens that fit fewer rows
* Player: new setting "Hide live seek bar" (Settings › Player related). Live streams no longer show the seek bar and its once a second updates while the menu is open, which can stop frame drops on slower TVs; VODs and clips keep their bar

October 31 2026 (3.0.395)
==============

* Phone chat: tap a username to open Mute without holding; the Muted button is always visible and explains how to mute when the list is empty
* Phone chat: the automatic repeat filter now groups repeated messages from the same user even when other users chat in between; deleting any message in a repeat group removes the grouped content safely

October 25 2026 (3.0.394)
==============

* Phone chat: fix muting on iPhone. Long-pressing a message now opens the mute sheet on iOS browsers, which never report a long-press as a context menu (Android and desktop right-click are unchanged)
* Contact: the app email in the About and first-run welcome dialogs is now yofardev@gmail.com
* Fix: the browser/source build loads the raid module again. Closing a restored stream during browser testing no longer freezes the app on a dead screen (TV playback was never affected)

October 24 2026 (3.0.393)
==============

* Ad blocking: ad breaks that can no longer be hidden now freeze the picture on the last live frame until the break is over, instead of playing the ad. Some breaks are stitched into every fresh stream session and simply cannot be escaped
* Ad blocking: the escape reloads rotate the fallback stream types much faster (15 seconds instead of 60), so every type is tried within a single ad break
* Ad blocking: the pre-playback ad probe now checks every stream quality instead of only the first and last. Ads stitched into a single quality can no longer slip into playback

October 23 2026 (3.0.392)
==============

* Memory: VOD seek preview images are released when the player closes instead of staying in memory until the next VOD
* Memory: game screen and live feed backups are now capped at the last 5 games instead of growing with every game visited
* Storage: history saves recover from storage quota errors by trimming old entries; block/unblock leftovers are trimmed on load; the stream playlist is no longer saved to storage
* Fix: the phone chat background sync keeps running after the player closes; it now stops cleanly
* Fix: scrolling the side panel could cancel a pending watch history save. It now cancels the right timer
* Fix: the channel context was never restored when returning to a channel's videos/clips after a search; multi view rewrote the game line on every refresh and could stack-overflow cycling empty slots; number key 2 jumped the clip while the feed preview was open
* Performance: moving focus back and forth no longer re-requests the same stream info within 15 seconds; multi view stops rewriting unchanged text and audio icons; the player options drawers stop rebuilding their button bar on every key press and multi view main-window switching no longer re-copies and re-parses the stream playlist on each left/right
* APK: fix leaks on player restart (activity held by the ad reload listener, handler threads and pending handlers never released, WebViews never destroyed)
* APK: fix the first notification run saving an empty live list which caused a burst of "went live" toasts on the next check; avatars past the first 100 follows never loaded
* APK: notification logos are downsampled before decode, downloaded once with timeouts, and cached; TV channel thumbnails no longer carry a cache buster that forced a re-download every sync; user switch no longer blocks the app bridge for seconds

October 16 2026 (APK 391)
==============

* TV chat: use one delay timer per chat and retain at most twenty inactive channel caches while keeping current shared channels available
* TV chat: message animation now fades and slides into its final height
* Phone chat: batch history maintenance and scrolling while preserving moderation and twenty-minute priority history
* Android: bound waiting network requests and prevent stale responses or APK installer callbacks after activity destruction

October 11 2026 (APK 390)
==============

* Phone chat: remember Twitch login across tabs and refresh expired device-flow credentials automatically
* Phone chat: retain twenty minutes of Partner, VIP and moderator messages independently of ordinary chat traffic
* TV chat history: after opening the pairing QR, the TV anonymously collects filtered messages while the phone is locked and sends missed messages and moderation events when it returns
* History is local to the current live channel and resets when the channel changes or the TV app restarts

October 10 2026 (APK 389)
==============

* App updates: fixed GitHub APK installation being rejected by Android because the install permission was missing
* App updates: open the install permission settings when needed, clear loading after download failure or installer handoff, and prevent duplicate downloads
* Update checks: clear outdated update warnings when the installed app is current; add a loading timeout for older APKs

October 10 2026 (APK 388)
==============

* Phone chat: Twitch Partner messages now have the same subtle purple background as TV chat
* Phone chat: switch between All chat and Partners, VIPs & Mods; the filtered tab excludes known bot accounts
* Note: update to APK 388 for these improvements to the phone page hosted on your TV

October 10 2026 (APK 387)
==============

* Debug logs: when the capture buffer fills, the downloaded logs now retain the newest messages instead of discarding them in favor of older rotated logs

October 10 2026 (APK 386)
==============

* Chat on phone: the TV now hosts the phone webpage over your local network; scan its QR while on the same Wi-Fi and the phone follows live stream changes automatically
* Phone chat: sign in to Twitch independently on your phone using device authorization; no callback registration is needed for each TV address
* App updates: the update checker now checks Smarter Purple TV releases from this fork
* Note: local phone hosting requires APK 386 or newer; the phone page is bundled in the APK and does not need public web hosting

<!-- Everything below this line is legacy, kept as written. The generator only manages the sections above. -->