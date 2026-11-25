/* Saved-position fixture: the saved stream list (issue #48) — entry shape, offset anchor,
 * vodid backfill/resolution and the open flow, against production definitions only.
 * No app init, no network. Run after a full build for --built mode. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');

const wanted =
    /^(Main_SavedSetDefaultObj|Main_saved_Add|Main_saved_UpdateLive|Main_saved_UpdateVod|Main_saved_UpdateVodProgress|Main_saved_VodDuration|Main_OPenSavedVod|Main_OPenSavedVodEnd|Main_OPenSavedVodFail|Main_OPenSavedVodRestoreKeys|Main_history_GetById|Main_history_Exist|Main_history_Exist_By_VOD_Id|Main_history_UpdateVodClip|Main_history_UpdateLiveVodDate|Main_Slice|Main_A_includes_B)$/;
const sources = built ? ['release/githubio/js/main_uncompressed.js'] : ['app/specific/Main.js'];
const definitions = [];
for (const file of sources) {
    UglifyJS.parse(fs.readFileSync(file, 'utf8')).walk(
        new UglifyJS.TreeWalker(node => {
            if (node instanceof UglifyJS.AST_Defun && wanted.test(node.name.name)) definitions.push(node.print_to_string());
        })
    );
}
const found = new Set(definitions.map(def => def.match(/function (\w+)/)[1]));
for (const name of wanted.source.replace(/[\^$()]/g, '').split('|'))
    if (!found.has(name)) throw new Error(name + ' not found' + (built ? '; rebuild first' : ''));

let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}

const s = require('./ui-test-sandbox')();
vm.runInContext(definitions.join('\n'), s);
vm.runInContext(fs.readFileSync('app/languages/default.js', 'utf8'), s);
vm.runInContext(fs.readFileSync('app/languages/en_US.js', 'utf8'), s);
vm.runInContext('en_USLang()', s);

/* Store fixture: one user watching a stream that started an hour ago. */
let userSet = true,
    saves = 0,
    openedAs = null,
    warned = '',
    requested = null,
    keysRestored = 0;
const startedAt = new Date(Date.now() - 3600000).toISOString();

s.AddUser_IsUserSet = () => userSet;
s.AddUser_UserIsSet = () => userSet;
s.AddUser_UsernameArray = [{id: '1', name: 'user'}];
s.Main_values_History_data = {'1': {live: [], vod: [], clip: [], saved: [], deleted: {}}};
s.Main_setHistoryItem = () => saves++;
s.Main_helix_api = 'https://api.twitch.tv/helix/';
s.Play_RewindId = {'broadcast-1': 'v111'};
s.Main_values = {Play_isHost: false};
s.Play_data = {data: null};
s.Main_values_Play_data = null;
s.Play_PreviewId = 0;
s.UserLiveFeed_Hide = () => {};
s.Main_history_Watched_Obj = {};
s.Screens_UpdateLiveHistoryUntil = () => {};
s.Main_OPenAsVod = entry => (openedAs = entry);
s.Main_showWarningDialog = text => (warned = text);
s.BaseXmlHttpGet = (url, success, fail) => (requested = {url: url, success: success, fail: fail});
s.Main_addEventListener = (type, fn) => type === 'keydown' && fn === savedKeyFun && keysRestored++;
s.ScreenObj = {};
const savedKeyFun = () => {};
s.ScreenObj[s.Main_HistorySaved] = {histPosX: [0, 0, 0, 0], key_fun: savedKeyFun};
s.ScreenObj[s.Main_HistoryVod] = {histPosX: [0, 0, 0, 0]};
s.ScreenObj[s.Main_HistoryClip] = {histPosX: [0, 0, 0, 0]};
s.ScreenObj[s.Main_HistoryLive] = {histPosX: [0, 0, 0, 0]};

const liveData = [
    'thumb', //0
    'Streamer hosted by Hostee', //1
    'title', //2
    'game', //3
    100, //4
    '7h', //5
    'streamer', //6
    'broadcast-1', //7
    0, //8
    'logo', //9
    1, //10
    'uptime', //11
    startedAt, //12
    21074, //13
    '42', //14
    'Hostee', //15 hosted target name
    'Streamer hosted by Hostee', //16 hosting label
    '', //17
    '7' //18
];

