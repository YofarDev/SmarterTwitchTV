fs = require('fs');

function mWriteFile(path, text, LogMsg) {
    fs.writeFileSync(path, text, function (err) {
        if (err) return console.log(err);
        else if (LogMsg) console.log(LogMsg);
    });
}

//UPdate version.json file use so the app can check for updates
mWriteFile('./release/githubio/version/version.json', JSON.stringify(version), 'Save version.json OK');

//Update the temp Changelog_Up.md, content used to update the main Changelog.md
var changelog = version.changelog,
    len = changelog[0].changes.length,
    i = 0,
    newLine = '\n',
    text = changelog[0].title;

text += newLine + '==============' + newLine + newLine;

for (i; i < len; i++) {
    text += '* ' + changelog[0].changes[i] + newLine;
}

mWriteFile('./apk/Changelog_Up.md', text + newLine);

//Regenerate the APK-releases sections of apk/Changelog.md straight from version.js, so the
//release notes have one source: every changelog entry titled "Month Day Year (Web N / APK M)"
//becomes a "Month Day Year (3.0.M)" section with the same bullets. Everything below the
//legacy marker (pre-fork hand-written sections) is preserved verbatim.
//release.yml's awk parser (find the "(3.0.<code>)" title, print until the next one) keeps
//working because the generated format matches what was hand-written before.
var marker = '<!-- Everything below this line is legacy, kept as written. The generator only manages the sections above. -->';
var header = [
    'Smarter Purple TV latest changes',
    '==============',
    '',
    'Bellow changes are just a resume of all changes made to the repo to check the full changelog list check the [commit list](https://github.com/fgl27/SmartTwitchTV/commits/master).',
    '',
    'The App is divided in two part, **Apk** and **Web** you can check it version in the about of the app:',
    '* The **Apk** is updated via play store it contains the app video player and the basic function that don\u0027t work on the web part of the app.',
    '* The **Web** is update every time that the app is closed and you re-open it (of course if a update is available in the web server), it contains the user interface and related functions. If the app is open and you change apps that process doesn\u0027t closes the app only minimizes it unless the system run out of memory and close the app, to manually close it\u0027s needed to select close on the exit dialog or simply holding the return key to force close it.',
    '',
    'The app has a building update check function, so whenever there is a update a red text will show up bellow the main pages clock, also a short warning will pop on the screen let you know if is a **Apk** or **Web** update.',
    ''
].join(newLine);

var changelogPath = './apk/Changelog.md';
var current = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
var legacy = '';
var markerAt = current.indexOf(marker);

if (markerAt !== -1) {
    legacy = current.substring(markerAt + marker.length);
} else if (current.length) {
    //First run over the old hand-written file: keep only the intro header's legacy tail if
    //the marker is missing but sections exist that the generator cannot map; otherwise the
    //file is fresh or already fully generated
    console.log('Changelog_Up: apk/Changelog.md has no legacy marker, generating from scratch');
}

var apkText = header;

for (i = 0; i < changelog.length; i++) {
    var entry = changelog[i];
    var apkVersion = entry.title.match(/\bAPK (\d+)\)/);

    if (!apkVersion) continue; //web-only release, nothing to mirror

    apkText += newLine + entry.title.replace(/ \(Web \d+ \/ APK \d+\)/, ' (3.0.' + apkVersion[1] + ')') + newLine;
    apkText += '==============' + newLine + newLine;

    for (var c = 0; c < entry.changes.length; c++) {
        apkText += '* ' + entry.changes[c] + newLine;
    }
}

fs.writeFileSync(changelogPath, apkText + newLine + marker + legacy);
console.log('Regenerated apk/Changelog.md APK sections from version.js OK');
