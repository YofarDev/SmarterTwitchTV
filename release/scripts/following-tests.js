/* Production screen request callbacks and focus restoration, including native callback-name routing. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const s = require('./ui-test-sandbox')(),
    requests = [],
    accepted = [];
let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}
s.AddUser_UsernameArray = [{id: 'alex', name: 'alex'}];
s.ScreenObj = {};
s.Main_values = {Main_Go: s.Main_UserLive, Search_data: ''};
s.AddUser_UserHasToken = () => true;
s.Main_Bearer_User_Headers = [];
s.Main_Bearer_Headers = [];
s.Main_OAuth_User_Headers = [];
s.Play_base_backup_headers_Array = [];
s.Main_TwitchV5Flag = '';
s.noop_fun = () => {};
s.FullxmlHttpGet = (...args) => requests.push(args);
s.Screens_concatenate = (response, key) => accepted.push({response, key});
s.Main_ThumbOpenIsNull = () => false;
s.Main_getElementById = () => ({});
s.Screens_addFocus = () => {};
s.Screens_loadDataFail = () => accepted.push('failure');
s.Main_showWarningDialog = () => {};
s.AddCode_validateToken = () => accepted.push('validate');
const obj = {
    set_url() {
        this.url = 'https://fixture.invalid/followed?user_id=' + s.AddUser_UsernameArray[0].id;
    },
    useHelix: true,
    isQuery: false,
    itemsCount: 0,
    DataObj: {},
    posY: 0,
    posX: 0,
    ColumnsCount: 3,
    screenType: 0
};
s.ScreenObj[s.Main_UserLive] = obj;
const wanted = new Set(['Screens_loadDataRequest', 'Screens_HttpResultStatus']);
UglifyJS.parse(
    fs.readFileSync(process.argv.includes('--built') ? 'release/githubio/js/main_uncompressed.js' : 'app/specific/Screens.js', 'utf8')
).walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_Defun && wanted.has(node.name.name)) vm.runInContext(node.print_to_string(), s);
    })
);
s.Navigation_SetAccount('alex');
s.Screens_loadDataRequest(s.Main_UserLive);
const first = requests[0];
check(first[2].name === 'Screens_HttpResultStatus', 'native gets a named callback, not an anonymous closure');
check(typeof first[5] === 'number', 'native checkResult is a serializable request generation');
s.Screens_loadDataRequest(s.Main_UserLive);
first[2]({status: 200, responseText: '{"data":["old"]}'}, first[4], String(first[5]));
check(accepted.length === 0, 'older request discarded after a new request starts');
const second = requests[1];
second[2]({status: 200, responseText: '{"data":["new"]}'}, second[4], String(second[5]));
check(accepted.length === 1 && accepted[0].response.data[0] === 'new', 'latest native response accepted');
s.Screens_loadDataRequest(s.Main_UserLive);
const third = requests[2];
s.AddUser_UsernameArray = [{id: 'morgan', name: 'morgan'}];
third[2]({status: 200, responseText: '{"data":["alex"]}'}, third[4], String(third[5]));
check(accepted.length === 1, 'account change discards old native response');
s.Navigation_SetAccount('morgan');
obj.DataObj = {
    '0_0': ['', 'one', '', '', '', '', '', 'stream-1', false, '', '', '', '', '', 'channel-1'],
    '0_1': ['', 'two', '', '', '', '', '', 'stream-2', false, '', '', '', '', '', 'channel-2']
};
obj.posX = 1;
s.Navigation_Capture(s.Main_UserLive);
obj.DataObj = {'0_0': obj.DataObj['0_1'], '0_1': obj.DataObj['0_0']};
obj.posX = 0;
obj.navigationRestorePending = true;
s.Navigation_Restore(s.Main_UserLive);
check(obj.posX === 0, 'reordered stream resolved by channel identity');
obj.DataObj = {'0_0': obj.DataObj['0_1']};
obj.navigationRestorePending = true;
s.Navigation_Restore(s.Main_UserLive);
check(obj.posX === 0 && obj.posY === 0, 'ended channel falls back to surviving neighbor');
check(!obj.navigationRestorePending, 'restore resolves once');
s.Navigation_SetAccount('other');
check(s.Navigation_Bookmark(s.Main_UserLive, '') === null, 'account switch clears old bookmark');
// A restored identity can jump beyond the virtualizer's adjacent-row window.
s.Main_RemoveElement = cell => {
    if (cell) cell.attached = false;
};
obj.visiblerows = 3;
obj.posY = 8;
obj.offsettop = 12;
obj.navigationRemount = true;
obj.Cells = Array.from({length: 12}, () => ({style: {}, attached: false}));
obj.tableDoc = {
    appendChild(cell) {
        cell.attached = true;
    }
};
obj.ScrollDoc = {style: {}};
s.Navigation_MountRestored(s.Main_UserLive);
check(obj.Cells.filter(cell => cell.attached).length === 3, 'restore keeps bounded virtualized rows');
check(obj.Cells[8].attached && obj.Cells[7].attached && obj.Cells[9].attached, 'restored channel and neighbors mounted');
check(obj.currY === 8 && obj.ScrollDoc.style.transform === 'translateY(-12em)', 'virtualizer cursor and viewport follow restored row');
obj.posY = 11;
obj.navigationRemount = true;
s.Navigation_MountRestored(s.Main_UserLive);
check(
    obj.Cells[10].attached && obj.Cells[11].attached && !obj.Cells[9].attached,
    'last restored row keeps the row above and stays in the visible slot'
);
check(obj.Cells[11].style.transform === 'translateY(12em)', 'last restored row sits in the second window slot');
// A reload renders only its first batch: restoring onto that batch's last row must not pull the
// window back, or the focused row ends up behind the detail band.
obj.Cells = Array.from({length: 10}, () => ({style: {}, attached: false}));
obj.posY = 9;
obj.navigationRemount = true;
s.Navigation_MountRestored(s.Main_UserLive);
check(
    obj.Cells[8].attached && obj.Cells[9].attached && !obj.Cells[7].attached,
    'restore onto the last row of the first batch mounts the row above and the focused row'
);
check(
    obj.Cells[9].style.transform === 'translateY(12em)' && obj.ScrollDoc.style.transform === 'translateY(-12em)',
    'restored row rests in the fully visible slot'
);
// Native feed callbacks must reject account and refresh generations as well.
s.BaseXmlHttpGet = (...args) => requests.push(args);
s.Navigation_FeedGenerations[1] = 1;
s.Navigation_FeedBase(
    '/fixture',
    () => accepted.push('feed'),
    () => accepted.push('feed-error'),
    1,
    'original'
);
let feed = requests[requests.length - 1];
check(feed[1].name === 'Navigation_FeedBaseResult', 'feed uses named native callback');
s.Navigation_FeedGenerations[1]++;
feed[1]({}, feed[3], String(feed[4]));
check(accepted.indexOf('feed') === -1, 'old feed generation rejected');
s.Navigation_FeedBase('/fixture', (response, key, original) => accepted.push(original), null, 1, 'original');
feed = requests[requests.length - 1];
feed[1]({}, feed[3], String(feed[4]));
check(accepted.indexOf('original') !== -1, 'current feed receives original callback context');
s.Navigation_FeedBase('/fixture', () => accepted.push('wrong-account'), null, 1, 'original');
feed = requests[requests.length - 1];
s.AddUser_UsernameArray = [{id: 'new-account'}];
feed[1]({}, feed[3], String(feed[4]));
check(accepted.indexOf('wrong-account') === -1, 'old account feed rejected');
console.log(checks + ' production following/request checks passed');
