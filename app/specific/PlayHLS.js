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

//To pass to Java
var Play_Headers;
//Live
var play_ExtraCodecsValues;

//Preroll retry: token template override used while retrying with an alternate player type;
//single shot, cleared once consumed by PlayHLS_GetToken
var PlayHLS_AdRetryToken = null;
//Preroll retry state per playback load (keyed by checkResult): {original, attempt, current}
var PlayHLS_AdRetryStates = {};

var Play_live_token_prop = 'streamPlaybackAccessToken';
var Play_live_token =
    // '{"operationName":"PlaybackAccessToken_Template","query":"query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!, $platform: String!) ' +
    // '{  streamPlaybackAccessToken(channelName: $login, params: {platform: $platform, playerBackend: \\"mediaplayer\\", playerType: $playerType}) @include(if: $isLive) {    value    signature    __typename  } ' +
    // ' videoPlaybackAccessToken(id: $vodID, params: {platform: $platform, playerBackend: \\"mediaplayer\\", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}",' +
    //'"variables":{"isLive":true,"login":"%x","isVod":false,"vodID":"","playerType":"mobile","platform":"ios"}}';
    '{"extensions":{"persistedQuery":{"sha256Hash":"ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9","version":1}},' +
    '"operationName":"PlaybackAccessToken","variables":{"isLive":true,"isVod":false,"login":"%x","platform":"web","playerType":"site","vodID":""}}';

var Play_base_live_links =
    'player_backend=mediaplayer&reassignments_supported=true&playlist_include_framerate=true&allow_source=true&fast_bread=false&cdm=wv&acmb=e30%3D&p=%p&play_session_id=%i&player_version=1.13.0&supported_codecs=%c';

var Play_original_live_links = 'https://usher.ttvnw.net/api/channel/hls/';

var Play_live_ttv_lol_links = 'https://api.ttv.lol/playlist/';
var ttv_lol_headers = JSON.stringify([['X-Donate-To', 'https://ttv.lol/donate']]);

var ktwitch_proxy = 'https://api.twitch.hkg.kwabang.net/hls-raw/';

var T1080_proxy = 'https://api1080.ontdb.com/';

var proxy_timeout = 5000;
var proxy_url = '';
var proxy_headers = null;
var proxy_has_parameter = false;
var proxy_has_token = false;

//var proxy_ping_url = 'https://api.ttv.lol/ping';

var use_proxy = false;
var proxy_fail_counter = 0;
var proxy_fail_counter_checker = 0;

//Master playlist cache: what PlayHLS_PlayListUrl fetched per channel|playerType, so a repeat
//open (channel surfing, the feed preview, a quality restore reload) skips the GQL token mint
//and the usher fetch and starts playback from the cached master within the TTL. Entries also
//record failures (a stale token 403s) with a short backoff so a failing channel does not re-mint
//on every retry. Keyed 'login|playerType', insertion ordered so the oldest evicts first.
var PlayHLS_CacheTtl = 90000;
var PlayHLS_CacheFailBackoff = 15000;
var PlayHLS_CacheMax = 32;
var PlayHLS_MasterCache = {};
var PlayHLS_MasterCacheFail = {};
//playerType used by the token request of an in-flight load, keyed by its CheckId_y so the
//result can be cached under the right type (cleared when it grows past the cache cap)
var PlayHLS_PlayerTypeByCheck = {};
//Resolve-only prewarm (PlayHLS_Prewarm): per-channel gate so sweeping focus across the feed
//does not mint a token per card; an entry is prewarmed at most once per interval
var PlayHLS_PrewarmInterval = 45000;
var PlayHLS_PrewarmLast = {};
var PlayHLS_PrewarmId = 0;

function PlayHLS_CacheKey(Channel_or_VOD_Id, playerType) {
    return (Channel_or_VOD_Id + '|' + playerType).toLowerCase();
}

