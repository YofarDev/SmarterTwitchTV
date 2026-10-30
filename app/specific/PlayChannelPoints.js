/*
 * Copyright (c) 2017–present Felipe de Leon <fglfgl27@gmail.com>
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartTwitchTV. If not, see <https://github.com/fgl27/SmartTwitchTV/blob/master/LICENSE>.
 *
 */

//Reports live watch time the way the Twitch site player does, so Twitch can credit channel points.
//The channel page, its settings script and the minute-watched event are undocumented Twitch site internals,
//they may change without notice; any failure here is silent and only stops the reporting.
var PlayChannelPoints_IntervalId = null;
var PlayChannelPoints_SpadeUrl = null;
//Remaining endpoints to try when the current one can't be reached
var PlayChannelPoints_SpadeUrlFallbacks = [];
//spade_url first: verified to credit points, and beacon.twitch.tv is on common DNS tracker blocklists
var PlayChannelPoints_SpadeUrlKeys = ['spade_url', 'beacon_url'];
var PlayChannelPoints_ChannelId = null;
var PlayChannelPoints_BroadcastId = null;
var PlayChannelPoints_ChannelLogin = null;
var PlayChannelPoints_DiscoveryId = 0;
var PlayChannelPoints_IntervalMs = 60000;

function PlayChannelPoints_CanRun() {
    return (
        Play_isOn &&
        Play_data &&
        Play_data.data &&
        Play_data.data.length &&
        AddUser_UserHasToken() &&
        AddUser_UsernameArray[0].id &&
        Play_data.data[6] &&
        Play_data.data[7] &&
        Play_data.data[14]
    );
}

function PlayChannelPoints_Start() {
    PlayChannelPoints_Stop();

    if (!PlayChannelPoints_CanRun()) return;

    PlayChannelPoints_ChannelLogin = Play_data.data[6] + '';
    PlayChannelPoints_BroadcastId = Play_data.data[7] + '';
    PlayChannelPoints_ChannelId = Play_data.data[14] + '';

    //The endpoint isn't tied to the channel: found once, then kept across streams until no endpoint is left (SendSuccess)
    if (PlayChannelPoints_ReportEnabled() && !PlayChannelPoints_SpadeUrl) PlayChannelPoints_DiscoverSpadeUrl();
    PlayChannelPoints_IntervalId = Main_setInterval(PlayChannelPoints_SendMinuteWatched, PlayChannelPoints_IntervalMs, PlayChannelPoints_IntervalId);
}

function PlayChannelPoints_Stop() {
    Main_clearInterval(PlayChannelPoints_IntervalId);

    PlayChannelPoints_IntervalId = null;
    PlayChannelPoints_ChannelId = null;
    PlayChannelPoints_BroadcastId = null;
    PlayChannelPoints_ChannelLogin = null;
    PlayChannelPoints_DiscoveryId++;
    PlayAutoClaim_Reset();
}

function PlayChannelPoints_ReportEnabled() {
    return Boolean(Settings_Obj_default('watch_time_points'));
}

function PlayChannelPoints_IsCurrentStream() {
    return (
        PlayChannelPoints_CanRun() &&
        Main_A_equals_B(PlayChannelPoints_ChannelLogin, Play_data.data[6]) &&
        Main_A_equals_B(PlayChannelPoints_BroadcastId, Play_data.data[7]) &&
        Main_A_equals_B(PlayChannelPoints_ChannelId, Play_data.data[14])
    );
}

function PlayChannelPoints_DiscoverSpadeUrl() {
    if (!PlayChannelPoints_IsCurrentStream()) return;

    var requestId = ++PlayChannelPoints_DiscoveryId;

    FullxmlHttpGet(
        'https://www.twitch.tv/' + encodeURIComponent(PlayChannelPoints_ChannelLogin),
        null,
        PlayChannelPoints_PageSuccess,
        noop_fun,
        0,
        requestId,
        null,
        null
    );
}

function PlayChannelPoints_PageSuccess(obj, key, id) {
    if (id !== PlayChannelPoints_DiscoveryId || !PlayChannelPoints_IsCurrentStream() || obj.status !== 200) return;

    key = key || 0;

    var match = obj.responseText.match(/https:\/\/[\w.-]+\/config\/settings\.[\w.-]+\.js/);

    if (!match) return;

    FullxmlHttpGet(match[0], null, PlayChannelPoints_SettingsSuccess, noop_fun, 0, id, null, null);
}

function PlayChannelPoints_SettingsSuccess(obj, key, id) {
    if (id !== PlayChannelPoints_DiscoveryId || !PlayChannelPoints_IsCurrentStream() || obj.status !== 200) return;

    key = key || 0;

    var urls = [],
        match,
        i = 0,
        len = PlayChannelPoints_SpadeUrlKeys.length;

    for (i; i < len; i++) {
        match = obj.responseText.match(new RegExp('"' + PlayChannelPoints_SpadeUrlKeys[i] + '":"(.*?)"'));

        if (match && match[1]) urls.push(match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
    }

    PlayChannelPoints_SpadeUrl = urls.length ? urls.shift() : null;
    PlayChannelPoints_SpadeUrlFallbacks = urls;
}

function PlayChannelPoints_SendMinuteWatched() {
    if (!PlayChannelPoints_IsCurrentStream()) {
        PlayChannelPoints_Stop();
        return;
    }

    //Only report minutes that are actually playing: not paused, buffering or with the app in the background
    if (!Play_Playing || Main_isStopped || !Play_isPlaying()) return;

    PlayAutoClaim_Tick(PlayChannelPoints_ChannelId);

    if (!PlayChannelPoints_ReportEnabled()) return;

    if (!PlayChannelPoints_SpadeUrl) {
        PlayChannelPoints_DiscoverSpadeUrl();
        return;
    }

    var payload = {
        event: 'minute-watched',
        properties: {
            channel_id: PlayChannelPoints_ChannelId,
            broadcast_id: PlayChannelPoints_BroadcastId,
            player: 'site',
            user_id: parseInt(AddUser_UsernameArray[0].id, 10),
            live: true,
            channel: PlayChannelPoints_ChannelLogin
        }
    };

    FullxmlHttpGet(
        PlayChannelPoints_SpadeUrl,
        [['Content-Type', 'application/x-www-form-urlencoded']],
        PlayChannelPoints_SendSuccess,
        noop_fun,
        0,
        PlayChannelPoints_DiscoveryId,
        'POST',
        'data=' + encodeURIComponent(btoa(JSON.stringify(payload)))
    );
}

function PlayChannelPoints_SendSuccess(obj, key, id) {
    if (id !== PlayChannelPoints_DiscoveryId || !PlayChannelPoints_IsCurrentStream()) return;

    key = key || 0;

    //0 = no response (blocked host, DNS or network failure), 404/410 = endpoint gone: try the next one, rediscover when none is left
    if (obj.status === 0 || obj.status === 404 || obj.status === 410) {
        PlayChannelPoints_SpadeUrl = PlayChannelPoints_SpadeUrlFallbacks.length ? PlayChannelPoints_SpadeUrlFallbacks.shift() : null;
    }
}
