/* Load the real named screen IDs and production routing policy. No app initialization or network. */
const assert = require('assert');
const s = require('./ui-test-sandbox')();
let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}
for (const route of s.Navigation_Destinations()) {
    route.screens.forEach((screen, tab) => {
        const result = s.Navigation_Route(screen);
        check(result.destination === route.id && result.tab === tab, 'round trip ' + route.id + '/' + tab);
        check(s.Navigation_Target(route.id, tab) === screen, 'named screen target');
    });
}
check(s.Navigation_Target('following', 0) === s.Main_UserLive, 'Following starts with live');
check(s.Navigation_Target('following', 1) === s.Main_UserVod, 'Videos second');
check(s.Navigation_Target('following', 2) === s.Main_UserChannels, 'Channels third');
for (const tab of [-1, 99, 0.5, NaN]) check(s.Navigation_Target('following', tab) === null, 'invalid tab rejected');
check(s.Navigation_Route(s.Main_ChannelContent) === null, 'nested screen does not invent origin');
s.Navigation_SetAccount('alex');
s.Navigation_Enter(s.Main_SearchLive);
s.Navigation_Enter(s.Main_ChannelContent, {screen: s.Main_SearchLive, itemId: 'stream-a'});
s.Navigation_Enter(s.Main_aGame, {screen: s.Main_ChannelContent, itemId: 'channel-a'});
check(s.Navigation_State.destination === 'search', 'category from search retains logical destination');
check(s.Navigation_BackOrigin().screen === s.Main_ChannelContent, 'Back closes nested category first');
check(s.Navigation_BackOrigin().screen === s.Main_SearchLive, 'second Back restores search');
check(s.Navigation_BackOrigin() === null, 'origin stack ends');
s.Navigation_SaveBookmark(s.Main_UserLive, 'live', 'b', 3, 200);
check(s.Navigation_Bookmark(s.Main_UserLive, 'live').itemId === 'b', 'bookmark identity');
check(s.Navigation_Bookmark(s.Main_UserLive, 'different-query') === null, 'context-isolated bookmarks');
s.Navigation_SaveBookmark(s.Main_UserLive, 'live', 'c', 1, 20);
check(s.Navigation_State.bookmarks.length === 1, 'bookmark replacement');
let ticket = s.Navigation_Context('live');
check(s.Navigation_IsCurrent(ticket, 'live'), 'current result accepted');
check(!s.Navigation_IsCurrent(ticket, 'videos'), 'different query result rejected');
s.Navigation_Enter(s.Main_Live);
check(!s.Navigation_IsCurrent(ticket, 'live'), 'late route result rejected');
ticket = s.Navigation_Context('live');
s.Navigation_SetAccount('morgan');
check(!s.Navigation_IsCurrent(ticket, 'live'), 'old account callback rejected');
check(s.Navigation_State.bookmarks.length === 0 && s.Navigation_State.origins.length === 0, 'account switch clears scoped state');
for (let i = 0; i < 100; i++) s.Navigation_SaveBookmark(i, 'context', 'id-' + i, i, 0);
check(s.Navigation_State.bookmarks.length === 24, 'bounded bookmarks');
check(!s.Navigation_SetAccount('morgan'), 'same account preserves generation');
const calls = [];
const adapter = {
    valid: screen => screen === s.Main_UserLive,
    capture: () => calls.push('capture'),
    cancelPreview: () => calls.push('cancel'),
    exit: () => calls.push('exit'),
    init: screen => calls.push('init:' + screen)
};
s.UIFocus_Push({id: 'preview', handle: () => true, cleanup: () => calls.push('cleanup')});
check(!s.Navigation_Transition(-1, adapter), 'invalid transition rejected without mutation');
check(calls.length === 0, 'invalid target preserves current screen');
check(s.Navigation_Transition(s.Main_UserLive, adapter), 'valid transition');
check(calls.join(',') === 'capture,cancel,cleanup,exit,init:' + s.Main_UserLive, 'single lifecycle in exact ownership order');
for (const intent of [false, true])
    for (const startUser of [false, true])
        for (const restore of [false, true])
            for (const wasPlaying of [0, 1, 2])
                for (const hasAccount of [false, true]) {
                    const result = s.Navigation_Startup({
                        intent,
                        intentScreen: s.Main_aGame,
                        startUser,
                        restore,
                        wasPlaying,
                        hasAccount,
                        previousScreen: s.Main_Live
                    });
                    const expected = intent
                        ? 'intent'
                        : startUser
                          ? 'screen'
                          : restore && wasPlaying
                            ? 'restore'
                            : hasAccount
                              ? 'screen'
                              : 'onboarding';
                    check(result.action === expected, 'startup combination ' + [intent, startUser, restore, wasPlaying, hasAccount]);
                    if (!intent && !startUser && !(restore && wasPlaying) && hasAccount)
                        check(result.screen === s.Main_UserLive, 'ordinary configured startup');
                }