//A fresh cached master for [Channel_or_VOD_Id] at [playerType], or null; also honors the
//failure backoff (a failed fetch is remembered so retries wait instead of re-minting)
function PlayHLS_CacheGet(Channel_or_VOD_Id, playerType, now) {
    var key = PlayHLS_CacheKey(Channel_or_VOD_Id, playerType);
    var failedAt = PlayHLS_MasterCacheFail[key];

    if (failedAt !== undefined) {
        if (now - failedAt < PlayHLS_CacheFailBackoff) return null;
        delete PlayHLS_MasterCacheFail[key];
    }

    var entry = PlayHLS_MasterCache[key];

    if (!entry) return null;

    if (now - entry.at >= PlayHLS_CacheTtl) {
        delete PlayHLS_MasterCache[key];
        return null;
    }

    return entry;
}

function PlayHLS_CachePut(Channel_or_VOD_Id, playerType, url, responseText, now) {
    var key = PlayHLS_CacheKey(Channel_or_VOD_Id, playerType);
    var existing = PlayHLS_MasterCache[key];

    //An identical master re-put (a cache hit re-enters the result handler) keeps its original
    //fetch time, only new content resets the TTL — otherwise repeated opens would keep a
    //stale master alive forever
    if (existing && existing.url === url && existing.responseText === responseText) return;

    delete PlayHLS_MasterCacheFail[key];
    PlayHLS_MasterCache[key] = {url: url, responseText: responseText, at: now};

    //Oldest entries (first keys) evict first; the active channel's entry is the newest
    var keys = Object.keys(PlayHLS_MasterCache);
    while (keys.length > PlayHLS_CacheMax) {
        delete PlayHLS_MasterCache[keys.shift()];
        keys = Object.keys(PlayHLS_MasterCache);
    }
}

function PlayHLS_CacheFail(Channel_or_VOD_Id, playerType, now) {
    PlayHLS_MasterCacheFail[PlayHLS_CacheKey(Channel_or_VOD_Id, playerType)] = now;
}

//Resolve a channel's stream in the background (token mint + master fetch) so pressing OK a
//moment later starts playback from the cache. Called with intent only (feed focus dwell),
//gated per channel so a focus sweep costs at most one resolve per interval
function PlayHLS_Prewarm(Channel_or_VOD_Id) {
    if (!Main_IsOn_OSInterface || !Channel_or_VOD_Id) return;

    var now = new Date().getTime();
    var key = (Channel_or_VOD_Id + '').toLowerCase();
    var last = PlayHLS_PrewarmLast[key];

    if (last !== undefined && now - last < PlayHLS_PrewarmInterval) return;

    PlayHLS_PrewarmLast[key] = now;

    //One entry per channel ever focused; a long session would grow it forever, so evict
    //the oldest (same cap style as the master cache, harmless: an evicted channel can just
    //prewarm again sooner than the interval)
    var prewarmKeys = Object.keys(PlayHLS_PrewarmLast);
    while (prewarmKeys.length > PlayHLS_CacheMax) {
        delete PlayHLS_PrewarmLast[prewarmKeys.shift()];
        prewarmKeys = Object.keys(PlayHLS_PrewarmLast);
    }

    //Prewarm ids walk negative so they can never collide with the playback load ids
    //(timestamps) or the feed check ids the callbacks compare against; they also mark the
    //request as a prewarm for PlayHLS_PlayListUrlResult (see PlayHLS_IsPrewarmCheck)
    PlayHLS_PrewarmId--;
    PlayHLS_GetPlayListAsync(true, Channel_or_VOD_Id, PlayHLS_PrewarmId, PlayHLS_PrewarmId, PlayHLS_PrewarmResult);
}

function PlayHLS_PrewarmResult(result) {
    //The master cache write happens in PlayHLS_PlayListUrlResult for every live fetch,
    //this only has to note failures (already recorded there) and stay quiet
    if (!result) PlayHLS_AdLog('prewarm failed');
}

//The player type a token request template asks for ("site", "embed", ...)
function PlayHLS_PlayerTypeOfToken(tokenTemplate) {
    return tokenTemplate.replace(/^.*"playerType":"(\w+)".*$/, '$1');
}

//Whether a result belongs to a prewarm resolve (its check id walks negative). Prewarms never
//run the ad probe or the player type ladder: they only fill the cache, the open flow
//re-validates whatever is cached when it actually plays the channel
function PlayHLS_IsPrewarmCheck(CheckId_y) {
    return typeof CheckId_y === 'number' && CheckId_y < 0;
}