/* 1. Saving records the live cell, the offset anchor and the known VOD id. */
const before = Date.now();
s.Main_saved_Add(liveData);
const after = Date.now();
const entry = s.Main_values_History_data['1'].saved[0];
check(entry && entry.id === 'broadcast-1', 'entry keyed by the broadcast id');
check(entry && entry.forceVod === true, 'entry is a force VOD one');
check(entry && entry.vodid === 'v111', 'known rewind VOD id is stored');
check(entry && entry.name === 'streamer', 'entry name is the login');
check(entry && new Date(entry.created_at).getTime() === new Date(startedAt).getTime(), 'entry anchors created_at');
check(entry && entry.date >= before && entry.date <= after, 'entry date is the save moment (the offset anchor)');
check(saves === 1, 'save persists via Main_setHistoryItem');
check(entry.data[7] === 'broadcast-1' && entry.data[12] === startedAt, 'entry carries a copy of the cell data');

/* 2. Saving again updates the entry instead of duplicating. */
s.Main_values_History_data['1'].saved[0].date = 1;
s.Main_saved_Add(liveData);
check(s.Main_values_History_data['1'].saved.length === 1, 're-save does not duplicate');
check(s.Main_values_History_data['1'].saved[0].date > 1, 're-save refreshes the position');
check(saves === 2, 're-save persists');

/* 3. The list is capped at 200, dropping the oldest. */
s.Main_values_History_data['1'].saved = [];
for (let i = 0; i < 200; i++) s.Main_values_History_data['1'].saved.push({id: 'old' + i, date: i, data: liveData.slice()});
s.Main_saved_Add(liveData);
check(s.Main_values_History_data['1'].saved.length === 200, 'list capped at 200');
check(s.Main_values_History_data['1'].saved[0].id === 'old1', 'the oldest entry is dropped');
check(s.Main_values_History_data['1'].saved[199].id === 'broadcast-1', 'the new entry is last');

/* 4. A disabled saved list does not record. */
s.Main_values_History_data['1'].saved = [];
s.ScreenObj[s.Main_HistorySaved].histPosX[1] = 1;
s.Main_saved_Add(liveData);
check(s.Main_values_History_data['1'].saved.length === 0, 'disabled list stores nothing');
s.ScreenObj[s.Main_HistorySaved].histPosX[1] = 0;

/* 5. Watching the stream keeps the position at the live edge; it never creates. */
s.Main_values_History_data['1'].saved = [];
s.Main_saved_UpdateLive(liveData);
check(s.Main_values_History_data['1'].saved.length === 0, 'update never creates an entry');
s.Main_saved_Add(liveData);
s.Main_values_History_data['1'].saved[0].date = 1;
s.Main_saved_UpdateLive(liveData);
check(s.Main_values_History_data['1'].saved[0].date > 1, 'update refreshes the position of the watched stream');
s.Main_saved_UpdateLive(liveData.slice(0, 7).concat(['other', 'b2'], liveData.slice(9)));
check(s.Main_values_History_data['1'].saved[0].id === 'broadcast-1', 'update of another broadcast is ignored');

/* 6. A learned VOD id is backfilled once. */
s.Main_values_History_data['1'].saved = [];
s.Main_saved_Add(liveData);
s.Main_values_History_data['1'].saved[0].vodid = undefined;
s.Main_saved_UpdateVod('broadcast-1', 'v222');
check(s.Main_values_History_data['1'].saved[0].vodid === 'v222', 'vodid backfilled');
s.Main_saved_UpdateVod('broadcast-1', 'v333');
check(s.Main_values_History_data['1'].saved[0].vodid === 'v222', 'an existing vodid is not overwritten');

/* 7. Watching the saved VOD syncs the resume point and drops the finished entry. */
s.Main_values_History_data['1'].saved = [];
s.Main_saved_Add(liveData);
const savedEntry = s.Main_values_History_data['1'].saved[0];
const vodHistory = {id: 'v111', date: 1, watched: 0, data: {7: 'v111', 11: 7200}}; // duration 2h
savedEntry.vodid = 'v111';
s.Main_values_History_data['1'].vod = [vodHistory];

