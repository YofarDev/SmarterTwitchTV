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
/* Key hints: placeholders become icon glyphs, the label text stays escaped plain text. */
require('vm').runInContext(
    require('fs')
        .readFileSync('app/specific/Screens.js', 'utf8')
        .match(/function Screens_AriaEscape\([\s\S]*?\n}/)[0],
    s
);
const hint = s.Navigation_KeyHintHtml('{ok} Select    {left}{right} Adjust    Hold {ok} Options    {back} Return');
check(hint.indexOf('{') === -1, 'every known key placeholder is replaced');
check(hint.split('navigation-key-ok" aria-hidden="true">OK</span>').length === 3, 'OK is drawn as a key cap each time');
check(hint.indexOf('icon-key-left') !== -1 && hint.indexOf('icon-key-right') !== -1, 'arrows use key glyphs');
check(hint.indexOf('icon-return') !== -1, 'Back uses the return glyph');
check(hint.indexOf('aria-hidden="true"') !== -1 && hint.indexOf('</span> Select ') !== -1, 'glyphs are decorative, labels kept');
check(hint.split('navigation-key-divider').length === 4 && hint.indexOf('   ') === -1, 'each gap between key groups becomes one divider');
check(s.Navigation_KeyHintHtml('<b>{nope}</b> & {up}').indexOf('&lt;b>{nope}&lt;/b> &amp; <i class="icon icon-key-up') === 0, 'labels escaped, unknown placeholders left as text');
console.log(checks + ' production navigation checks passed');