check(s.Navigation_Startup({explicitScreen: s.Main_Clip, hasAccount: true}).screen === s.Main_Clip, 'explicit screen remains authoritative');
check(s.Navigation_Startup({hasAccount: true, hasToken: false}).screen === s.Main_UserLive, 'username-only account is still an account');
check(s.Navigation_Startup({hasAccount: false}).screen === null, 'onboarding does not invoke account loader');
// A game from the home screen Games channel opens under Browse > Categories, not the last section used
require('vm').runInContext(
    require('fs')
        .readFileSync('app/specific/Main.js', 'utf8')
        .match(/^function Main_SetChannelGameOrigin\(\) \{[\s\S]*?^\}/m)[0],
    s
);
s.Main_values = {Main_BeforeAgame: s.Main_UserLive, Main_BeforeAgameisSet: false, Games_return: true};
s.ScreenObj = {};
s.ScreenObj[s.Main_aGame] = {BeforeAgame: s.Main_Blocked};
s.Navigation_Enter(s.Main_UserLive);
s.Main_SetChannelGameOrigin();
s.Navigation_Enter(s.Main_aGame);
check(s.Navigation_State.destination === 'browse' && s.Navigation_State.tab === 2, 'channel game shows under Browse > Categories');
check(s.Main_values.Main_BeforeAgame === s.Main_games && s.Main_values.Main_BeforeAgameisSet, 'channel game Back returns to Categories');
check(!s.Main_values.Games_return, 'channel game Back does not return to a stale search');
check(s.ScreenObj[s.Main_aGame].BeforeAgame === s.Main_games, 'channel game drops a stale Blocked origin');

// Home screen items exit the current screen once through Navigation_ExitCurrent, which also covers Add User,
// Search and Settings (no ScreenObj exit), before the stream, game or screen opens.
for (const name of ['Main_onNewIntent', 'Main_onNewIntentGetScreen', 'Main_ExitCurrent'])
    require('vm').runInContext(
        require('fs')
            .readFileSync('app/specific/Main.js', 'utf8')
            .match(new RegExp('^function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?^\\}', 'm'))[0],
        s
    );
const steps = [];
let playerOpen = false,
    showing = {};
Object.assign(s, {
    Main_A_equals_B: (a, b) => a === b,
    Play_showBufferDialog: () => {},
    Main_CheckResume: () => {},
    Main_isScene2DocVisible: () => playerOpen,
    Main_onNewIntentClearPlay: () => steps.push('player'),
    Sidepannel_isShowingMenus: () => false,
    Sidepannel_isShowingUserLiveSide: () => false,
    Main_hideScene2Doc: () => {},
    Main_showScene1Doc: () => {},
    Main_isElementShowing: id => Boolean(showing[id]),
    Settings_isVisible: () => Boolean(showing.settings_holder),
    AddUser_exit: () => (steps.push('adduser'), (s.Main_values.Main_Go = s.Main_values.Main_Before)),
    Search_exit: () => (steps.push('search'), (s.Main_values.Main_Go = s.Main_Live)),
    Settings_exit: () => steps.push('settings'),
    AddUser_UserHasToken: () => true,
    AddUser_init: () => (steps.push('adduser-init'), (s.Main_values.Main_Go = s.Main_addUser)),
    Play_data_base: {data: []},
    ScreensObj_LiveCellArray: () => [],
    Main_openStream: () => steps.push('stream'),
    Main_ReStartScreens: () => steps.push('restart')
});
for (const screen of [s.Main_Live, s.Main_Featured]) s.ScreenObj[screen] = {exit_fun: () => steps.push('exit:' + screen)};
function homeItem(type, channel, on, state) {
    steps.length = 0;
    playerOpen = Boolean(state && state.player);
    showing = (state && state.showing) || {};
    s.Main_values = {Main_Go: on, Main_Before: s.Main_Featured};
    s.Main_onNewIntent(JSON.stringify({type: type, screen: channel, obj: {name: 'game', id: '1'}}));
    return steps.join();
}
const addUserUp = {showing: {add_user_scroll: true}},
    searchUp = {showing: {search_scroll: true}};
check(homeItem('LIVE', 1, s.Main_addUser, addUserUp) === 'adduser,stream', 'live item on Add User exits it and opens the stream');
check(s.Main_values.Main_Go === s.Main_Live, 'closing that stream returns to Browse > Live');
check(homeItem('LIVE', 1, s.Main_Featured) === 'exit:' + s.Main_Featured + ',stream', 'live item exits a grid screen once');
check(homeItem('LIVE', 2, s.Main_Search, searchUp) === 'search,stream' && s.Main_values.Main_Go === s.Main_UserLive, 'live item on Search exits it');
check(homeItem('LIVE', 1, s.Main_Featured, {showing: {settings_holder: true}}) === 'settings,stream', 'live item over Settings closes Settings');
check(
    homeItem('LIVE', 1, s.Main_Featured, {player: true}) === 'player,exit:' + s.Main_Featured + ',stream',
    'live item over the player exits the screen under it when that changes'
);
check(homeItem('LIVE', 1, s.Main_Live, {player: true}) === 'player,stream', 'and keeps it when it stays the same');
check(
    homeItem('USER', 2, s.Main_Search, searchUp) === 'search,adduser-init' && s.Main_values.Main_Before === s.Main_Live,
    'user item on Search opens Add User'
);
check(
    homeItem('GAME', 4, s.Main_addUser, addUserUp) === 'adduser,restart' && s.Main_values.Main_Go === s.Main_aGame,
    'game item on Add User exits it'
);
check(
    homeItem('SCREEN', 1, s.Main_addUser, addUserUp) === 'adduser,restart' && s.Main_values.Main_Go === s.Main_Live,
    'screen item on Add User exits it'
);
console.log(checks + ' production navigation checks passed');
