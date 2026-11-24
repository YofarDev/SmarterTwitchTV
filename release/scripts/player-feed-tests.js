/* Player feed reopened from the player (Up, or the bar's Channels) starts on the live list again. Closing it only
 * hides its holder, so the list it was on must be hidden on the way back, and with a game's list also its
 * "go back to games" hint. Loads the real UserLiveFeedobj.js and UserLiveFeed.js. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const s = {};
vm.createContext(s);
vm.runInContext(fs.readFileSync('app/specific/UserLiveFeedobj.js', 'utf8'), s);
vm.runInContext(fs.readFileSync('app/specific/UserLiveFeed.js', 'utf8'), s);

let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}

const hidden = [];
let classes = {},
    userSet = true;
Object.assign(s, {
    AddUser_UserIsSet: () => userSet,
    Main_AddClass: (id, name) => (classes[id] = name)
});
for (let pos = 0; pos <= s.UserLiveFeedobj_MAX; pos++) s.UserLiveFeed_obj[pos] = {hide: () => hidden.push(pos)};

function reopenFrom(pos, user) {
    userSet = user;
    hidden.length = 0;
    classes = {};
    s.UserLiveFeed_FeedPosX = pos;
    s.UserLiveFeed_ResetFeedPosX();
}

for (const game of ['UserLiveFeedobj_UserAGamesPos', 'UserLiveFeedobj_AGamesPos']) {
    reopenFrom(s[game], true);
    check(hidden.join() === String(s[game]), game + ': the game list is hidden');
    check(classes.icon_feed_back === 'opacity_zero', game + ': its go back hint is hidden');
    check(s.UserLiveFeed_FeedPosX === s.UserLiveFeedobj_UserLivePos, game + ': the feed reopens on followed live');
}

reopenFrom(s.UserLiveFeedobj_UserVodPos, true);
check(hidden.join() === String(s.UserLiveFeedobj_UserVodPos), 'followed VODs: the list is hidden before followed live shows');

reopenFrom(s.UserLiveFeedobj_UserLivePos, true);
check(!hidden.length && !classes.icon_feed_back, 'already on followed live: nothing to hide');

reopenFrom(s.UserLiveFeedobj_FeaturedPos, false);
check(hidden.join() === String(s.UserLiveFeedobj_FeaturedPos), 'no account: the featured list is hidden');
check(s.UserLiveFeed_FeedPosX === s.UserLiveFeedobj_LivePos, 'no account: the feed reopens on live');

console.log(checks + ' player feed checks passed');

/* Channel rocker (CH+/CH-): opens the feed, steps the focus and auto-tunes via an injected OK
 * once presses settle; other keys cancel the settle, non-live screens ignore the rocker.
 * Loads the real TVKeyValue.js and PlayEtc.js in a fresh sandbox. */
const ks = {
    Image: function () {
        return {src: ''};
    },
    document: {createElement: () => ({style: {}})},
    window: {setTimeout: () => 0, clearTimeout: () => {}}
};
vm.createContext(ks);
vm.runInContext(fs.readFileSync('app/general/TVKeyValue.js', 'utf8'), ks);
vm.runInContext(fs.readFileSync('app/specific/PlayEtc.js', 'utf8'), ks);

let settleCalls = [];
let feedShowing = false;
let stepAdders = [];
let showFeedCalls = 0;
let injectedKeys = [];
let timers = [];

