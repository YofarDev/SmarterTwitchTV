/* Master playlist cache + prewarm: a repeat live open within the TTL starts from the cached
 * master (no token mint, no usher fetch), the prewarm gate resolves a channel at most once per
 * interval, failures back off, and the ad escape reload keeps bypassing the cache. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('app/specific/PlayHLS.js', 'utf8');
let passed = 0;
function checkEqual(value, expected, label) {
    assert.strictEqual(value, expected, label + ' (got ' + JSON.stringify(value) + ')');
    passed++;
}

const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://host/v1/playlist/v1.m3u8\n';
const masterUrl = 'https://usher.ttvnw.net/api/channel/hls/chan.m3u8?token=x&sig=y';

function makeSandbox() {
    const s = {
        OSInterface_calls: [],
        logs: [],
        Main_IsOn_OSInterface: true
    };

    s.OSInterface_XmlHttpGetFull = function () {
        const call = {url: arguments[0], args: [].slice.call(arguments)};
        s.OSInterface_calls.push(call);
        s.lastCall = call;
        return call;
    };
    s.DefaultHttpGetTimeout = 20000;
    s.Main_Log = function (message) {
        s.logs.push(message);
    };
    s.Main_A_includes_B = function (a, b) {
        return String(a).indexOf(b) !== -1;
    };
    s.Main_setTimeout = function (fn) {
        return fn;
    };
    s.Main_clearTimeout = function () {};
    s.PlayClip_BaseUrl = 'https://gql.twitch.tv/gql';
    s.Play_Headers = '[]';

    //Named declarations (not property-assigned expressions): PlayHLS_GetPlayListAsync hands
    //the callback to the Java bridge as callBackSuccess.name
    s.testCallback = function testCallback(result, x, y) {
        s.finished = result;
        s.finishedX = x;
        s.finishedY = y;
    };
    s.prewarmCallback = function prewarmCallback(result) {
        s.prewarmFinished = result;
    };

    vm.createContext(s);
    vm.runInContext(source, s);

    return s;
}

//Answer the newest request as the token GQL post (respondToken) or the master GET (respondMaster)
function respondToken(s, tokenValue) {
    const call = s.lastCall;
    assert.ok(String(call.args[2]).indexOf('playerType') !== -1, 'token post expected, got ' + call.url);
    s[call.args[5]](
        JSON.stringify({
            status: 200,
            responseText: JSON.stringify({
                data: {streamPlaybackAccessToken: {value: tokenValue || '{"chansub":{}}', signature: 'sig'}}
            })
        }),
        call.args[6],
        call.args[7],
        call.args[8],
        call.args[9],
        call.args[10],
        call.args[11],
        call.args[12]
    );
}

function respondMaster(s, status, responseText, url) {
    const call = s.lastCall;
    assert.ok(String(call.url).indexOf('usher.ttvnw.net') !== -1, 'usher master request expected, got ' + call.url);
    s[call.args[5]](
        JSON.stringify({status: status, responseText: responseText, url: url || masterUrl}),
        call.args[6],
        call.args[7],
        call.args[8],
        call.args[9],
        call.args[10],
        call.args[11],
        call.args[12]
    );
}

function startLoad(s, channel, checkId) {
    return s.PlayHLS_GetPlayListAsync(true, channel || 'chan', checkId || 1000, null, s.testCallback);
}

//First load mints a token and fetches the master; the master gets cached
(function () {
    const s = makeSandbox();
    startLoad(s);
    checkEqual(s.lastCall.url, 'https://gql.twitch.tv/gql', 'cold load mints a token');
    respondToken(s);
    checkEqual(String(s.lastCall.url).indexOf('usher.ttvnw.net') !== -1, true, 'master fetched after the token');
    respondMaster(s, 200, master);
    checkEqual(s.finished && JSON.parse(s.finished).status, 200, 'first load handed to playback');

    //Second load within the TTL: no request at all, the cached master serves through the
    //same result path (probe chain and guards included)
    startLoad(s, 'chan', 1001);
    checkEqual(s.OSInterface_calls.length, 2, 'warm load makes no request');
    checkEqual(JSON.parse(s.finished).status, 200, 'warm load handed to playback');
    checkEqual(JSON.parse(s.finished).checkResult, 1001, 'warm load carries its own check id');
    checkEqual(s.finishedY, 1001, 'warm load check id reaches the callback');
    checkEqual(s.logs.some(function (l) {
        return l.indexOf('master cache hit') !== -1;
    }), true, 'warm load logs the cache hit');
})();

//Cache respects the TTL: a fresh open after expiry mints again
(function () {
    const s = makeSandbox();
    startLoad(s);
    respondToken(s);
    respondMaster(s, 200, master);

    //Age the entry past the TTL by putting older, different content directly (identical
    //content keeps its original fetch time, so it has to differ to overwrite)
    s.PlayHLS_CachePut('chan', 'site', masterUrl, master + '#EXT-X-STREAM-INF:BANDWIDTH=9\n', new Date().getTime() - 91000);
    startLoad(s, 'chan', 1002);
    checkEqual(s.lastCall.url, 'https://gql.twitch.tv/gql', 'expired cache mints a fresh token');
})();

//Identical content re-put keeps the original fetch time, so repeat hits never extend the TTL
(function () {
    const s = makeSandbox();
    const old = new Date().getTime() - 80000;
    s.PlayHLS_CachePut('chan', 'site', masterUrl, master, old);
    startLoad(s, 'chan', 1003);
    checkEqual(s.OSInterface_calls.length, 0, 'cache hit makes no request');

    //The hit must not have refreshed the fetch time: aging the entry to 89s still serves it,
    //but at 91s (11s after the hit) it must be a miss — a refreshed entry would still be fresh
    s.PlayHLS_CachePut('chan', 'site', masterUrl, master + '#EXT-X-STREAM-INF:BANDWIDTH=9\n', new Date().getTime() - 89000);
    checkEqual(s.PlayHLS_CacheGet('chan', 'site', new Date().getTime()) !== null, true, '89s old entry still fresh');
    s.PlayHLS_CachePut('chan', 'site', masterUrl, master + '#EXT-X-STREAM-INF:BANDWIDTH=8\n', new Date().getTime() - 91000);
    startLoad(s, 'chan', 1004);
    checkEqual(s.lastCall.url, 'https://gql.twitch.tv/gql', 'hit did not refresh the TTL');
})();

//The prewarm gate resolves a channel at most once per interval, and a warm channel is skipped
(function () {
    const s = makeSandbox();
    s.PlayHLS_Prewarm('chan');
    checkEqual(s.OSInterface_calls.length, 1, 'cold prewarm resolves');
    checkEqual(String(s.lastCall.args[12]), 'PlayHLS_PrewarmResult', 'prewarm uses its result handler');
    s.PlayHLS_Prewarm('chan');
    s.PlayHLS_Prewarm('CHAN');
    checkEqual(s.OSInterface_calls.length, 1, 'repeat prewarms within the interval are gated (case-insensitive)');

    //A fresh cache also satisfies the prewarm without a request
    const s2 = makeSandbox();
    startLoad(s2);
    respondToken(s2);
    respondMaster(s2, 200, master);
    s2.PlayHLS_Prewarm('chan');
    checkEqual(s2.OSInterface_calls.length, 2, 'warm channel prewarm makes no request');
})();

//Prewarm requests use the internal PlayHLS_PrewarmResult handler, and a failed resolve
//(404) records the failure so the next open re-mints instead of trusting a dropped cache
(function () {
    const s = makeSandbox();
    s.PlayHLS_Prewarm('chan');
    checkEqual(String(s.lastCall.args[12]), 'PlayHLS_PrewarmResult', 'prewarm uses its result handler');
    checkEqual(s.OSInterface_calls.length, 1, 'cold prewarm resolves once');
    respondToken(s);
    respondMaster(s, 404, 'gone');
    checkEqual(Object.keys(s.PlayHLS_MasterCacheFail).length, 1, 'prewarm failure recorded');

    //Within the failure backoff a new open must not trust the cache: it requests again
    startLoad(s, 'chan', 1005);
    checkEqual(s.lastCall.url, 'https://gql.twitch.tv/gql', 'failed channel re-mints on the next open');
})();

//A 403 backs off only the channel that failed; another channel's cache is untouched
(function () {
    const s = makeSandbox();
    startLoad(s);
    respondToken(s);
    respondMaster(s, 200, master);
    checkEqual(s.OSInterface_calls.length, 2, 'warm');

    startLoad(s, 'other', 1007); //cold channel
    respondToken(s);
    respondMaster(s, 403, 'forbidden');

    //'other' is now backed off: an open for it goes to the network again...
    startLoad(s, 'other', 1008);
    checkEqual(s.lastCall.url, 'https://gql.twitch.tv/gql', 'backed-off channel re-mints');
    checkEqual(String(s.lastCall.args[6]), '1008', 'the retry carries the new check id');

    //...while 'chan' is still served from its cache with no request
    const before = s.OSInterface_calls.length;
    startLoad(s, 'chan', 1009);
    checkEqual(s.OSInterface_calls.length, before, 'unrelated channel keeps its cache');
    checkEqual(JSON.parse(s.finished).checkResult, 1009, 'cache hit carries its own check id');
})();

//The ad escape reload (explicit retry token) bypasses the cache and mints its own session
(function () {
    const s = makeSandbox();
    startLoad(s);
    respondToken(s);
    respondMaster(s, 200, master);

    s.PlayHLS_AdRetryToken = s.Play_live_token.replace('"playerType":"site"', '"playerType":"embed"');
    startLoad(s, 'chan', 1009);
    checkEqual(s.lastCall.url, 'https://gql.twitch.tv/gql', 'ad escape ignores the cache');
    checkEqual(String(s.lastCall.args[2]).indexOf('"playerType":"embed"') !== -1, true, 'ad escape posts the embed token');
    s.PlayHLS_AdRetryToken = null;

    //And its result is cached under the embed type, not overwriting the site entry
    respondToken(s);
    checkEqual(String(s.lastCall.url).indexOf('usher.ttvnw.net') !== -1, true, 'escape fetches its own master');
    respondMaster(s, 200, master);
    checkEqual(s.PlayHLS_CacheGet('chan', 'embed', new Date().getTime()) !== null, true, 'embed master cached under embed');
    checkEqual(s.PlayHLS_CacheGet('chan', 'site', new Date().getTime()) !== null, true, 'site entry untouched');
})();

//Proxy flows never touch the cache
(function () {
    const s = makeSandbox();
    s.use_proxy = true;
    startLoad(s);
    checkEqual(String(s.lastCall.url).indexOf('usher') === -1, true, 'proxy load goes to the proxy');
    //A cache write must not happen for a proxy result: feed a 200 through the result handler
    s.PlayHLS_PlayListUrlResult(
        JSON.stringify({status: 200, responseText: master, url: 'https://proxy/playlist'}),
        1010,
        '1',
        '1',
        'chan',
        '0',
        null,
        'testCallback'
    );
    checkEqual(s.PlayHLS_CacheGet('chan', 'site', new Date().getTime()) === null, true, 'proxy result is not cached');
})();

//Cache caps at the configured entry count, oldest evicted first
(function () {
    const s = makeSandbox();
    const now = new Date().getTime();
    for (let i = 0; i < s.PlayHLS_CacheMax + 4; i++) s.PlayHLS_CachePut('chan' + i, 'site', 'u' + i, master, now);
    checkEqual(Object.keys(s.PlayHLS_MasterCache).length, s.PlayHLS_CacheMax, 'cache capped');
    checkEqual(s.PlayHLS_CacheGet('chan0', 'site', now) === null, true, 'oldest evicted');
    checkEqual(s.PlayHLS_CacheGet('chan' + (s.PlayHLS_CacheMax + 3), 'site', now) !== null, true, 'newest kept');
})();

console.log(passed + ' prewarm/cache checks passed');