//VOD
var Play_vod_token_prop = 'videoPlaybackAccessToken';
var Play_vod_token = '{"query":"{videoPlaybackAccessToken(id:\\"%x\\", params:{platform:\\"android\\",playerType:\\"mobile\\"}){value signature}}"}';
var Play_vod_links =
    'https://usher.ttvnw.net/vod/%x.m3u8?nauth=%t&nauthsig=%s&reassignments_supported=true&playlist_include_framerate=true&allow_source=true&cdm=wv&p=%d&supported_codecs=%c';

function PlayHLS_GetPlayListAsync(isLive, Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess, useUserAuth) {
    // console.log('isLive', isLive);
    // console.log('Channel_or_VOD_Id', Channel_or_VOD_Id);
    // console.log('CheckId_y', CheckId_y);
    // console.log('CheckId_x', CheckId_x);
    // console.log('callBackSuccess', callBackSuccess.name);

    //if at te end of a request the values are different we have a issues
    proxy_fail_counter_checker = proxy_fail_counter;

    if (use_proxy && isLive && !proxy_has_token) {
        PlayHLS_PlayListUrl(isLive, Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess.name, null, null, true);
    } else if (isLive && !use_proxy && PlayHLS_AdRetryToken) {
        //An ad escape round: the round's player type may have a cached master (probed clean
        //within the TTL) that serves it without a new token mint; on a miss the token is
        //minted as before
        if (PlayHLS_MasterCacheGetSynth(Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess.name, PlayHLS_PlayerTypeOfToken(PlayHLS_AdRetryToken))) {
            //Served from the cache: consume the round's token override so a later normal
            //load mints the default type again (GetToken consumes it on the mint path)
            PlayHLS_AdRetryToken = null;
            return;
        }

        PlayHLS_GetToken(isLive, Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess.name, use_proxy, useUserAuth);
    } else if (
        isLive &&
        !use_proxy &&
        //Every other live load can start from the cached master and skip the token mint
        //entirely; the synthesized result re-enters PlayHLS_PlayListUrlResult so the ad
        //probe chain and every downstream guard run exactly as on a fresh fetch
        PlayHLS_MasterCacheGetSynth(Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess.name)
    ) {
        return;
    } else {
        PlayHLS_GetToken(isLive, Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess.name, use_proxy, useUserAuth);
    }
}

//Cache hit as a PlayHLS_PlayListUrlResult-shaped request, true when served; CheckId_x may be
//null (Play_loadData passes null), the parseInt in the result handler turns that into NaN
//just like the Java bridge does for the same call. playerType defaults to 'site' (normal
//opens) and is the escape round's type on the retry path
function PlayHLS_MasterCacheGetSynth(Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess, playerType) {
    var type = playerType || 'site';
    var cached = PlayHLS_CacheGet(Channel_or_VOD_Id, type, new Date().getTime());

    if (!cached) return false;

    //So the result handler's cache write lands back under the serving type (the identical
    //content guard there keeps the original fetch time)
    PlayHLS_PlayerTypeByCheck[CheckId_y] = type;

    PlayHLS_AdLog('master cache hit for ' + Channel_or_VOD_Id);

    PlayHLS_PlayListUrlResult(
        JSON.stringify({status: 200, url: cached.url, responseText: cached.responseText, checkResult: CheckId_y}),
        CheckId_y,
        '1',
        '0',
        Channel_or_VOD_Id,
        '0',
        CheckId_x === null ? null : String(CheckId_x),
        callBackSuccess
    );

    return true;
}

//Same headers HttpGetSetUserHeader builds for the logged user, built on demand so a retry
//always carries the token as fresh as AddUser_UsernameArray currently holds it
function PlayHLS_UserAuthHeaders() {
    return JSON.stringify([[clientIdHeader, AddCode_backup_client_id], [Bearer_Header, Main_OAuth + AddUser_UsernameArray[0].access_token]]);
}

