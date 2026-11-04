/* TwitchNoSub fallback checks: seekPreviewsURL parsing, CDN url building and the generated
 * master playlist must stay parseable by the app's own quality extractor. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const UglifyJS = require('uglify-js');

let passed = 0;
function checkEqual(value, expected, label) {
    assert.strictEqual(value, expected, label + ' (got ' + JSON.stringify(value) + ')');
    passed++;
}

const moduleSource = fs.readFileSync('app/specific/PlayVodNoSub.js', 'utf8');
const playSource = fs.readFileSync('app/specific/Play.js', 'utf8');
const wanted = /^Play_extract(Qualities|Band|Codec)$/;
const definitions = [];

UglifyJS.parse(playSource).walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_Defun && wanted.test(node.name.name)) definitions.push(node.print_to_string());
    })
);

if (definitions.length !== 3) throw new Error('Play_extractQualities helpers not found');

const sandbox = {
    Main_IsOn_OSInterface: true,
    PlayVod_isOn: true,
    Main_values: {ChannelVod_vodId: '123456789'},
    Main_Log: () => {},
    PlayClip_BaseUrl: 'https://gql.twitch.tv/gql',
    Play_base_backup_headers_Array: [],
    DefaultHttpGetTimeout: 20000,
    FullxmlHttpGet: () => {},
    OSInterface_XmlHttpGetFull: () => {},
    PlayVod_loadDataSuccessEnd: () => {},
    PlayVod_NotSub: () => {},
    PlayVod_autoUrl: '',
    Main_A_includes_B: (a, b) => (a ? a.indexOf(b) !== -1 : false),
    STR_SOURCE: 'Source',
    parseInt: parseInt,
    parseFloat: parseFloat,
    Math: Math
};

vm.createContext(sandbox);
vm.runInContext(moduleSource + '\n' + definitions.join('\n'), sandbox);

// seekPreviewsURL parsing
const parsed = sandbox.PlayVodNoSub_ParseSeekPreviews(
    'https://vod-storyboards.twitch.tv/abc_strippin_123_456/storyboards/123-strip-0.jpg'
);
checkEqual(parsed.domain, 'vod-storyboards.twitch.tv', 'seekPreviews domain');
checkEqual(parsed.vodSpecialID, 'abc_strippin_123_456', 'seekPreviews special id');
checkEqual(sandbox.PlayVodNoSub_ParseSeekPreviews('https://example.com/nope.jpg'), null, 'seekPreviews without storyboards');

// CDN urls
const archive = {
    vodId: '123456789',
    domain: 'vod-storyboards.twitch.tv',
    vodSpecialID: 'abc_strippin_123_456',
    broadcastType: 'archive',
    login: 'strippin',
    oldUpload: false
};
checkEqual(
    sandbox.PlayVodNoSub_PlaylistUrl(archive, '720p60'),
    'https://vod-storyboards.twitch.tv/abc_strippin_123_456/720p60/index-dvr.m3u8',
    'archive url'
);
checkEqual(
    sandbox.PlayVodNoSub_PlaylistUrl(Object.assign({}, archive, {broadcastType: 'highlight'}), '720p60'),
    'https://vod-storyboards.twitch.tv/abc_strippin_123_456/720p60/highlight-123456789.m3u8',
    'highlight url'
);
checkEqual(
    sandbox.PlayVodNoSub_PlaylistUrl(Object.assign({}, archive, {broadcastType: 'upload', oldUpload: true}), '720p60'),
    'https://vod-storyboards.twitch.tv/strippin/123456789/abc_strippin_123_456/720p60/index-dvr.m3u8',
    'old upload url'
);
checkEqual(
    sandbox.PlayVodNoSub_PlaylistUrl(Object.assign({}, archive, {broadcastType: 'upload', oldUpload: false}), '720p60'),
    'https://vod-storyboards.twitch.tv/abc_strippin_123_456/720p60/index-dvr.m3u8',
    'new upload url'
);

// Full chain with a fake GQL response and fake probes: chunked and 720p60 are valid,
// the rest fail, and the generated playlist must be readable by Play_extractQualities.
let gqlCalls = 0;
sandbox.FullxmlHttpGet = function (url, headers, success, error, key, requestId) {
    gqlCalls++;
    success(
        {
            status: 200,
            responseText: JSON.stringify({
                data: {
                    video: {
                        broadcastType: 'ARCHIVE',
                        createdAt: '2024-01-01T00:00:00Z',
                        seekPreviewsURL: 'https://vod-storyboards.twitch.tv/abc_strippin_123_456/storyboards/123-strip-0.jpg',
                        creator: {login: 'strippin'}
                    }
                }
            })
        },
        key,
        requestId
    );
};

sandbox.OSInterface_XmlHttpGetFull = function (url, timeout, post, method, headers, callback, requestId, check_1, check_2) {
    const index = parseInt(check_1, 10);
    let status = 403;
    let body = '';

    if (check_2 === 'init') {
        status = 200;
        body = 'hev1';
    } else if (index === 0) {
        status = 200;
        body = '#EXTM3U\n#EXTINF:4.0,\nhttps://cdn/segment.ts';
    } else if (index === 3) {
        status = 200;
        body = '#EXTM3U\n#EXTINF:4.0,\nhttps://cdn/segment.mp4';
    }

    sandbox.PlayVodNoSub_ProbeResult(JSON.stringify({status: status, responseText: body}), requestId, check_1, check_2);
};

let captured = null;
let failed = false;
sandbox.PlayVod_loadDataSuccessEnd = function (playlist) {
    captured = playlist;
};
sandbox.PlayVodNoSub_Try(function () {
    failed = true;
});

checkEqual(failed, false, 'fallback did not fail');
checkEqual(gqlCalls, 1, 'one GQL request');
checkEqual(!!captured, true, 'playlist captured');
checkEqual(sandbox.PlayVod_autoUrl, 'https://usher.ttvnw.net/vod/123456789.m3u8', 'synthetic master url');
checkEqual(captured.indexOf('#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked"') > -1, true, 'chunked media line');
checkEqual(captured.indexOf('NAME="1080p60 (source)"') > -1, true, 'source name');
checkEqual(captured.indexOf('#EXT-X-STREAM-INF:BANDWIDTH=8534030') > -1, true, 'stream inf line');
checkEqual(captured.indexOf('VIDEO="chunked"') > -1, true, 'video group matches');
checkEqual(captured.indexOf('FRAME-RATE=60') > -1, true, 'frame rate');

const qualities = sandbox.Play_extractQualities(captured);
checkEqual(qualities.length, 2, 'two valid qualities');
checkEqual(qualities[0].resolution, 1080, 'first quality resolution');
checkEqual(qualities[0].url, 'https://vod-storyboards.twitch.tv/abc_strippin_123_456/chunked/index-dvr.m3u8', 'first quality url');
checkEqual(qualities[1].resolution, 720, 'second quality resolution');
checkEqual(qualities[1].url, 'https://vod-storyboards.twitch.tv/abc_strippin_123_456/720p60/index-dvr.m3u8', 'second quality url');

// All probes fail: the caller gets the failure callback and nothing is played.
let failCalled = false;
captured = null;
sandbox.OSInterface_XmlHttpGetFull = function (url, timeout, post, method, headers, callback, requestId, check_1, check_2) {
    sandbox.PlayVodNoSub_ProbeResult(JSON.stringify({status: 403, responseText: ''}), requestId, check_1, check_2);
};
sandbox.PlayVodNoSub_Try(function () {
    failCalled = true;
});
checkEqual(failCalled, true, 'failure callback');
checkEqual(captured, null, 'nothing played when every quality fails');

console.log('vod-nosub: ' + passed + ' checks passed');
