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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartTwitchTV.  If not, see <https://github.com/fgl27/SmartTwitchTV/blob/master/LICENSE>.
 *
 */

//Sub-only VOD fallback ported from TwitchNoSub (https://github.com/besuper/TwitchNoSub, Apache-2.0):
//when Twitch refuses the VOD playlist, derive the CDN paths from the public seekPreviewsURL and
//build the master playlist the player would have received.

var PlayVodNoSub_ActiveId = 0;
var PlayVodNoSub_VodId = null;
var PlayVodNoSub_Info = null;
var PlayVodNoSub_Valid = [];
var PlayVodNoSub_Index = 0;
var PlayVodNoSub_FailCallback = null;

var PlayVodNoSub_Qualities = [
    {key: 'chunked', name: '1080p60 (source)', resolution: '1920x1080', frameRate: 60},
    {key: '1440p60', name: '1440p60', resolution: '2560x1440', frameRate: 60},
    {key: '1080p60', name: '1080p60', resolution: '1920x1080', frameRate: 60},
    {key: '720p60', name: '720p60', resolution: '1280x720', frameRate: 60},
    {key: '480p30', name: '480p', resolution: '852x480', frameRate: 30},
    {key: '360p30', name: '360p', resolution: '640x360', frameRate: 30},
    {key: '160p30', name: '160p', resolution: '284x160', frameRate: 30}
];

var PlayVodNoSub_InfoQuery = '{"query":"{video(id:\\"%x\\"){broadcastType,createdAt,seekPreviewsURL,creator{login}}}"}';

function PlayVodNoSub_Try(failCallback) {
    if (!Main_IsOn_OSInterface || !PlayVod_isOn) {
        failCallback();
        return;
    }

    PlayVodNoSub_ActiveId = new Date().getTime();
    PlayVodNoSub_VodId = Main_values.ChannelVod_vodId;
    PlayVodNoSub_FailCallback = failCallback;
    PlayVodNoSub_Info = null;
    PlayVodNoSub_Valid = [];

    Main_Log('[PlayVodNoSub] requesting VOD info');

    FullxmlHttpGet(
        PlayClip_BaseUrl,
        Play_base_backup_headers_Array,
        PlayVodNoSub_InfoResult,
        PlayVodNoSub_InfoFail,
        0,
        PlayVodNoSub_ActiveId,
        'POST',
        PlayVodNoSub_InfoQuery.replace('%x', Main_values.ChannelVod_vodId)
    );
}

function PlayVodNoSub_InfoFail() {
    PlayVodNoSub_Fail();
}

function PlayVodNoSub_InfoResult(responseObj, key, requestId) {
    if (!PlayVodNoSub_IsCurrent(requestId)) return;

    if (!responseObj || responseObj.status !== 200) {
        PlayVodNoSub_Fail();
        return;
    }

    var obj;

    try {
        obj = JSON.parse(responseObj.responseText);
    } catch (error) {
        PlayVodNoSub_Fail();
        return;
    }

    var vod = obj && obj.data && obj.data.video;

    if (!vod || !vod.seekPreviewsURL) {
        Main_Log('[PlayVodNoSub] no seekPreviewsURL');
        PlayVodNoSub_Fail();
        return;
    }

    var parsed = PlayVodNoSub_ParseSeekPreviews(vod.seekPreviewsURL);

    if (!parsed) {
        Main_Log('[PlayVodNoSub] invalid seekPreviewsURL ' + vod.seekPreviewsURL);
        PlayVodNoSub_Fail();
        return;
    }

    var created = new Date(vod.createdAt).getTime();
    //ponytail: the fixed 2023-02-10 cutoff is copied from TwitchNoSub; new uploads use the regular path
    var oldUpload = (new Date('2023-02-10').getTime() - created) / (1000 * 3600 * 24) > 7;

    PlayVodNoSub_Info = {
        vodId: Main_values.ChannelVod_vodId,
        domain: parsed.domain,
        vodSpecialID: parsed.vodSpecialID,
        broadcastType: (vod.broadcastType || '').toLowerCase(),
        login: vod.creator && vod.creator.login ? vod.creator.login : '',
        oldUpload: oldUpload
    };

    Main_Log('[PlayVodNoSub] probing ' + PlayVodNoSub_Qualities.length + ' qualities on ' + PlayVodNoSub_Info.domain);

    PlayVodNoSub_Index = 0;
    PlayVodNoSub_ProbeNext(PlayVodNoSub_ActiveId);
}