function PlayHLS_GetToken(isLive, Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess, useProxy, useUserAuth) {
    var tokenTemplate = isLive ? PlayHLS_AdRetryToken || Play_live_token : Play_vod_token;
    var playerType = PlayHLS_PlayerTypeOfToken(tokenTemplate);

    //Remember the type for the result handler's cache write; the map is bounded because the
    //ids are unbounded (timestamps, feed positions, prewarm ids)
    if (isLive) {
        PlayHLS_PlayerTypeByCheck[CheckId_y] = playerType;

        var checkKeys = Object.keys(PlayHLS_PlayerTypeByCheck);
        while (checkKeys.length > PlayHLS_CacheMax * 2) {
            delete PlayHLS_PlayerTypeByCheck[checkKeys.shift()];
            checkKeys = Object.keys(PlayHLS_PlayerTypeByCheck);
        }
    }

    OSInterface_XmlHttpGetFull(
        PlayClip_BaseUrl, //String urlString
        DefaultHttpGetTimeout, //int timeout
        tokenTemplate.replace('%x', Channel_or_VOD_Id), // String postMessage
        'POST', //String Method
        useUserAuth && AddUser_UserHasToken() ? PlayHLS_UserAuthHeaders() : Play_Headers, //String JsonHeadersArray
        'PlayHLS_GetTokenResult', //String callback
        CheckId_y, //long checkResult
        isLive ? '1' : '0', //String check_1
        useProxy ? '1' : '0', //String check_2
        Channel_or_VOD_Id.toString(), // String check_3
        null, // reserved for token result String check_4
        CheckId_x, // String check_5
        callBackSuccess, //String callBackSuccess
        null //String callBackError
    );

    //The override is single shot, a next retry (if any) sets it again
    PlayHLS_AdRetryToken = null;
}

function PlayHLS_GetTokenResult(result, checkResult, check_1, check_2, check_3, check_4, check_5, callBackSuccess) {
    //console.log('result', result);
    // console.log('checkResult', checkResult);
    // console.log('check_1', check_1);
    // console.log('check_2', check_2);
    // console.log('check_3', check_3);
    // console.log('check_4', check_4);
    // console.log('check_5', check_5);
    // console.log('callBackSuccess', callBackSuccess);

    var isLive = check_1 === '1',
        useProxy = check_2 === '1',
        Channel_or_VOD_Id = check_3,
        CheckId_x = check_5;

    var response = JSON.parse(result);

    if (response.status === 200) {
        var obj = JSON.parse(response.responseText);

        if (obj.data && obj.data[isLive ? Play_live_token_prop : Play_vod_token_prop]) {
            var tokenObj = obj.data[isLive ? Play_live_token_prop : Play_vod_token_prop];
            var Token = tokenObj.value;
            var Sig = tokenObj.signature;

            PlayHLS_PlayListUrl(isLive, Channel_or_VOD_Id, checkResult, CheckId_x, callBackSuccess, Token, Sig, useProxy);
            return;
        }
    }

    //When a preroll retry fails to get a token, fall back to the original playlist instead
    //of surfacing an error
    if (isLive && PlayHLS_AdRetryFinishOriginal(checkResult, CheckId_x, checkResult, callBackSuccess)) {
        return;
    }

    // prettier-ignore
    eval(callBackSuccess)(// jshint ignore:line
        null
    );
}

function PlayHLS_CheckToken(tokenString) {
    if (!tokenString) {
        return '0';
    }

    var Token = JSON.parse(tokenString);

    if (Token.chansub && Token.chansub.restricted_bitrates) {
        var restricted_bitrates = Token.chansub.restricted_bitrates;

        return restricted_bitrates.length ? '1' : '0';
    }

    return '0';
}

function PlayHLS_GetPlayListUrl(isLive, Channel_or_VOD_Id, Token, Sig, useProxy) {
    var url = '',
        headers;

    if (isLive) {
        var randomId = parseInt(Math.random() * 10000000000000000);
        var randomInt = parseInt(Math.random() * 100000000);
        var URL_parameters = Play_base_live_links.replace('%p', randomInt)
            .replace('%i', randomId + '' + randomId)
            .replace('%c', play_ExtraCodecsValues);

        if (useProxy) {
            headers = proxy_headers;

            if (proxy_has_parameter && !proxy_has_token) {
                url = proxy_url + Channel_or_VOD_Id + '.m3u8' + encodeURIComponent('?' + URL_parameters);
            } else {
                url = proxy_url + Channel_or_VOD_Id + '.m3u8?token=' + encodeURIComponent(Token) + '&sig=' + Sig + '&' + URL_parameters;
            }
        } else {
            url = Play_original_live_links + Channel_or_VOD_Id + '.m3u8?token=' + encodeURIComponent(Token) + '&sig=' + Sig + '&' + URL_parameters;
        }
    } else {
        url = Play_vod_links.replace('%x', Channel_or_VOD_Id)
            .replace('%t', encodeURIComponent(Token))
            .replace('%s', Sig)
            .replace('%d', Math.random() * 100000)
            .replace('%c', play_ExtraCodecsValues);
    }

    return {url: url, headers: headers};
}

