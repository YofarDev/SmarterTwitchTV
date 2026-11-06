/* Production search-session behavior: entry origin rules, draft preservation, submit mapping.
 * Loads the real Navigation.js, UIFocus.js and Search.js; everything else is environment stubs. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sandbox = {};
vm.createContext(sandbox);
const ids = fs
    .readFileSync('app/specific/Main.js', 'utf8')
    .match(/^var Main_[A-Za-z_]+ = \d+;/gm)
    .slice(0, 27)
    .join('\n');

if (process.argv.includes('--built')) {
    const UglifyJS = require('uglify-js');
    const ast = UglifyJS.parse(fs.readFileSync('release/githubio/js/main_uncompressed.js', 'utf8'));
    const definitions = [];
    ast.walk(
        new UglifyJS.TreeWalker(function (node) {
            if (node instanceof UglifyJS.AST_Defun && /^(Navigation_|UIFocus_|Search_)/.test(node.name.name)) definitions.push(node.print_to_string());
            if (node instanceof UglifyJS.AST_Var) {
                const matches = node.definitions.filter(def => /^(Navigation_|UIFocus_|Search_)/.test(def.name.name));
                if (matches.length) definitions.push(new UglifyJS.AST_Var({definitions: matches}).print_to_string());
            }
        })
    );
    if (definitions.length < 20) throw new Error('Rebuild first: search definitions missing from generated source');
    vm.runInContext(ids + '\n' + definitions.join('\n'), sandbox);
    vm.runInContext(fs.readFileSync('app/general/TVKeyValue.js', 'utf8'), sandbox);
} else {
    vm.runInContext(fs.readFileSync('app/general/TVKeyValue.js', 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync('app/specific/UIFocus.js', 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync('app/specific/Navigation.js', 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync('app/specific/Search.js', 'utf8'), sandbox);
    vm.runInContext(ids, sandbox);
}

/* Minimal environment: recorded calls instead of a DOM. */
vm.runInContext(
    `
    var STR_UI = {liveNow: 'Live now', categories: 'Categories', switchAccount: 'Switch'};
    var STR_SEARCH = 'Search', STR_EDIT_SEARCH = 'Edit search', STR_LIVE = 'Live', STR_VIDEOS = 'Videos',
        STR_CLIPS = 'Clips', STR_CHANNELS = 'Channels', STR_SETTINGS = 'Settings', STR_EXIT = 'Exit',
        STR_ABOUT = 'About', STR_CONTROLS = 'Controls', STR_UPDATE_CHANGELOG = 'Updates', STR_USER_ADD = 'Add',
        STR_REFRESH = 'Refresh', STR_VIEWERS = 'viewers', STR_PLACEHOLDER_SEARCH = 'search',
        STR_SEARCH_EMPTY = 'empty', STR_GOBACK = 'back', STR_THUMB_OPTIONS_TOP = 'options';
    var harness = {calls: [], screens: [], inputFocusTimer: 0};
    var Main_SearchInput = null;
    var Main_values = {Main_Go: 305, Main_Before: 305, Main_BeforeSearch: 305, Search_data: null, Search_isSearching: false};
    function rec(name) { harness.calls.push(name); }
    function Navigation_Render() { rec('render'); }
    function Main_HideWarningDialog() { rec('hideWarning'); }
    function Main_HideElement() {}
    function Main_ShowElement() {}
    function Main_IconLoad() {}
    function Main_innerHTML() {}
    function Main_textContent() {}
    function Main_empty() {}
    function Main_CounterDialogRst() { rec('counterRst'); }
    function Main_isControlsDialogVisible() { return false; }
    function Main_isAboutDialogVisible() { return false; }
    function Main_isElementShowing() { return false; }
    function Main_HideAboutDialog() {}
    function Main_HideControlsDialog() {}
    function Main_SaveValuesWithTimeout() {}
    function Main_showExitDialog() {}
    function Main_showAboutDialog() {}
    function Main_showControlsDialog() {}
    function Main_UpdateDialogShowCheck() {}
    function AddUser_exit() {}
    function AddUser_init() {}
    function Users_init() {}
    function Settings_init() {}
    function Settings_exit() {}
    function Screens_exit() {}
    function Screens_addFocus() {}
    function Screens_OpenSidePanel() {}
    function Sidepannel_StartFeed() {}
    function Sidepannel_Start() {}
    function Sidepannel_ShowNoUserWarning() {}
    var AddUser_UsernameArray = [], AddUser_UserHasToken = function () { return true; }, AddUser_IsUserSet = function () { return true; };
    function Main_showWarningDialog() { rec('warn'); }
    function Main_SwitchScreen() { rec('switch:' + Main_values.Main_Go); }
    function Main_ready(fun) { fun(); }
    function Main_setTimeout() { return 0; }
    function Main_clearTimeout() {}
    function Main_addEventListener() {}
    function Main_removeEventListener() {}
    function Main_AddClass() {}
    function Main_RemoveClass() {}
    function Main_getElementById(id) { return id === 'search_input' ? harness.input : harness.eles[id]; }
    function Main_ExitCurrent(screen) { rec('exitCurrent'); }
    function OSInterface_AvoidClicks() {}
    function OSInterface_mhideSystemUI() {}
    var Main_isTV = true, Main_IsOn_OSInterface = 0;
    function Screens_init(screen) { harness.screens.push(screen); }
    function Screens_LoadPreviewSTop() {}
    function Settings_isVisible() { return false; }
    function Search_fakeInput(value) {
        Main_SearchInput = {
            id: 'search_input', value: value || '', placeholder: '',
            focus: function () {}, blur: function () {},
            cloneNode: function () { var clone = {id: 'search_input', value: '', focus: function () {}, blur: function () {}}; harness.cloned = clone; return clone; }
        };
        harness.input = Main_SearchInput;
        Main_SearchInput.parentNode = {replaceChild: function (clone) { harness.replacedWith = clone; }};
        return Main_SearchInput;
    }
    var ScreenObj = {};
    ScreenObj[Main_Live] = {init_fun: function () { rec('initLive'); }, key_fun: function () {}, key_exit: function () {}, ids: ['s_'], DataObj: {}};
    ScreenObj[Main_SearchChannels] = {init_fun: function () { rec('initChannels'); }, key_fun: function () {}, ids: ['c_'], DataObj: {}};
    ScreenObj[Main_SearchGames] = {init_fun: function () { rec('initGames'); }, key_fun: function () {}, ids: ['g_'], DataObj: {}};
    ScreenObj[Main_SearchLive] = {init_fun: function () { rec('initLiveResults'); }, key_fun: function () {}, ids: ['l_'], DataObj: {}};
    ScreenObj[Main_SearchVod] = {init_fun: function () { rec('initVod'); }, key_fun: function () {}, ids: ['v_'], DataObj: {}};
    var STR_CHANNEL_CONT = 'x';
`,
    sandbox
);

