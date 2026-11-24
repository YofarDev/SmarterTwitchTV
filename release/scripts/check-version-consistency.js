/*
 * Fails when the version numbers that must move in lockstep drift apart:
 * - publishVersionCode in app/general/version.js == apk/versions.gradle
 * - ApkUrl in version.js points at that same version code (the same gate
 *   release.yml enforces before publishing, run here for every push/PR)
 *
 * Run by CI (ci.yml) and standalone: node release/scripts/check-version-consistency.js
 */

var fs = require('fs');

function readVersionJs() {
    var text = fs.readFileSync('app/general/version.js', 'utf8');

    return {
        publishVersionCode: text.match(/publishVersionCode:\s*(\d+)/),
        apkUrl: text.match(/ApkUrl:\s*'([^']*)'/)
    };
}

function readVersionsGradle() {
    var text = fs.readFileSync('apk/versions.gradle', 'utf8');

    return {
        publishVersionCode: text.match(/publishVersionCode\s*:\s*(\d+)/)
    };
}

var versionJs = readVersionJs();
var versionsGradle = readVersionsGradle();
var failed = false;

if (!versionJs.publishVersionCode || !versionJs.apkUrl) {
    console.error('could not find publishVersionCode/ApkUrl in app/general/version.js');
    failed = true;
}

if (!versionsGradle.publishVersionCode) {
    console.error('could not find publishVersionCode in apk/versions.gradle');
    failed = true;
}

if (!failed) {
    var webCode = versionJs.publishVersionCode[1];
    var gradleCode = versionsGradle.publishVersionCode[1];

    if (webCode !== gradleCode) {
        console.error(
            'publishVersionCode mismatch: app/general/version.js has ' + webCode + ' but apk/versions.gradle has ' + gradleCode +
            ' — bump both together'
        );
        failed = true;
    }

    if (versionJs.apkUrl[1].indexOf('/' + webCode + '/SmarterPurpleTV_3_0_' + webCode + '.apk') === -1) {
        console.error(
            'ApkUrl in app/general/version.js does not point at version ' + webCode +
            ' (expected .../releases/download/' + webCode + '/SmarterPurpleTV_3_0_' + webCode + '.apk)'
        );
        failed = true;
    }
}

if (failed) process.exit(1);

console.log('version consistency OK (publishVersionCode ' + versionJs.publishVersionCode[1] + ')');