function PlayHLS_PlayListUrl(isLive, Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess, Token, Sig, useProxy) {
    // console.log('isLive', isLive);
    // console.log('Channel_or_VOD_Id', Channel_or_VOD_Id);
    // console.log('CheckId_y', CheckId_y);
    // console.log('CheckId_x', CheckId_x);
    // console.log('callBackSuccess', callBackSuccess);
    // console.log('Token', Token);
    // console.log('Sig', Sig);
    // console.log('callBackSuccess', callBackSuccess);

    var urlObj = PlayHLS_GetPlayListUrl(isLive, Channel_or_VOD_Id, Token, Sig, useProxy);

    OSInterface_XmlHttpGetFull(
        urlObj.url, //String urlString
        useProxy ? proxy_timeout : DefaultHttpGetTimeout, //int timeout
        null, // String postMessage
        null, //String Method
        urlObj.headers ? urlObj.headers : null, //String JsonHeadersArray
        'PlayHLS_PlayListUrlResult', //String callback
        CheckId_y, //long checkResult
        isLive ? '1' : '0', //String check_1
        useProxy ? '1' : '0', // String check_2
        Channel_or_VOD_Id, // String check_3
        PlayHLS_CheckToken(Token), // String check_4
        CheckId_x, // String check_5
        callBackSuccess, //String callBackSuccess
        null //String callBackError
    );
}

function PlayHLS_PlayListUrlResult(result, checkResult, check_1, check_2, check_3, check_4, check_5, callBackSuccess) {
    // console.log('result', result);
    // console.log('checkResult', checkResult);
    // console.log('check_1', check_1);
    // console.log('check_2', check_2);
    // console.log('check_3', check_3);
    // console.log('check_4', check_4);
    // console.log('check_5', check_5);
    // console.log('callBackSuccess', callBackSuccess);

    var CheckId_y = checkResult,
        isLive = check_1 === '1',
        useProxy = check_2 === '1',
        Channel_or_VOD_Id = check_3,
        Checked_Token = check_4,
        CheckId_x = check_5,
        response = JSON.parse(result);

    if (response.status !== 200) {
        //The cached session is gone (stream ended, token expired), drop the channel's entries
        //and remember the failure so the next minutes' opens re-mint instead of hitting cache
        if (isLive && !useProxy && (response.status === 403 || response.status === 404 || response.status === 410)) {
            PlayHLS_CacheFail(Channel_or_VOD_Id, PlayHLS_PlayerTypeByCheck[CheckId_y] || 'site', new Date().getTime());
        }

        //in case we fail using proxy restart the process without using proxy
        if (isLive && useProxy && PlayHLS_CheckProxyResultFail(response.responseText)) {
            PlayHLS_GetToken(isLive, Channel_or_VOD_Id, CheckId_y, CheckId_x, callBackSuccess, false);
            return;
        }

        //When a preroll retry fails to get a playlist, fall back to the original one instead
        //of surfacing an error
        if (isLive && PlayHLS_AdRetryFinishOriginal(checkResult, CheckId_x, CheckId_y, callBackSuccess)) {
            return;
        }

        result = JSON.stringify({
            status: Checked_Token === '1' ? 1 : response.status,
            responseText: response.responseText,
            checkResult: response.checkResult
        });
    } else {
        if (isLive && !useProxy && Channel_or_VOD_Id) {
            //Cache every live master under the player type that minted it, so repeat opens
            //and ladder rounds can skip the token mint within the TTL
            PlayHLS_CachePut(
                Channel_or_VOD_Id,
                PlayHLS_PlayerTypeByCheck[CheckId_y] || 'site',
                response.url,
                response.responseText,
                new Date().getTime()
            );
        }

        if (isLive && !useProxy && PlayHLS_AdFilterOn() && !PlayHLS_IsPrewarmCheck(CheckId_y)) {
            //Before starting playback check that the stream is not serving a preroll; when it is,
            //a token with an alternate player type often gets an ad free playlist for the same
            //stream (the retry happens before playback, never mid stream). A prewarm resolve
            //never probes or ladders — it only fills the cache, the open flow re-validates
            //when it plays, and a ladder here would also schedule the quality restore reload
            //of whatever is playing on the prewarm's behalf
            if (PlayHLS_AdCheckOrRetry(result, checkResult, check_1, check_3, check_5, callBackSuccess)) {
                return;
            }
        }
    }

    // prettier-ignore
    eval(callBackSuccess)(// jshint ignore:line
        result,
       parseInt(CheckId_x),
       parseInt(CheckId_y)
    );

}