let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}
const s = sandbox;

/* Session entry: origin recorded once, never overwritten by re-entry. */
s.Main_values.Main_Go = s.Main_Live;
s.Search_SessionEnter(s.Main_Live);
check(s.Search_Session.active && s.Search_Session.origin === s.Main_Live, 'new session records origin');
check(s.Main_values.Main_BeforeSearch === s.Main_Live, 'origin published to legacy BeforeSearch');
s.Main_values.Main_Go = s.Main_SearchLive;
s.Search_SessionEnter(s.Main_SearchLive);
check(s.Search_Session.origin === s.Main_Live, 'edit search keeps the true origin');
check(!s.Main_values.Search_isSearching, 'form is not searching');

/* Submit: validation, session capture, type mapping, draft kept in the input. */
s.Search_cursorY = 1;
s.Search_cursorX = 2; // live
s.Search_fakeInput('   ');
s.harness.calls = [];
s.Search_KeyEnter();
check(s.harness.calls.indexOf('warn') !== -1 && s.Main_values.Search_data === null, 'whitespace-only query rejected');
s.Search_fakeInput('star craft');
s.harness.screens = [];
s.Search_KeyEnter();
check(s.Search_Session.submitted === 'star craft' && s.Main_values.Search_data === 'star craft', 'valid query submitted to loaders');
check(s.Search_Session.draft === 'star craft', 'draft equals the submitted query');
check(s.harness.input.value === 'star craft', 'input keeps the query text for the next edit');
check(s.harness.screens.length === 1 && s.harness.screens[0] === s.Main_SearchLive, 'type 2 maps to live results');
s.Search_Session.type = 0;
s.Search_cursorX = 0;
s.Search_fakeInput('chan');
s.harness.screens = [];
s.Search_KeyEnter();
check(s.harness.screens[0] === s.Main_SearchChannels, 'type 0 maps to channel results');
s.Search_cursorX = 3;
s.Search_fakeInput('vod');
s.harness.screens = [];
s.Search_KeyEnter();
check(s.harness.screens[0] === s.Main_SearchVod, 'type 3 maps to vod results');