Object.assign(ks, {
    Main_IsOn_OSInterface: true,
    Play_isOn: true,
    PlayVod_isOn: false,
    PlayClip_isOn: false,
    Play_MultiEnable: false,
    PlayExtra_PicturePicture: false,
    Play_data_base: {data: []},
    Play_isPanelShowing: () => false,
    Play_MultiDialogVisible: () => false,
    Play_isFullScreen: false,
    Play_isChatShown: () => false,
    Play_isEndDialogVisible: () => false,
    Play_EndFocus: false,
    Play_EndCounter: 1,
    Play_HasVod: false,
    Play_EndIconsRemoveFocus: () => {},
    Play_EndIconsAddFocus: () => {},
    Play_EndTextClear: () => {},
    Play_PreviewId: null,
    Play_CheckLiveThumb: () => null,
    Play_KeyChatPosChage: () => {},
    Play_KeyChatSizeChage: () => {},
    Play_AudioChangeLeftRight: () => {},
    Play_ChatFullScreenKeyLeft: () => {},
    Play_ChatFullScreenKeyRight: () => {},
    Play_MultiRemoveFocus: () => {},
    Play_MultiAddFocus: () => {},
    Play_MultiEnableKeyRightLeft: () => {},
    Play_MultiDialogPos: 0,
    Play_Multi_MainBig: false,
    Play_PicturePicturePos: 0,
    Play_PicturePictureSize: 0,
    Play_DurationSeconds: 0,
    PlayVod_jumpStart: () => {},
    PlayVod_PanelY: 0,
    Play_BottomLeftRigt: () => {},
    Play_BottomUpDown: () => {},
    Play_BottomIconsFocus: () => {},
    Play_BottomOptionsPressed: () => {},
    Main_setItem: () => {},
    OSInterface_mSwitchPlayerPosition: () => {},
    OSInterface_mSwitchPlayerSize: () => {},
    Main_isScene2DocVisible: () => true,
    Play_screeOn: () => {},
    Play_FastBackForward: () => {},
    PlayerUI_Show: () => {},
    Play_clearHidePanel: () => {},
    Play_setHidePanel: () => {},
    UserLiveFeed_isPreviewShowing: () => feedShowing,
    UserLiveFeed_ResetFeedPosX: () => {},
    UserLiveFeed_ShowFeed: () => {
        showFeedCalls++;
        feedShowing = true;
    },
    UserLiveFeed_KeyRightLeft: adder => {
        stepAdders.push(adder);
        return true;
    },
    OSInterface_keyEvent: (key, action) => injectedKeys.push(key + ':' + action),
    Main_setTimeout: fn => {
        timers.push(fn);
        return timers.length;
    },
    Main_clearTimeout: () => {}
});

function pressChannel(add) {
    stepAdders = [];
    injectedKeys = [];
    timers = [];
    ks.Play_ChannelStep(add);
}

function pressKey(code) {
    stepAdders = [];
    injectedKeys = [];
    timers = [];
    ks.Play_handleKeyDown({keyCode: code, preventDefault: () => {}});
}

//Blocked when no live stream is on
ks.Play_isOn = false;
pressChannel(1);
check(stepAdders.length === 0 && showFeedCalls === 0, 'rocker with no live stream does nothing');
ks.Play_isOn = true;
ks.PlayVod_isOn = true;
pressChannel(1);
check(stepAdders.length === 0, 'rocker during a VOD does nothing');
ks.PlayVod_isOn = false;

//Hidden feed: opens it, no step, no settle armed yet
feedShowing = false;
showFeedCalls = 0;
pressChannel(1);
check(showFeedCalls === 1, 'rocker opens the feed when hidden');
check(stepAdders.length === 0, 'no step on the opening press');
check(timers.length === 0, 'no settle armed while the feed was hidden');

//Visible feed: steps and arms the settle; the settle injects OK down+up
pressChannel(1);
check(stepAdders.join() === '1', 'CH+ steps forward');
check(timers.length === 1, 'settle armed after a step');
ks.Play_ChannelStepSettle();
check(injectedKeys.join() === '4:0,4:1', 'settle injects an OK press (down then up)');

pressChannel(-1);
check(stepAdders.join() === '-1', 'CH- steps backward');

//Another key before the settle cancels it
pressChannel(1);
check(timers.length === 1, 'settle armed again');
timers.length = 0;
pressKey(ks.KEY_LEFT);
check(injectedKeys.length === 0, 'a new key before the settle injects nothing');

//A press that does not move the focus (list end) arms no settle
ks.UserLiveFeed_KeyRightLeft = () => false;
pressChannel(1);
check(stepAdders.length === 0 && timers.length === 0, 'no settle armed when the focus cannot move');
ks.UserLiveFeed_KeyRightLeft = adder => {
    stepAdders.push(adder);
    return true;
};

//The 166/167 keycodes route into Play_ChannelStep through the key handler
feedShowing = true;
showFeedCalls = 0;
pressKey(ks.KEY_CHANNEL_UP);
check(stepAdders.join() === '1', 'KEY_CHANNEL_UP routes to a forward step');
pressKey(ks.KEY_CHANNEL_DOWN);
check(stepAdders.join() === '-1', 'KEY_CHANNEL_DOWN routes to a backward step');

console.log(checks + ' channel rocker checks passed');