//Whether the ad blocking setting is enabled
function PlayHLS_AdFilterOn() {
    return typeof Settings_value !== 'undefined' && Settings_Obj_default('ad_filter') === 1;
}

/**
 * Probes every variant of the just fetched master playlist for ad content, asynchronously;
 * returns true when the caller must wait for the probe (the flow continues from
 * PlayHLS_AdProbeResult), false when playback can proceed with the current result.
 *
 * Ads are stitched per variant and any subset of them can carry the break while the others
 * look clean, so the whole variant list has to be checked, not only the one to be played.
 */
function PlayHLS_AdCheckOrRetry(result, checkResult, check_1, check_3, check_5, callBackSuccess) {
    var responseObj = JSON.parse(result);
    var variants = PlayHLS_VariantUrls(responseObj.responseText);
    var state = PlayHLS_AdRetryStates[checkResult];

    if (!variants.length) {
        if (state) delete PlayHLS_AdRetryStates[checkResult];

        return false;
    }

    if (!state) {
        state = PlayHLS_AdRetryStates[checkResult] = {
            original: result,
            attempt: 0,
            current: result
        };
    } else {
        state.current = result;
    }

    //The autoplay (360p) escape is the last resort, accept its playlist without probing and
    //schedule a restore of the quality once the ad break is over
    if (state.attempt >= 3) {
        PlayHLS_AdLog('accepting the autoplay playlist without probing');

        delete PlayHLS_AdRetryStates[checkResult];
        PlayHLS_AdScheduleRestore();
        PlayHLS_AdRetryFinish(result, check_5, checkResult, callBackSuccess);

        return true;
    }

    state.variants = variants;

    PlayHLS_AdLog('probing for ads, player type attempt ' + state.attempt + ' (' + variants.length + ' variants)');

    OSInterface_XmlHttpGetFull(
        variants[0], //String urlString
        DefaultHttpGetTimeout, //int timeout
        null, //String postMessage
        null, //String Method
        null, //String JsonHeadersArray
        'PlayHLS_AdProbeResult', //String callback
        checkResult, //long checkResult
        check_1, //String check_1 isLive
        '0', //String check_2 useProxy (the probe never uses a proxy)
        check_3, //String check_3 channel
        '1', //String check_4 probe slot (1-based variant index)
        check_5, //String check_5 CheckId_x
        callBackSuccess, //String callBackSuccess
        null //String callBackError
    );

    return true;
}

