/*
 * Runs every web test harness that works on a plain Node + JDK runner, so CI and
 * `npm test` share one list. Kept here rather than inlined in the workflow so a
 * new harness only has to be added once.
 *
 * Excluded on purpose:
 * - phonechat-server-tests: compiles against the Android SDK (ANDROID_HOME), not
 *   available on the plain CI runner (release.yml runs it nowhere either).
 * - phonechat-browser-tests: needs the full `playwright` package plus Chrome.
 *
 * The Java-compiling harnesses (ad-filter, request-dispatcher, vod-chat-sync)
 * need a JDK with javac on the PATH; CI sets up Temurin 21 before calling this.
 */

var child = require('child_process');

//Alphabetical, same style as the CI loop in release.yml
var TESTS = [
    'account-navigation',
    'ad-filter',
    'background-screen',
    'channel-points',
    'chat-badge',
    'chat-optimization',
    'emote',
    'emote-update',
    'favorites',
    'following',
    'grid-window',
    'hold-options',
    'home-ui',
    'navigation',
    'phonechat',
    'phonechat-collector',
    'player-feed',
    'player-ui',
    'prewarm',
    'raid',
    'recommended-live',
    'remote-input',
    'request-dispatcher',
    'saved-position',
    'search-navigation',
    'settings-dialog',
    'side-panel',
    'switch-row',
    'ui-focus',
    'update',
    'vod-animated-thumb',
    'vod-chat-sync',
    'vod-logo',
    'vod-nosub'
];

var failed = [];
var started = Date.now();

for (var i = 0; i < TESTS.length; i++) {
    var name = TESTS[i];
    var script = 'release/scripts/' + name + '-tests.js';

    console.log('\n===== ' + name + ' =====');
    var result = child.spawnSync(process.execPath, [script], {stdio: 'inherit'});

    if (result.status !== 0) {
        console.log('FAILED: ' + name + ' (exit ' + result.status + ')');
        failed.push(name);
    }
}

console.log('\n===== done in ' + ((Date.now() - started) / 1000).toFixed(1) + 's =====');

if (failed.length) {
    console.log('failed harnesses: ' + failed.join(', '));
    process.exit(1);
}

console.log('all ' + TESTS.length + ' harnesses passed');