function PlayVodNoSub_ParseSeekPreviews(url) {
    var parts = url.split('/');
    var storyboards = -1;
    var i;

    //Start after the protocol and host: parts[2] is the host (vod-storyboards.twitch.tv),
    //the path segments start at 3, so the hostname can never be picked as the storyboards dir
    for (i = 3; i < parts.length; i++) {
        if (parts[i].indexOf('storyboards') > -1) {
            storyboards = i;
            break;
        }
    }

    if (storyboards < 4) return null;

    return {domain: parts[2], vodSpecialID: parts[storyboards - 1]};
}

function PlayVodNoSub_PlaylistUrl(info, key) {
    if (info.broadcastType === 'highlight') {
        return 'https://' + info.domain + '/' + info.vodSpecialID + '/' + key + '/highlight-' + info.vodId + '.m3u8';
    }

    if (info.broadcastType === 'upload' && info.oldUpload && info.login) {
        return 'https://' + info.domain + '/' + info.login + '/' + info.vodId + '/' + info.vodSpecialID + '/' + key + '/index-dvr.m3u8';
    }

    return 'https://' + info.domain + '/' + info.vodSpecialID + '/' + key + '/index-dvr.m3u8';
}

function PlayVodNoSub_ProbeNext(requestId) {
    if (!PlayVodNoSub_IsCurrent(requestId)) return;

    if (PlayVodNoSub_Index >= PlayVodNoSub_Qualities.length) {
        PlayVodNoSub_Finish();
        return;
    }

    var index = PlayVodNoSub_Index++;
    var quality = PlayVodNoSub_Qualities[index];
    var url = PlayVodNoSub_PlaylistUrl(PlayVodNoSub_Info, quality.key);

    Main_Log('[PlayVodNoSub] probe ' + quality.key + ' ' + url);

    OSInterface_XmlHttpGetFull(
        url,
        DefaultHttpGetTimeout,
        null,
        null,
        null,
        'PlayVodNoSub_ProbeResult',
        requestId,
        String(index),
        'playlist',
        null,
        null,
        null,
        'PlayVodNoSub_ProbeResult',
        null
    );
}

function PlayVodNoSub_ProbeResult(result, requestId, check_1, check_2) {
    if (!PlayVodNoSub_IsCurrent(requestId)) return;

    var index = parseInt(check_1, 10);
    var response;

    try {
        response = JSON.parse(result);
    } catch (error) {
        response = null;
    }

    var body = response ? response.responseText || '' : '';

    if (check_2 === 'init') {
        //The init segment failing still means the variant playlist was valid; TwitchNoSub
        //assumes HEVC in that case, so keep the quality instead of dropping it
        var initOk = response && response.status === 200;
        PlayVodNoSub_AddQuality(index, initOk && body.indexOf('hev1') === -1 ? 'avc1.4D001E' : 'hev1.1.6.L93.B0');
        PlayVodNoSub_ProbeNext(requestId);
        return;
    }

    if (!response || response.status !== 200) {
        PlayVodNoSub_ProbeNext(requestId);
        return;
    }

    if (body.indexOf('.ts') > -1) {
        PlayVodNoSub_AddQuality(index, 'avc1.4D001E');
        PlayVodNoSub_ProbeNext(requestId);
        return;
    }

    if (body.indexOf('.mp4') > -1) {
        PlayVodNoSub_ProbeInit(index, requestId);
        return;
    }

    PlayVodNoSub_ProbeNext(requestId);
}