function PlayHLS_AdProbeResult(result, checkResult, check_1, check_2, check_3, check_4, check_5, callBackSuccess) {
    var state = PlayHLS_AdRetryStates[checkResult];

    //Not a probe of this flow (stale or marked otherwise), ignore it
    if (typeof state === 'undefined' || state === null) return;

    var slot = parseInt(check_4, 10);

    if (isNaN(slot) || slot < 1) return;

    var live = check_1 === '1' && check_2 !== '1';
    var status = 0;
    var hasAds = false;

    try {
        var response = JSON.parse(result);

        //'#EXT-X-CUE-OUT' is the SCTE-35 bracket some edge nodes emit without the
        //'stitched' DATERANGE, so a pure-SCTE pod must still count as ads
        status = response.status;
        hasAds =
            live &&
            status === 200 &&
            (Main_A_includes_B(response.responseText, 'stitched') ||
                Main_A_includes_B(response.responseText, 'Amazon|') ||
                Main_A_includes_B(response.responseText, '#EXT-X-CUE-OUT'));
    } catch (error) {
        hasAds = false;
    }

    PlayHLS_AdLog('probe variant ' + slot + '/' + state.variants.length + ' http ' + status + (hasAds ? ' found ads' : ' no ads'));

    if (!hasAds && slot < state.variants.length) {
        OSInterface_XmlHttpGetFull(
            state.variants[slot], //String urlString (slot is 1-based)
            DefaultHttpGetTimeout, //int timeout
            null, //String postMessage
            null, //String Method
            null, //String JsonHeadersArray
            'PlayHLS_AdProbeResult', //String callback
            checkResult, //long checkResult
            check_1, //String check_1 isLive
            '0', //String check_2 useProxy (the probe never uses a proxy)
            check_3, //String check_3 channel
            String(slot + 1), //String check_4 next probe slot
            check_5, //String check_5 CheckId_x
            callBackSuccess, //String callBackSuccess
            null //String callBackError
        );

        return;
    }

    if (!hasAds) {
        //Ad free (or unknowable), play this playlist
        var current = state.current;

        delete PlayHLS_AdRetryStates[checkResult];

        PlayHLS_AdRetryFinish(current, check_5, checkResult, callBackSuccess);
        return;
    }

    state.attempt++;

    if (state.attempt > 3) {
        //No ad free token found, play the latest playlist (the preroll plays, but without
        //any playback error thanks to the apk side filter fail open)
        var playlistResult = state.current;

        delete PlayHLS_AdRetryStates[checkResult];

        PlayHLS_AdLog('no ad free player type found, playing with ads');
        PlayHLS_AdRetryFinish(playlistResult, check_5, checkResult, callBackSuccess);
        return;
    }

    //Retry the token with an alternate player type ("embed", "popout" and last "autoplay",
    //the 360p one), those often get playlists without the current ad stitched in
    var playerType = state.attempt === 1 ? 'embed' : state.attempt === 2 ? 'popout' : 'autoplay';
    PlayHLS_AdLog('retrying with the ' + playerType + ' player type');

    //The round's type may already hold a cached master (probed clean within the TTL): serve
    //it and the probe below re-validates its variants, skipping only the token mint. A miss
    //mints the round's fresh session as before. callBackSuccess is the callback name string
    //at this depth, the synth takes it as-is
    if (PlayHLS_MasterCacheGetSynth(check_3, checkResult, parseInt(check_5), callBackSuccess, playerType)) return;

    PlayHLS_AdRetryToken = Play_live_token.replace('"playerType":"site"', '"playerType":"' + playerType + '"');
    PlayHLS_GetToken(true, check_3, checkResult, parseInt(check_5), callBackSuccess, false);
}

//After an autoplay (360p) escape, reload the current stream once the ad break should be over,
//restoring the normal quality (and the normal player type)
var PlayHLS_AdRestoreScheduled = false;
function PlayHLS_AdScheduleRestore() {
    if (PlayHLS_AdRestoreScheduled) return;

    PlayHLS_AdRestoreScheduled = true;
    PlayHLS_AdLog('scheduled a quality restore reload');

    Main_setTimeout(
        function () {
            PlayHLS_AdRestoreScheduled = false;

            if (typeof Play_loadData === 'function' && Play_isOn && !Play_isEndDialogVisible() && Play_data.data.length > 6) {
                PlayHLS_AdLog('running the quality restore reload');
                Play_loadData();
            }
        },
        75000
    );
}

function PlayHLS_AdLog(message) {
    //Main_Log goes through the apk logging bridge, plain console.log never reaches logcat on
    //the Amazon WebView
    Main_Log('[PlayHLS-Ad] ' + message);
}

//Whether a probe response describes a playlist with ad content
/**
 * When a preroll retry is (or was) in flight for this playback load, finishes the flow with the
 * original playlist; returns false when there is nothing to fall back to (the caller proceeds
 * with its normal error handling).
 */
