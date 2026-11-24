/* Ad blocking checks: the apk playlist filter (compiled javac-time like request-dispatcher-tests)
 * and the web pre-playback ad probe chain from PlayHLS.js. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const vm = require('vm');
const assert = require('assert');

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sptv-adfilter-'));
const bin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') + path.sep : '';

try {
    for (const [command, args] of [
        [
            'javac',
            [
                '--release',
                '8',
                '-d',
                output,
                'apk/app/src/main/java/com/fgl27/twitch/DataSource/AdPlaylistFilter.java',
                'release/scripts/java/android/net/Uri.java',
                'release/scripts/java/android/util/Log.java',
                'release/scripts/java/com/google/common/io/ByteStreams.java',
                'release/scripts/java/AdPlaylistFilterTest.java'
            ]
        ],
        ['java', ['-cp', output, 'com.fgl27.twitch.DataSource.AdPlaylistFilterTest']]
    ]) {
        const result = spawnSync(bin + command, args, {encoding: 'utf8'});
        if (result.stderr) process.stderr.write(result.stderr);
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(command + ' failed with exit ' + result.status + ': ' + result.stdout);
        if (result.stdout) process.stdout.write(result.stdout);
    }
} finally {
    fs.rmSync(output, {recursive: true, force: true});
}

/* Web probe chain: every variant of the master must be checked before playback, a dirty
 * variant rotates the player type instead of starting playback. */
const source = fs.readFileSync('app/specific/PlayHLS.js', 'utf8');
let passed = 0;
function checkEqual(value, expected, label) {
    assert.strictEqual(value, expected, label + ' (got ' + JSON.stringify(value) + ')');
    passed++;
}

function makeSandbox() {
    const s = {
        OSInterface_calls: [],
        timeouts: [],
        logs: []
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
        s.timeouts.push(fn);
    };
    //globals only referenced by the retry rotation handoff (PlayHLS_GetToken)
    s.PlayClip_BaseUrl = 'https://gql.twitch.tv/gql';
    s.Play_Headers = '[]';
    s.testCallback = function (result) {
        s.finished = result;
    };

    vm.createContext(s);
    vm.runInContext(source, s);

    return s;
}

//Respond to the newest request as if it were a variant playlist probe
function respondProbe(s, ads) {
    const call = s.lastCall;
    assert.ok(call, 'probe request expected');
    const text = ads ? '#EXTM3U\n#EXTINF:2.000,Amazon|123\nhttps://host/ad.ts\n' : '#EXTM3U\n#EXTINF:2.000,live\nhttps://host/live.ts\n';
    //callback(result, checkResult, check_1..check_5, callBackSuccess)
    s[call.args[5]](
        JSON.stringify({status: 200, responseText: text}),
        call.args[6],
        call.args[7],
        call.args[8],
        call.args[9],
        call.args[10],
        call.args[11],
        call.args[12]
    );
}

const master =
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://host/v1/playlist/v1.m3u8\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=2\nhttps://host/v1/playlist/v2.m3u8\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=3\nhttps://host/v1/playlist/v3.m3u8\n';
const masterResult = JSON.stringify({status: 200, responseText: master, checkResult: 'x'});

function startProbe(s) {
    return s.PlayHLS_AdCheckOrRetry(masterResult, 'chk', '1', 'chan', '9', 'testCallback');
}

//All variants clean: every variant is probed in order, then playback proceeds
(function () {
    const s = makeSandbox();
    checkEqual(startProbe(s), true, 'clean flow: caller waits for the probe');
    checkEqual(s.lastCall.url, 'https://host/v1/playlist/v1.m3u8', 'probe starts at the first variant');
    checkEqual(s.lastCall.args[10], '1', 'probe slot is 1-based');
    respondProbe(s, false);
    checkEqual(s.lastCall.url, 'https://host/v1/playlist/v2.m3u8', 'second variant probed after a clean first');
    checkEqual(s.lastCall.args[10], '2', 'probe slot advances');
    respondProbe(s, false);
    checkEqual(s.lastCall.url, 'https://host/v1/playlist/v3.m3u8', 'third variant probed after a clean second');
    respondProbe(s, false);
    checkEqual(s.finished, masterResult, 'clean master handed to playback');
    checkEqual(s.OSInterface_calls.length, 3, 'no request beyond the variant list');
})();

