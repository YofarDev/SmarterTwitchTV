/* Production badge/HTTP/chat/playback definitions, with transport and UI effects isolated. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const UglifyJS = require('uglify-js');
const names = [
    'Chat_badgesSessionIsCurrent',
    'Chat_badgesRequestIsCurrent',
    'Chat_badgesLoadError',
    'Chat_loadBadgesGlobalRequest',
    'Chat_loadBadgesGlobalRequestWithChannel',
    'Chat_loadBadgesGlobalSuccess',
    'Chat_buildBadgeStyles',
    'Chat_AddMissingBadges',
    'Chat_GetVersionsIdsObj',
    'Chat_BaseTagCSS',
    'Chat_BaseTagId',
    'Chat_BaseTagCSSUrl',
    'Chat_tagCSS',
    'ChatLive_loadBadgesChannel',
    'ChatLive_loadBadgesChannelSuccess',
    'ChatLive_Init',
    'ChatLive_InitCleanup',
    'ChatLive_ClearIds',
    'ChatLive_SetOptions',
    'Chat_Init',
    'BaseXmlHttpGet',
    'Main_BasexmlHttpStatus',
    'BaseXmlHttpGetFull',
    'BaseXmlHttpGetFull_Process',
    'BaseXmlHttpGetFull_Process_End',
    'Play_loadDataResult',
    'Play_loadDataResultEnd',
    'Play_loadDataSuccessEnd',
    'Play_UpdateMainStream',
    'Play_onPlayer',
    'PlayHLS_AdProbeResult',
    'PlayHLS_AdRetryFinish',
    'PlayHLS_AdScheduleRestore',
    'PlayHLS_AdLog'
];
function definitions(built) {
    const found = new Map();
    const files = built
        ? ['release/githubio/js/main_uncompressed.js']
        : [
              'app/specific/ChatVod.js',
              'app/specific/ChatLive.js',
              'app/specific/Main.js',
              'app/specific/ScreensObj.js',
              'app/specific/Play.js',
              'app/specific/PlayHLS.js'
          ];
    for (const file of files)
        UglifyJS.parse(fs.readFileSync(file, 'utf8')).walk(
            new UglifyJS.TreeWalker(node => {
                if (node instanceof UglifyJS.AST_Defun && names.includes(node.name.name)) found.set(node.name.name, node.print_to_string());
            })
        );
    for (const name of names) assert.ok(found.has(name), 'production definition missing: ' + name);
    return [...found.values()].join('\n');
}
// Also used by a real-browser fixture; these two functions have no Node dependencies.
function environment(target) {
    const effects = [],
        requests = [],
        styles = [],
        logs = [];
    const noop = function () {};
    const data = [];
    data[6] = 'fixture';
    data[14] = '100';
    const slot = () => ({
        styles: [],
        childNodes: [],
        insertBefore(style) {
            this.styles.push(style.innerHTML);
            styles.push(style.innerHTML);
        }
    });
    const s = target || {};
    const defaults = {
        Chat_Id: [1, 0],
        ChatLive_Generation: 0,
        Chat_GlobalBadges: null,
        Chat_GlobalBadges_Bits_Subs: undefined,
        Chat_div: [slot(), slot()],
        document: {createElement: () => ({innerHTML: ''})},
        Main_ready: fn => fn(),
        Main_Log: msg => logs.push(msg),
        badgeURLSize: 'image_url_4x',
        ChatLive_CachePins: [{100: true}, {200: true}],
        ChatLive_selectedChannel_id: ['100', '200'],
        ChatLive_selectedChannel: ['fixture', 'fixture2'],
        ChatLive_sharedChannelBadgeLoaded: [{}, {}],
        extraEmotesDone: {BadgesChannel: {}},
        extraEmotes: [{}, {}],
        ChatLive_LineAddCounter: [0, 0],
        ChatLive_Messages: [[], []],
        ChatLive_loaded: [false, true],
        Main_clearTimeout: id => effects.push('clear-timeout:' + id),
        Main_clearInterval: id => effects.push('clear-interval:' + id),
        ChatLive_CheckClear: () => {},
        ChatLive_socketSendCheckID: 'sender-retry',
        ChatLive_SendPingId: 'sender-ping',
        ChatLive_loadBadgesChannelId: 'badge-timer',
        ChatLive_LatencyId: ['latency0', 'latency1'],
        ChatLive_loadChattersId: ['chatters0', 'chatters1'],
        ChatLive_StartSharedId: ['shared0', 'shared1'],
        ChatLive_PingId: ['ping0', 'ping1'],
        PlayHLS_AdRetryStates: {},
        PlayHLS_AdRestoreScheduled: false,
        Main_A_includes_B: (a, b) => a.indexOf(b) !== -1,
        ChatLive_SpamLast: [null, null],
        ChatLive_Individual_Background_flip: [],
        ChatLive_Channel_Regex_Search: [],
        ChatLive_Channel_Regex_Replace: [],
        ChatLive_User_Set: false,
        Main_values: {Play_ChatForceDisable: false, Main_selectedChannel_id: '100', Main_selectedChannel: 'fixture'},
        Settings_value: new Proxy({}, {get: () => ({defaultValue: 0})}),
        Main_IsOn_OSInterface: true,
        Main_helix_api: 'fixture/',
        DefaultHttpGetTimeout: 1000,
        noop_fun: noop,
        Main_Bearer_Headers: [['Client-ID', 'fixture']],
        AddUser_UserHasToken: () => false,
        AddUser_IsUserSet: () => false,
        AddCode_AppToken: () => effects.push('app-token-refresh'),
        AddCode_validateToken: () => effects.push('user-token-refresh'),
        OSInterface_XmlHttpGetFull: (...args) => requests.push({url: args[0], args}),
        OSInterface_BaseXmlHttpGet: (...args) => requests.push({url: args[0], basic: true, args}),
        XMLHttpRequest: function () {
            this.open = (method, url) => {
                this.url = url;
            };
            this.setRequestHeader = noop;
            this.send = () => requests.push({url: this.url, xhr: this});
        },
        ChatLive_Clear: n => {
            s.Chat_Id[n] = 0;
        },
        ChatLive_ClearIds: n => effects.push('timers:' + n),
        ChatLive_CacheRelease: n => {
            s.ChatLive_CachePins[n] = {};
            effects.push('pins:' + n);
        },
        ChatLive_resetChatters: n => effects.push('chatters:' + n),
        ChatLive_Close: n => effects.push('close:' + n),
        ChatLive_SendClose: () => effects.push('send-close'),
        ChatLive_DelayClear: noop,
        Chat_loadBadgesGlobal: noop,
        ChatLive_CacheSetPins: n => {
            s.ChatLive_CachePins[n] = {[s.ChatLive_selectedChannel_id[n]]: true};
        },
        ChatLive_CacheTouch: noop,
        ChatLive_loadCheersChannel: noop,
        ChatLive_loadEmotesChannelBTTV: noop,
        ChatLive_loadEmotesChannelFFZ: noop,
        ChatLive_loadEmotesChannelSeven_tv: noop,
        ChatLive_StartShared: noop,
        ChatLive_PreLoadChat: noop,
        ChatLive_loadChat: n => effects.push('chat-connected:' + n),
        ChatLive_SendStart: noop,
        ChatLive_loadChatters: noop,
        ChatLive_loadGlobalEmotes: noop,
        ChatLive_checkFallow: noop,
        ChatLive_checkSub: noop,
        Chat_StartFakeClock: noop,
        Chat_Disable: noop,
        Chat_Clear: noop,
        ChatLive_ElementAdd: () => effects.push('vod-chat-row'),
        Main_setTimeout: noop,
        Chat_Channels: {},
        Chat_title: '',
        STR_LOADING_CHAT: 'Loading',
        STR_SPACE_HTML: ' ',
        Play_data: {data, qualities: [], isHost: true, AutoUrl: 'fixture-stream'},
        PlayExtra_data: {data: data.slice()},
        Play_data_base: {data: []},
        Play_EndDialogEnter: 0,
        Play_isOn: true,
        Play_SkipStartAuto: false,
        Play_ChatEnable: false,
        Play_isFullScreen: true,
        Play_isEndDialogVisible: () => false,
        Play_HideEndDialog: noop,
        Play_OlddataSet: () => false,
        Play_CheckFollow: noop,
        Play_UpdateMainStreamDiv: noop,
        Play_updateStreamInfoStart: noop,
        PlayRaid_SetChannel: noop,
        UserLiveFeed_SetFeedPicText: noop,
        Main_Set_history: noop,
        OSInterface_StartAuto: (...args) => effects.push({native: args}),
        OSInterface_FixViewPosition: noop,
        Play_SetFullScreen: noop,
        Play_SetControlsVisibilityPlayer: noop,
        Play_loadDataErrorFinish: () => effects.push('stream-error'),
        Play_loadDataId: 99
    };
    Object.keys(defaults).forEach(key => {
        if (key !== 'document' || !target) s[key] = defaults[key];
    });
    function respond(request, obj = {data: []}, status = 200) {
        const response = {status, responseText: JSON.stringify(obj)};
        if (request.xhr) {
            Object.assign(request.xhr, response, {readyState: 4});
            request.xhr.onreadystatechange();
        } else {
            const a = request.args;
            s[a[5]](JSON.stringify(response), ...a.slice(6));
        }
    }
    return {s, effects, requests, styles, logs, respond};
}
function runChecks(factory, check) {
    const badge = (set_id, id = '1', url = 'http://fixture/badge.png') => ({set_id, versions: [{id, image_url_4x: url}]});
    const globals = {data: [badge('moderator'), badge('subscriber'), badge('bits')]};
    const current = h => h.s.Chat_loadBadgesGlobalRequestWithChannel(0, 1, '100');
    const nativeCount = h => h.effects.filter(e => e && e.native).length;
    const playlist = h => h.s.Play_loadDataResult(JSON.stringify({status: 200, checkResult: 99, url: 'fixture-stream', responseText: '#EXTM3U'}));
    for (const android of [true, false]) {
        const h = factory();
        h.s.Main_IsOn_OSInterface = android;
        current(h);
        check(h.requests.length === 1 && !h.requests[0].basic, 'one compatible request per cold load, Android=' + android);
        h.respond(h.requests[0], globals);
        check(typeof h.s.Chat_GlobalBadges[0] === 'string' && !h.s.Chat_GlobalBadges.undefined, 'correct parsed payload/slot/channel contract');
        check(h.requests[1].url.endsWith('broadcaster_id=100'), 'channel request retains explicit ID');
        h.respond(h.requests[1]);
        current(h);
        check(
            h.requests.length === 2 && h.s.extraEmotesDone.BadgesChannel['100'].includes('subscriber100'),
            'cached global/subscriber fallback reused'
        );
        check(h.s.ChatLive_sharedChannelBadgeLoaded[0]['100'] === true, 'correct slot marked loaded');
    }
    for (const order of [
        [0, 1],
        [1, 0]
    ]) {
        const h = factory();
        h.s.Chat_Id[1] = 2;
        current(h);
        h.s.Chat_loadBadgesGlobalRequestWithChannel('1', 2, '200');
        const pending = h.requests.slice();
        for (const n of order) h.respond(pending[n], globals);
        check(
            h.styles.some(css => css.includes('moderator100')) && h.styles.some(css => css.includes('moderator200')),
            'concurrent slot completion order ' + order
        );
        check(typeof h.s.Chat_GlobalBadges[0] === 'string', 'concurrent publication remains complete');
    }
    {
        const h = factory();
        current(h);
        h.respond(h.requests[0]);
        h.respond(h.requests[1]);
        for (let i = 0; i < 3; i++) current(h);
        check(
            h.requests.length === 2 && h.s.Chat_GlobalBadges[0] === '' && h.s.extraEmotesDone.BadgesChannel['100'] === '',
            'successful empty styles cached'
        );
        // Old raw callback is harmless even if invoked after a good full response.
        h.s.Main_BasexmlHttpStatus({status: 200, responseText: '{"data":[]}'}, 0, h.s.Chat_loadBadgesGlobalSuccess, h.s.noop_fun, 1);
        check(h.s.Chat_GlobalBadges[0] === '', 'legacy wrong-order callback cannot corrupt cleared slot');
    }
    for (const bad of [
        null,
        {},
        '{"data":[]}',
        {data: null},
        {data: {}},
        {error: 'unavailable'},
        {data: [null]},
        {data: [{set_id: 'bad', versions: null}]},
        {data: [badge('bad', null)]},
        {data: [badge('bad', '1', 5)]}
    ]) {
        const h = factory();
        current(h);
        h.respond(h.requests[0], bad);
        check(h.s.Chat_GlobalBadges === null && !h.s.Chat_GlobalBadges_Bits_Subs['.asubscriber%x-1'], 'invalid payload never publishes');
        current(h);
        h.respond(h.requests[1], globals);
        check(typeof h.s.Chat_GlobalBadges[0] === 'string', 'invalid load remains recoverable');
        const old = h.s.Chat_GlobalBadges,
            bits = h.s.Chat_GlobalBadges_Bits_Subs;
        h.s.Chat_loadBadgesGlobalSuccess(bad, 1, '0', '100');
        check(h.s.Chat_GlobalBadges === old && h.s.Chat_GlobalBadges_Bits_Subs === bits, 'failed refresh retains valid cache pair');
    }
    {
        const h = factory();
        h.s.Chat_loadBadgesGlobalSuccess({data: [null, {set_id: 'empty', versions: []}, badge('moderator'), badge('bad', '1', null)]}, 1, 0, '100');
        check(
            h.s.Chat_GlobalBadges[0].includes('moderator%x') && !h.s.Chat_GlobalBadges[0].includes('bad%x'),
            'mixed response retains valid records'
        );
        const old = h.s.Chat_GlobalBadges;
        h.s.Chat_BaseTagCSSUrl = () => {
            throw Error('fixture transformation error');
        };
        try {
            h.s.Chat_loadBadgesGlobalSuccess(globals, 1, 0, '100');
        } catch (error) {
            /* Publication must remain atomic even for unexpected failures. */
        }
        check(h.s.Chat_GlobalBadges === old, 'unexpected transform failure cannot publish partial cache');
    }
    for (const cache of [{}, {0: null}, {0: undefined}]) {
        const h = factory();
        h.s.Chat_GlobalBadges = cache;
        playlist(h);
        check(nativeCount(h) === 1 && h.effects.includes('chat-connected:0'), 'corrupt cache cannot prevent native or chat startup');
        check(h.requests.filter(r => r.url.endsWith('badges/global')).length === 1, 'corrupt cache requests a repair');
        check(!h.logs.some(x => x.includes('initialization failed')), 'cache recovery does not need exception boundary');
    }
    for (const state of ['old-generation', 'cleared', 'departed', 'invalid-slot', 'missing-channel']) {
        const h = factory();
        current(h);
        if (state === 'old-generation') h.s.Chat_Id[0] = 3;
        if (state === 'cleared') h.s.Chat_Id[0] = 0;
        if (state === 'departed') delete h.s.ChatLive_CachePins[0]['100'];
        if (state === 'invalid-slot') h.s.Chat_loadBadgesGlobalSuccess(globals, 1, 'other', '100');
        else if (state === 'missing-channel') h.s.Chat_loadBadgesGlobalSuccess(globals, 1, 0, undefined);
        else h.respond(h.requests[0], globals);
        check(h.s.Chat_GlobalBadges === null && h.styles.length === 0, 'reject obsolete/invalid global context: ' + state);
    }
    {
        const h = factory();
        current(h);
        h.respond(h.requests[0], globals);
        const channel = h.requests[1];
        delete h.s.ChatLive_CachePins[0]['100'];
        h.respond(channel, globals);
        check(
            !h.s.extraEmotesDone.BadgesChannel['100'] && !h.s.ChatLive_sharedChannelBadgeLoaded[0]['100'],
            'departed channel cannot republish styles or loaded flag'
        );
    }
    {
        const h = factory();
        current(h);
        h.respond(h.requests[0], globals);
        h.respond(h.requests[1], {data: [badge('subscriber', '1', 'https://fixture/channel.png'), badge('subscriber', '2003')]});
        const css = h.s.extraEmotesDone.BadgesChannel['100'];
        check(
            css.includes('channel.png') && !css.includes('.asubscriber100-1 { background-image: url("https://fixture/badge.png")'),
            'channel subscriber overrides global fallback'
        );
        check(css.includes('.abits100-1') && css.includes('.asubscriber100-3'), 'bits fallback and derived milestone preserved');
        const old = css;
        h.s.ChatLive_loadBadgesChannelSuccess({data: null}, 1, 0, '100');
        check(h.s.extraEmotesDone.BadgesChannel['100'] === old, 'invalid channel refresh preserves valid CSS');
    }
    for (const status of [0, 401, 403, 500]) {
        const h = factory();
        playlist(h);
        h.respond(h.requests[0], {}, status);
        check(nativeCount(h) === 1 && h.s.Chat_GlobalBadges === null, 'HTTP failure does not prevent playback: ' + status);
        check((status !== 401 && status !== 403) || h.effects.includes('app-token-refresh'), 'existing auth refresh preserved');
    }
    for (const slot of [0, 1]) {
        const h = factory();
        h.s.ChatLive_loadCheersChannel = () => {
            throw Error('fixture provider failure');
        };
        h.s.ChatLive_ClearIds = n => {
            check(h.s.Chat_Id[n] === 0, 'generation invalidated before cleanup');
            throw Error('fixture cleanup failure');
        };
        if (slot === 0) playlist(h);
        else h.s.ChatLive_Init(1);
        check(slot !== 0 || nativeCount(h) === 1, 'native player still starts after chat initialization failure');
        check(h.effects.includes('close:' + slot) && h.effects.includes('pins:' + slot), 'cleanup continues after cleanup exception');
        check(h.s.Chat_Id[slot] === 0 && h.s.ChatLive_loaded[slot] === false, 'failed slot invalidated');
        check(h.s.Chat_Id[1 - slot] === (slot ? 1 : 0), 'other slot generation preserved');
        h.s.ChatLive_loadCheersChannel = () => {};
        h.s.ChatLive_ClearIds = () => {};
        h.s.ChatLive_Init(slot);
        check(h.effects.includes('chat-connected:' + slot), 'later initialization can recover failed slot');
    }
    {
        const h = factory();
        h.s.ChatLive_InitCleanup(1);
        check(
            !h.effects.includes('clear-timeout:sender-retry') && !h.effects.includes('clear-interval:sender-ping'),
            'secondary failure preserves main sender timers'
        );
        check(h.effects.includes('clear-timeout:latency1') && h.effects.includes('clear-interval:shared1'), 'failed slot timers are cleared');
    }
    {
        const h = factory();
        h.s.Chat_GlobalBadges = {};
        h.s.PlayHLS_AdRetryStates[99] = {
            variants: ['fixture'],
            current: JSON.stringify({status: 200, checkResult: 99, url: 'fixture-stream', responseText: '#EXTM3U'})
        };
        h.s.PlayHLS_AdProbeResult(JSON.stringify({status: 200, responseText: '#EXTM3U'}), 99, '1', '0', 'fixture', '1', '0', 'Play_loadDataResult');
        check(
            nativeCount(h) === 1 && h.effects.includes('chat-connected:0'),
            'actual clean ad-probe completion reaches native startup with corrupt badge cache'
        );
        let restore;
        h.s.Main_setTimeout = fn => {
            restore = fn;
        };
        h.s.Play_loadData = () => playlist(h);
        h.s.PlayHLS_AdScheduleRestore();
        restore();
        check(nativeCount(h) === 2, 'quality-restore callback reaches native startup');
    }
    {
        const h = factory();
        current(h);
        const oldStyles = h.s.Chat_GlobalBadges;
        let threw = false;
        const request = h.requests[0],
            a = request.args;
        try {
            h.s[a[5]](JSON.stringify({status: 200, responseText: 'not JSON'}), ...a.slice(6));
        } catch (error) {
            threw = true;
        }
        check(threw && h.s.Chat_GlobalBadges === oldStyles, 'shared malformed-JSON parser cannot publish a badge cache');
    }
    for (const ended of [true, false]) {
        const h = factory();
        h.s.Play_isEndDialogVisible = () => ended;
        h.s.Play_isOn = ended;
        playlist(h);
        check(nativeCount(h) === 0, 'ended/replaced session cannot resurrect native playback');
    }
    {
        const h = factory();
        h.s.Chat_GlobalBadges = {};
        h.s.Chat_Init();
        check(h.effects.includes('vod-chat-row') && h.requests.length === 1, 'VOD initialization tolerates corrupt badge cache');
    }
}
function run(built = false) {
    const source = definitions(built);
    let checks = 0;
    runChecks(
        () => {
            const h = environment();
            vm.createContext(h.s);
            vm.runInContext(source, h.s);
            return h;
        },
        (ok, label) => {
            assert.ok(ok, label);
            checks++;
        }
    );
    console.log(checks + ' badge/cache/playback checks passed' + (built ? ' (generated definitions)' : ''));
}
module.exports = {definitions, environment, runChecks};
if (require.main === module) run(process.argv.includes('--built'));
