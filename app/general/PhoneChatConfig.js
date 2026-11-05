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

/*
 * Public configuration for the "Chat on phone" feature.
 *
 * This file is loaded by BOTH the TV app (main bundle, used to build the QR
 * link) and the standalone phone page (PhoneChat bundle, used for OAuth and
 * API calls). It contains public values only: client IDs and redirect URLs
 * are public configuration. Never place client secrets or tokens here.
 *
 * OWNER SETUP: register an owner-controlled Twitch application with the Public
 * client type (Device Code Flow), and set clientId below. Local pages require no
 * OAuth callback registration and never embed a client secret.
 * Hosted callback settings below remain for legacy hosted-page compatibility.
 */

//Single public configuration object, shared by the TV bundle and the phone bundle.
//It is referenced on both sides, which keeps JSHint's unused check honest.
var PhoneChatConfig = {
    //Owner-controlled public Twitch application for phone Device Code Flow.
    clientId: '10b45vistuje4pezdfzwnymdlxs579',

    //Device flow also works on the optional hosted page; legacy callbacks remain readable.
    useDeviceLogin: true,

    //Canonical HTTPS page URL used by the TV to generate the QR code.
    //Do not derive this from window.location: the TV can load from app assets or an alternate origin
    pageUrl: 'https://yofardev.github.io/SmarterPurpleTV/release/phonechat.html',

    //Explicit allowlist of page/callback origins the phone may recognize.
    //The phone selects only its OWN actual page URL from this list; an unknown
    //origin shows a configuration error and disables Connect.
    //Register only URLs that are actually used, and keep in sync with the Twitch
    //application callback registration.
    allowedOrigins: ['https://yofardev.github.io'],

    //Paths (per origin) accepted as the phone page; the old repository path stays
    //accepted because the legacy OAuth callback registered on Twitch still uses it
    //(GitHub redirects it to the new address)
    allowedPaths: ['/SmarterPurpleTV/release/phonechat.html', '/SmarterTwitchTV/release/phonechat.html', '/phonechat.html'],

    //Required Twitch scopes for the phone session (minimum set, do not add unrelated scopes)
    scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],

    oauth: {
        deviceUrl: 'https://id.twitch.tv/oauth2/device',
        tokenUrl: 'https://id.twitch.tv/oauth2/token',
        authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
        validateUrl: 'https://id.twitch.tv/oauth2/validate',
        helixApi: 'https://api.twitch.tv/helix/',
        ircUrl: 'wss://irc-ws.chat.twitch.tv:443'
    },

    //Pending OAuth records expire after 10 minutes
    pendingTimeoutMs: 10 * 60 * 1000,

    //Revalidate the saved session at most this often while the page is used,
    //and after the page was hidden for longer than the background interval
    sessionRevalidateMs: 60 * 60 * 1000,
    backgroundRevalidateMs: 30 * 60 * 1000
};