function PlayVodNoSub_ProbeInit(index, requestId) {
    var url = PlayVodNoSub_PlaylistUrl(PlayVodNoSub_Info, PlayVodNoSub_Qualities[index].key);

    if (url.indexOf('index-dvr.m3u8') === -1) {
        PlayVodNoSub_AddQuality(index, 'avc1.4D001E');
        PlayVodNoSub_ProbeNext(requestId);
        return;
    }

    OSInterface_XmlHttpGetFull(
        url.replace('index-dvr.m3u8', 'init-0.mp4'),
        DefaultHttpGetTimeout,
        null,
        null,
        null,
        'PlayVodNoSub_ProbeResult',
        requestId,
        String(index),
        'init',
        null,
        null,
        null,
        'PlayVodNoSub_ProbeResult',
        null
    );
}

function PlayVodNoSub_AddQuality(index, codec) {
    PlayVodNoSub_Valid.push({
        index: index,
        codec: codec,
        url: PlayVodNoSub_PlaylistUrl(PlayVodNoSub_Info, PlayVodNoSub_Qualities[index].key)
    });

    Main_Log('[PlayVodNoSub] found ' + PlayVodNoSub_Qualities[index].key);
}

function PlayVodNoSub_Finish() {
    if (!PlayVod_isOn) return;

    if (!PlayVodNoSub_Valid.length) {
        Main_Log('[PlayVodNoSub] no valid quality');
        PlayVodNoSub_Fail();
        return;
    }

    var playlist = PlayVodNoSub_BuildPlaylist();

    Main_Log('[PlayVodNoSub] playing generated playlist\n' + playlist);

    PlayVodNoSub_ActiveId = 0;
    PlayVodNoSub_VodId = null;
    PlayVodNoSub_FailCallback = null;
    PlayVodNoSub_Info = null;
    PlayVodNoSub_Valid = [];

    PlayVod_autoUrl = 'https://usher.ttvnw.net/vod/' + Main_values.ChannelVod_vodId + '.m3u8';
    PlayVod_loadDataSuccessEnd(playlist);
}

function PlayVodNoSub_BuildPlaylist() {
    var playlist =
        '#EXTM3U\n#EXT-X-TWITCH-INFO:ORIGIN="s3",B="false",REGION="EU",USER-IP="127.0.0.1",SERVING-ID="' +
        PlayVodNoSub_ServingId() +
        '",CLUSTER="cloudfront_vod",USER-COUNTRY="BE",MANIFEST-CLUSTER="cloudfront_vod"';
    var bandwidth = 8534030;
    var i;

    for (i = 0; i < PlayVodNoSub_Valid.length; i++) {
        var valid = PlayVodNoSub_Valid[i];
        var quality = PlayVodNoSub_Qualities[valid.index];
        var enabled = i === 0 ? 'YES' : 'NO';

        playlist +=
            '\n#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="' +
            quality.key +
            '",NAME="' +
            quality.name +
            '",AUTOSELECT=' +
            enabled +
            ',DEFAULT=' +
            enabled;
        playlist +=
            '\n#EXT-X-STREAM-INF:BANDWIDTH=' +
            bandwidth +
            ',CODECS="' +
            valid.codec +
            ',mp4a.40.2",RESOLUTION=' +
            quality.resolution +
            ',VIDEO="' +
            quality.key +
            '",FRAME-RATE=' +
            quality.frameRate;
        playlist += '\n' + valid.url;

        bandwidth -= 100;
    }

    return playlist;
}

function PlayVodNoSub_ServingId() {
    var chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    var id = '';
    var i;

    for (i = 0; i < 32; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));

    return id;
}

function PlayVodNoSub_IsCurrent(requestId) {
    //Also guard the VOD id: a late callback from a previous VOD must not start playback
    return (
        PlayVod_isOn &&
        PlayVodNoSub_ActiveId &&
        requestId === PlayVodNoSub_ActiveId &&
        PlayVodNoSub_VodId === Main_values.ChannelVod_vodId
    );
}

function PlayVodNoSub_Fail() {
    var callback = PlayVodNoSub_FailCallback;

    PlayVodNoSub_ActiveId = 0;
    PlayVodNoSub_VodId = null;
    PlayVodNoSub_FailCallback = null;
    PlayVodNoSub_Info = null;
    PlayVodNoSub_Valid = [];

    if (callback) callback();
}
