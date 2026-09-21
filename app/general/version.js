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
    publishVersionCode: 385, //Always update (+1 to current value) Main_version_java after update publishVersionCode or a major update of the apk is released
    ApkUrl: 'https://github.com/YofarDev/SmarterTwitchTV/releases/download/385/SmarterPurpleTV_3_0_385.apk',
    WebVersion: 'September 21 2026',
    WebTag: 734, //Always update (+1 to current value) Main_version_web after update Main_minversion or a major update of the web part of the app
    changelog: [
        {
            title: 'September 21 2026',
            changes: [
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