s.Main_saved_UpdateVodProgress('v111', 900);
check(savedEntry.date === new Date(startedAt).getTime() + 900000, 'resume point follows the VOD watch time');

s.Main_saved_UpdateVodProgress('v111', 7000); // > 7200 - 300
check(s.Main_values_History_data['1'].saved.length === 0, 'a nearly finished entry is dropped');

s.Main_values_History_data['1'].saved = [];
s.Main_saved_Add(liveData);
s.Main_values_History_data['1'].saved[0].vodid = 'v111';
s.Main_values_History_data['1'].vod = []; // vod history disabled: duration unknown
s.Main_saved_UpdateVodProgress('v111', 7000);
check(s.Main_values_History_data['1'].saved.length === 1, 'unknown duration keeps the entry');

/* 8. Main_history_UpdateVodClip routes the progress sync for saved entries too. */
s.Main_values_History_data['1'].saved = [];
s.Main_saved_Add(liveData);
s.Main_values_History_data['1'].saved[0].vodid = 'v111';
s.Main_values_History_data['1'].vod = [vodHistory];
s.Main_history_UpdateVodClip('v111', 1000, 'vod');
check(
    s.Main_values_History_data['1'].saved[0].date === new Date(startedAt).getTime() + 1000000,
    'VOD progress updates flow into the saved list'
);
s.Main_values_History_data['1'].vod = [vodHistory];

/* 9. Opening with a known vodid resumes directly. */
openedAs = null;
s.Main_OPenSavedVod(savedEntry);
check(openedAs === savedEntry, 'known vodid opens through Main_OPenAsVod');
check(s.Play_data.data[7] === 'broadcast-1', 'Play_data carries the saved cell');

/* 10. Opening without a vodid resolves the latest archive against the broadcast. */
s.Main_values_History_data['1'].saved = [];
s.Main_saved_Add(liveData);
s.Main_values_History_data['1'].saved[0].vodid = undefined;
const noVodEntry = s.Main_values_History_data['1'].saved[0];
openedAs = null;
s.Main_OPenSavedVod(noVodEntry);
check(openedAs === null, 'nothing opens before the resolution');
check(requested && requested.url === 'https://api.twitch.tv/helix/videos?first=1&user_id=42&type=archive&sort=time', 'resolution fetches the latest archive');

requested.success(JSON.stringify({data: [{id: 'v999', stream_id: 'broadcast-2'}]}));
check(openedAs === null && warned === s.STR_SAVED_VOD_NOT_YET, 'a different broadcast warns VOD not available');
check(keysRestored === 1, 'a different broadcast gives the Saved screen its key handler back');

warned = '';
requested.success(JSON.stringify({data: [{id: 'v999', stream_id: 'broadcast-1'}]}));
check(noVodEntry.vodid === 'v999', 'matching stream_id backfills the vodid');
check(openedAs === noVodEntry, 'a matching VOD opens through Main_OPenAsVod');

requested.fail();
check(warned === s.STR_SAVED_VOD_NOT_YET, 'a resolution failure warns VOD not available');
check(keysRestored === 2, 'a resolution failure gives the Saved screen its key handler back');

keysRestored = 0;
s.Main_OPenSavedVod(null);
check(keysRestored === 1, 'a missing entry gives the Saved screen its key handler back');

/* 11. A hosted cell opens with the hostee name. */
s.Main_values_History_data['1'].saved = [];
s.Main_saved_Add(liveData);
s.Play_data = {data: null};
s.Main_OPenSavedVod(s.Main_values_History_data['1'].saved[0]);
check(s.Play_data.data[1] === 'Hostee', 'hosted cells split to the hostee display name');
check(s.Main_values_Play_data === s.Play_data.data, 'Main_values_Play_data mirrors Play_data.data');

console.log('saved-position-tests: ' + checks + ' checks OK' + (built ? ' (built)' : ''));