function PlayHLS_AdRetryFinishOriginal(checkResult, CheckId_x, CheckId_y, callBackSuccess) {
    var state = PlayHLS_AdRetryStates[checkResult];

    if (!state || !state.original) return false;

    delete PlayHLS_AdRetryStates[checkResult];

    PlayHLS_AdRetryFinish(state.original, CheckId_x, CheckId_y, callBackSuccess);

    return true;
}

function PlayHLS_AdRetryFinish(result, CheckId_x, CheckId_y, callBackSuccess) {
    // prettier-ignore
    eval(callBackSuccess)(// jshint ignore:line
        result,
        parseInt(CheckId_x),
        parseInt(CheckId_y)
    );
}

//All variant urls of a master playlist, in master order and without duplicates. Ads can be
//stitched into any subset of the variants, so every one of them has to be checked
function PlayHLS_VariantUrls(playlist) {
    var lines = playlist.split('\n');
    var urls = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();

        if (line.indexOf('http') === 0 && urls.indexOf(line) === -1) urls.push(line);
    }

    return urls;
}

function PlayHLS_CheckProxyResultFail(responseText) {
    if (Main_A_includes_B(responseText, 'not_found: transcode does not exist')) {
        return false;
    }

    proxy_fail_counter++;

    return true;
}

function PlayHLS_GetPlayListSync(isLive, Channel_or_VOD_Id) {
    //if at te end of a request the values are different we have a issues
    proxy_fail_counter_checker = proxy_fail_counter;

    try {
        return PlayHLS_GetPlayListSyncToken(isLive, Channel_or_VOD_Id, use_proxy);
    } catch (error) {
        console.log(error);
    }

    return null;
}

function PlayHLS_GetPlayListSyncToken(isLive, Channel_or_VOD_Id, useProxy) {
    var tokenObj, Token, Sig;

    if (useProxy && isLive && !proxy_has_token) {
        return PlayHLS_GetPlayListSyncUrl(isLive, Channel_or_VOD_Id, true);
    } else {
        //getToken
        var obj = OSInterface_mMethodUrlHeaders(
            PlayClip_BaseUrl, //urlString
            DefaultHttpGetTimeout / 2, //timeout
            (isLive ? Play_live_token : Play_vod_token).replace('%x', Channel_or_VOD_Id), //postMessage
            'POST', //Method
            0, //checkResult
            Play_Headers //JsonHeadersArray
        );

        if (obj) {
            var response = JSON.parse(obj);
            if (response && response.status === 200) {
                var tokenResult = JSON.parse(response.responseText);

                if (tokenResult.data && tokenResult.data[isLive ? Play_live_token_prop : Play_vod_token_prop]) {
                    tokenObj = tokenResult.data[isLive ? Play_live_token_prop : Play_vod_token_prop];
                    Token = tokenObj.value;
                    Sig = tokenObj.signature;

                    return PlayHLS_GetPlayListSyncUrl(isLive, Channel_or_VOD_Id, useProxy, Token, Sig, tokenObj);
                }
            }
        }
    }
    return null;
}

function PlayHLS_GetPlayListSyncUrl(isLive, Channel_or_VOD_Id, useProxy, Token, Sig, tokenObj) {
    var urlObj = PlayHLS_GetPlayListUrl(isLive, Channel_or_VOD_Id, Token, Sig, useProxy);

    var obj = OSInterface_mMethodUrlHeaders(
        urlObj.url, //urlString
        DefaultHttpGetTimeout / 2, //timeout
        null, //postMessage
        null, //Method
        0, //checkResult
        urlObj.headers ? urlObj.headers : null //JsonHeadersArray
    );

    if (obj) {
        var response = JSON.parse(obj);

        if (response) {
            if (response.status === 200) {
                return obj;
            } else {
                //in case we fail using proxy restart the process without using proxy
                if (isLive && useProxy && PlayHLS_CheckProxyResultFail(response.responseText)) {
                    return PlayHLS_GetPlayListSyncToken(isLive, Channel_or_VOD_Id, false);
                } else {
                    return JSON.stringify({
                        status: PlayHLS_CheckToken(tokenObj) === '1' ? 1 : response.status,
                        responseText: response.responseText,
                        checkResult: response.checkResult
                    });
                }
            }
        }
    }

    return null;
}