/* Draft preservation across the keyboard-removal clone. */
s.Search_fakeInput('partial ');
s.harness.input.value = 'partial query';
s.Search_removeEventListener();
check(s.Search_Session.draft === 'partial query', 'draft saved before clone');
check(s.harness.replacedWith.value === 'partial query', 'clone carries the typed value');

/* Form Back: cancels the session at its caller. */
s.Search_SessionEnter(s.Main_Live);
s.harness.calls = [];
s.Search_BackCancel();
check(s.Main_values.Main_Go === s.Main_Live, 'Back from the form returns to the origin');
check(!s.Search_Session.active, 'Back from the form ends the session');
check(s.harness.calls.join(',').indexOf('switch:' + s.Main_Live) !== -1, 'screen switch to the caller');

/* Keyboard Back while typing dismisses instead of exiting. */
s.Search_SessionEnter(s.Main_Live);
s.Search_keyBoardOn = true;
s.harness.calls = [];
s.Search_KeyboardEvent({keyCode: s.KEY_RETURN});
check(s.harness.calls.join(',').indexOf('switch:') === -1, 'keyboard Back does not leave Search');
check(!s.Search_keyBoardOn, 'keyboard Back dismisses the keyboard');
s.Search_keyBoardOn = false;
s.Search_KeyboardEvent({keyCode: s.KEY_RETURN});
check(!s.Search_Session.active, 'Back without keyboard cancels the session');

/* Navigation_Go integration: entering search starts a session, leaving the destination ends it. */
s.Main_values.Main_Go = s.Main_Live;
s.harness.calls = [];
s.Navigation_Go(s.Main_Search);
check(s.Search_Session.active && s.Search_Session.origin === s.Main_Live, 'Navigation_Go starts the session');
check(s.Main_values.Main_Go === s.Main_Search, 'search form is current');
s.Main_values.Main_Go = s.Main_SearchLive;
s.Search_Session.submitted = 'q';
s.Navigation_Go(s.Main_Live);
check(!s.Search_Session.active && !s.Main_values.Search_isSearching, 'leaving search destination ends the session');

/* Account switch clears the session and bookmarks together. */
s.Search_SessionEnter(s.Main_Live);
s.Navigation_SaveBookmark(s.Main_SearchLive, 'q', 'item', 0, 0);
s.Navigation_SetAccount('other');
check(!s.Search_Session.active, 'account switch ends the search session');
check(s.Navigation_Bookmark(s.Main_SearchLive, 'q') === null, 'account switch clears scoped bookmarks');

/* Tab label: form tab becomes Edit search only with results in the session. */
s.Search_SessionEnd();
check(s.Navigation_Tabs('search')[0] === s.STR_SEARCH, 'fresh session keeps the Search label');
s.Search_SessionEnter(s.Main_Live);
s.Search_Session.submitted = 'q';
check(s.Navigation_Tabs('search')[0] === s.STR_EDIT_SEARCH, 'session with results labels the tab Edit search');

/* Left inside the rail opens the followed panel. Its way back to the rail (Right or Back) keeps Search's keys, not an older grid's. */
s.Sidepannel_Callback = function olderGrid() {};
s.Navigation_Region = 'rail';
s.Navigation_Callback = s.Search_handleKeyDown;
s.Navigation_Handle({keyCode: s.KEY_LEFT});
check(s.Sidepannel_Callback === s.Search_handleKeyDown, 'the followed panel returns to the rail with the Search keys');

console.log(checks + ' search navigation checks passed');