//A dirty middle variant: probing stops there and the player type rotates
(function () {
    const s = makeSandbox();
    startProbe(s);
    respondProbe(s, false);
    respondProbe(s, true); //v2 carries ads
    checkEqual(s.lastCall.url, 'https://gql.twitch.tv/gql', 'dirty variant hands off to the token retry');
    checkEqual(String(s.lastCall.args[2]).indexOf('"playerType":"embed"') !== -1, true, 'retry rotates to the embed player type');
    checkEqual(s.finished, undefined, 'playback did not start on a dirty master');
    checkEqual(s.OSInterface_calls.length, 3, 'variants after the dirty one are not probed');
})();

//The autoplay (360p) last resort is accepted without probing
(function () {
    const s = makeSandbox();
    s.PlayHLS_AdRetryStates['chk'] = {original: masterResult, attempt: 3, current: masterResult};
    checkEqual(startProbe(s), true, 'autoplay flow takes over the caller');
    checkEqual(s.lastCall, undefined, 'autoplay master is not probed');
    checkEqual(s.finished, masterResult, 'autoplay master handed to playback');
    checkEqual(s.timeouts.length, 1, 'quality restore scheduled');
})();

//Stale or malformed probe results are ignored
(function () {
    const s = makeSandbox();
    startProbe(s);
    const before = s.OSInterface_calls.length;
    s.PlayHLS_AdProbeResult('{}', 'chk', '1', '0', 'chan', '0', '9', 'testCallback'); //slot 0
    s.PlayHLS_AdProbeResult('{}', 'chk', '1', '0', 'chan', 'x', '9', 'testCallback'); //not a number
    s.PlayHLS_AdProbeResult('{}', 'other', '1', '0', 'chan', '1', '9', 'testCallback'); //unknown flow
    checkEqual(s.OSInterface_calls.length, before, 'stale results trigger no follow-up request');
    checkEqual(s.finished, undefined, 'stale results never start playback');
})();

//A master without variant urls skips probing entirely
(function () {
    const s = makeSandbox();
    const noVariants = JSON.stringify({status: 200, responseText: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n', checkResult: 'x'});
    checkEqual(s.PlayHLS_AdCheckOrRetry(noVariants, 'chk2', '1', 'chan', '9', 'testCallback'), false, 'no variants: caller proceeds');
})();

//A pure SCTE-35 pod (CUE-OUT bracket without any 'stitched' DATERANGE) counts as ads: the
//probe must rotate the player type instead of passing the playlist through as clean
(function () {
    const s = makeSandbox();
    const cueMaster = JSON.stringify({
        status: 200,
        responseText: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://host/cue.m3u8\n',
        checkResult: 'x'
    });
    checkEqual(s.PlayHLS_AdCheckOrRetry(cueMaster, 'chkCue', '1', 'chan', '9', 'testCallback'), true, 'cue flow: caller waits');
    const call = s.lastCall;
    assert.ok(call, 'probe request expected');
    s[call.args[5]](
        JSON.stringify({status: 200, responseText: '#EXTM3U\n#EXT-X-CUE-OUT:30\n#EXTINF:2.000,Amazon\nhttps://host/ad.ts\n'}),
        call.args[6],
        call.args[7],
        call.args[8],
        call.args[9],
        call.args[10],
        call.args[11],
        call.args[12]
    );
    checkEqual(s.lastCall.url, 'https://gql.twitch.tv/gql', 'pure CUE-OUT pod hands off to the token retry');
    checkEqual(String(s.lastCall.args[2]).indexOf('"playerType":"embed"') !== -1, true, 'CUE-OUT rotates to the embed player type');
    checkEqual(s.finished, undefined, 'CUE-OUT master was not handed to playback');
})();

console.log(passed + ' ad probe checks passed');
