/* Live emote updates: 7TV event socket changes and the 15 minute BTTV/FFZ check, with the real chat loaders,
 * a fake socket, fake timers and fake HTTP. No network. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}

//Fake timers driven by advance()
let now = 1800000000000,
    timerSeq = 0;
const timers = new Map();
function addTimer(fun, ms, repeat) {
    const id = ++timerSeq;
    timers.set(id, {fun: fun, at: now + (ms || 0), ms: ms || 0, repeat: repeat});
    return id;
}
function advance(ms) {
    const end = now + ms;
    for (;;) {
        let next = null;
        timers.forEach((t, id) => {
            if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        });
        if (!next) break;
        now = next[1].at;
        if (next[1].repeat) next[1].at += next[1].ms;
        else timers.delete(next[0]);
        next[1].fun();
    }
    now = end;
}

//Fake WebSocket: records what the app sends, the test plays the server
const sockets = [];
function FakeSocket(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    sockets.push(this);
}
FakeSocket.prototype.send = function (text) {
    this.sent.push(JSON.parse(text));
};
FakeSocket.prototype.close = function () {
    this.closed = true;
};
FakeSocket.prototype.server = function (message) {
    this.onmessage({data: JSON.stringify(message)});
};
const lastSocket = () => sockets[sockets.length - 1];

const requests = [];
const s = {
    Main_Log: () => {},
    Main_A_includes_B: (a, b) => a.indexOf(b) !== -1,
    Main_startsWith: (a, b) => a.indexOf(b) === 0,
    twemoji: {parse: text => text},
    Settings_value: {chat_animated_emotes: {defaultValue: 1}},
    Image: function () {},
    document: {head: {appendChild: () => {}}, createElement: () => ({sheet: {cssRules: [], insertRule: () => {}}})},
    Main_getElementById: () => null,
    WebSocket: FakeSocket,
    noop_fun: () => {},
    BaseXmlHttpGet: (url, success, error, chat_number, id) => requests.push({url, success, chat_number, id}),
    Main_setTimeout: (fun, ms, id) => {
        timers.delete(id);
        return addTimer(fun, ms, false);
    },
    Main_clearTimeout: id => timers.delete(id),
    Main_setInterval: (fun, ms, id) => {
        timers.delete(id);
        return addTimer(fun, ms, true);
    },
    Main_clearInterval: id => timers.delete(id)
};
s.Date = class extends Date {
    constructor(...a) {
        super(...(a.length ? a : [now]));
    }
};
vm.createContext(s);
for (const file of ['app/thirdparty/kapchat.js', 'app/specific/ChatLive.js', 'app/specific/ChatVod.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), s);

const files = () => [
    {name: '1x.webp', static_name: '1x_static.webp', format: 'WEBP'},
    {name: '2x.webp', static_name: '2x_static.webp', format: 'WEBP'},
    {name: '2x.avif', static_name: '2x_static.avif', format: 'AVIF'}
];
const seven = (id, name) => ({
    id: id,
    name: name,
    data: {id: id, name: 'x', animated: false, flags: 0, host: {url: '//cdn.7tv.app/emote/' + id, files: files()}}
});
const usersResponse = (set, emotes) => JSON.stringify({id: '111', emote_set: {id: set, emotes: emotes}, user: {id: 'USER7TV'}});
const respond = (part, body) => {
    const i = requests.findIndex(r => r.url.indexOf(part) !== -1);
    assert.ok(i !== -1, 'request for ' + part);
    const r = requests.splice(i, 1)[0];
    r.success(JSON.stringify(body), r.chat_number, r.id);
};
const sentOps = socket => socket.sent.map(m => m.op + ' ' + m.d.type + ' ' + m.d.condition.object_id);

//Live chat on channel 111 in slot 0; global sets as the chat start loads them
s.Chat_Id[0] = 5;
s.ChatLive_selectedChannel_id = ['111', null];
s.extraEmotes = [{}, {}];
s.extraEmotesDone.seven_tvGlobal = {};
s.ChatLive_loadEmotesseven_tv({emotes: [seven('g1', 'Wave')]}, 0, true);
const globalWave = s.extraEmotesDone.seven_tvGlobal.Wave;

//First 7TV load: the set id and owner are kept, but VOD chat (no live start) opens no socket
s.ChatLive_loadEmotesChannelSeven_tvSuccess(usersResponse('SET1', [seven('e1', 'Clap'), seven('e2', 'Wave')]), 0, 5);
check(s.ChatLive_EmoteMeta['111'].set === 'SET1' && s.ChatLive_EmoteMeta['111'].user === 'USER7TV', 'first load keeps the set id and owner');
check(s.extraEmotes[0].Wave.chat_div.indexOf('/emote/e2/') !== -1, 'channel emote wins over the global one at chat start');
check(sockets.length === 0, 'no socket before the live chat starts (VOD chat shares the loaders)');

//Live start: one socket, subscriptions after hello
s.ChatLive_EmoteLiveStart(0, 5);
let ws = lastSocket();
check(sockets.length === 1 && ws.url === 'wss://events.7tv.io/v3', 'live chat opens the 7TV event socket');
check(ws.sent.length === 0, 'nothing is sent before hello');
ws.server({op: 1, d: {heartbeat_interval: 45000, session_id: 'x', subscription_limit: 500}});
check(sentOps(ws).join('|') === '35 emote_set.update SET1|35 user.update USER7TV', 'hello: subscribes to the set and to the owner (set switches)');

//Real "pushed" message captured from 7TV (account details removed): one emote added
const clap = s.extraEmotes[0].Clap;
const pushed = {
    type: 'emote_set.update',
    body: {
        id: 'SET1',
        kind: 3,
        pushed: [
            {
                key: 'emotes',
                index: 0,
                type: 'object',
                value: {
                    id: '01F6ME7ADR0000WDA7ERT9H30R',
                    name: 'COPIUM',
                    flags: 0,
                    timestamp: 1622036163000,
                    actor_id: 'ACTOR',
                    data: {
                        id: '01F6ME7ADR0000WDA7ERT9H30R',
                        name: 'COPIUM',
                        flags: 0,
                        lifecycle: 3,
                        state: ['LISTED'],
                        listed: true,
                        animated: true,
                        host: {
                            url: '//cdn.7tv.app/emote/01F6ME7ADR0000WDA7ERT9H30R',
                            files: [
                                {name: '1x.webp', static_name: '1x_static.webp', format: 'WEBP'},
                                {name: '2x.webp', static_name: '2x_static.webp', format: 'WEBP'},
                                {name: '3x.webp', static_name: '3x_static.webp', format: 'WEBP'},
                                {name: '4x.webp', static_name: '4x_static.webp', format: 'WEBP'},
                                {name: '1x.avif', static_name: '1x_static.avif', format: 'AVIF'},
                                {name: '1x.gif', static_name: '1x_static.gif', format: 'GIF'}
                            ]
                        }
                    },
                    origin_id: null
                }
            }
        ]
    }
};
ws.server({op: 0, d: pushed});
const copium = s.extraEmotes[0].COPIUM;
check(
    copium && copium.chat_div.indexOf('https://cdn.7tv.app/emote/01F6ME7ADR0000WDA7ERT9H30R/4x.webp') !== -1,
    'pushed: the new emote is in the chat'
);
check(copium.chat_div_static && copium.chat_div_static.indexOf('4x_static.webp') !== -1, 'pushed: animated emote keeps its still image');
check(s.extraEmotesDone.seven_tv['111'].COPIUM, 'pushed: the cache has it for the next chat');
check(s.extraEmotes[0].Clap === clap, 'pushed: other emotes are not touched');

//Renamed (alias): old name gone, new name present
ws.server({
    op: 0,
    d: {
        type: 'emote_set.update',
        body: {
            id: 'SET1',
            updated: [
                {
                    key: 'emotes',
                    index: 2,
                    old_value: {id: '01F6ME7ADR0000WDA7ERT9H30R', name: 'COPIUM'},
                    value: Object.assign({}, pushed.body.pushed[0].value, {name: 'COPE'})
                }
            ]
        }
    }
});
check(
    !s.extraEmotes[0].COPIUM && s.extraEmotes[0].COPE && s.extraEmotes[0].COPE.chat_div === copium.chat_div.replace(/COPIUM/g, 'COPE'),
    'updated: renamed emote'
);
check(!s.extraEmotesDone.seven_tv['111'].COPIUM && s.extraEmotesDone.seven_tv['111'].COPE, 'updated: cache follows the rename');

//Removed: a channel emote that hid a global one gives the global one back
ws.server({op: 0, d: {type: 'emote_set.update', body: {id: 'SET1', pulled: [{key: 'emotes', index: 1, old_value: {id: 'e2', name: 'Wave'}}]}}});
check(s.extraEmotes[0].Wave && s.extraEmotes[0].Wave.chat_div === globalWave.chat_div, 'pulled: the global emote with that name comes back');
ws.server({op: 0, d: {type: 'emote_set.update', body: {id: 'SET1', pulled: [{key: 'emotes', index: 0, old_value: {id: 'e1', name: 'Clap'}}]}}});
check(!s.extraEmotes[0].Clap && !s.extraEmotesDone.seven_tv['111'].Clap, 'pulled: an emote with no other source is gone');

//Other sets and other change keys are ignored
const before = JSON.stringify(s.extraEmotes[0]);
ws.server({op: 0, d: {type: 'emote_set.update', body: {id: 'OTHER', pulled: [{key: 'emotes', old_value: {id: 'g1', name: 'COPE'}}]}}});
ws.server({op: 0, d: {type: 'emote_set.update', body: {id: 'SET1', updated: [{key: 'name', old_value: 'a', value: 'b'}]}}});
check(JSON.stringify(s.extraEmotes[0]) === before, 'changes to other sets or set fields do nothing');

//A name that is also an Object property
ws.server({op: 0, d: {type: 'emote_set.update', body: {id: 'SET1', pushed: [{key: 'emotes', value: seven('e9', 'constructor')}]}}});
check(Object.prototype.hasOwnProperty.call(s.extraEmotes[0], 'constructor'), 'an emote named constructor is added');

//Heartbeats keep the followed set fresh for a later chat start
s.ChatLive_EmoteMeta['111'].seven_tv = now - 20 * 60000;
ws.server({op: 2, d: {count: 1}});
check(!s.ChatLive_EmoteStale('111', 'seven_tv'), 'heartbeat: followed set stays fresh');

//Set switch (user.update shape captured from 7TV): the new set replaces the old one, subscriptions move
ws.sent = [];
ws.server({
    op: 0,
    d: {
        type: 'user.update',
        body: {
            id: 'USER7TV',
            kind: 1,
            updated: [
                {
                    key: 'connections',
                    index: 0,
                    nested: true,
                    type: '',
                    value: [
                        {key: 'emote_set', index: null, type: 'object', value: {id: 'SET2', name: 'test', capacity: 1000}},
                        {key: 'emote_set_id', index: null, type: 'string', value: 'SET2'}
                    ]
                }
            ]
        }
    }
});
check(requests.length === 1 && requests[0].url === 'https://7tv.io/v3/users/twitch/111', 'set switch: the channel set is fetched again');
const cope = s.extraEmotes[0].COPE;
respond('7tv.io', JSON.parse(usersResponse('SET2', [seven('p1', 'Pog'), Object.assign({}, pushed.body.pushed[0].value, {name: 'COPE'})])));
check(s.extraEmotes[0].Pog && s.ChatLive_EmoteMeta['111'].set === 'SET2', 'set switch: new set emotes are in');
check(!Object.prototype.hasOwnProperty.call(s.extraEmotes[0], 'constructor'), 'set switch: emotes missing from the new set are gone');
check(s.extraEmotes[0].COPE === cope, 'set switch: emotes in both sets are not touched');
check(sentOps(ws).join('|') === '36 emote_set.update SET1|35 emote_set.update SET2', 'set switch: unsubscribes the old set, subscribes the new one');
ws.server({op: 0, d: {type: 'user.update', body: {id: 'USER7TV', updated: [{key: 'display_name', value: 'x'}]}}});
check(requests.length === 0, 'other account changes fetch nothing');

//Set switch whose refresh fails: the owner stays followed, so the next switch is still seen
const switchTo = set => ({
    op: 0,
    d: {
        type: 'user.update',
        body: {
            id: 'USER7TV',
            updated: [{key: 'connections', value: [{key: 'emote_set_id', value: set}]}]
        }
    }
});
ws.sent = [];
ws.server(switchTo('SET3'));
check(requests.length === 1, 'failed refresh: the switch fetches the set');
requests.length = 0; //the request fails, its error callback does nothing
s.ChatLive_SevenTvSync(); //a later sync: a reconnect, the other chat starting
check(!ws.closed && sentOps(ws).join('|') === '36 emote_set.update SET2', 'failed refresh: the socket stays open and the owner stays followed');
ws.server(switchTo('SET2'));
check(requests.length === 1, 'failed refresh: the next switch fetches the set again');
respond('7tv.io', JSON.parse(usersResponse('SET2', [seven('p1', 'Pog'), Object.assign({}, pushed.body.pushed[0].value, {name: 'COPE'})])));
check(
    s.ChatLive_EmoteMeta['111'].set === 'SET2' && sentOps(ws).join('|') === '36 emote_set.update SET2|35 emote_set.update SET2',
    'failed refresh: the next switch restores the set'
);

//BTTV and FFZ: checked every 15 minutes, only differences applied, 7TV still wins on a shared name
s.ChatLive_loadEmotesChannelBTTVSuccess(
    JSON.stringify({
        channelEmotes: [
            {id: 'b1', code: 'Keep'},
            {id: 'b2', code: 'Gone'},
            {id: 'b3', code: 'Pog'}
        ],
        sharedEmotes: []
    }),
    0,
    5
);
s.ChatLive_loadEmotesChannelFFZSuccess(JSON.stringify({sets: {1: {emoticons: [{id: 1, name: 'FfzOne', urls: {1: 'https://cdn.ffz/1'}}]}}}), 0, 5);
s.extraEmotes[0].Pog = s.ChatLive_copyExtraEmote(s.extraEmotesDone.seven_tv['111'].Pog); //7TV loaded last at chat start
const keep = s.extraEmotes[0].Keep;
advance(14 * 60000);
check(requests.length === 0, 'no BTTV/FFZ check before 15 minutes');
advance(60000);
check(
    requests.map(r => r.url).join('|') === 'https://api.betterttv.net/3/cached/users/twitch/111|https://api.frankerfacez.com/v1/room/id/111',
    '15 minutes: BTTV and FFZ checked, 7TV not polled'
);
respond('betterttv', {
    channelEmotes: [
        {id: 'b1', code: 'Keep'},
        {id: 'b4', code: 'Pog'}
    ],
    sharedEmotes: [{id: 'b5', code: 'New'}]
});
respond('frankerfacez', {sets: {1: {emoticons: []}}});
check(s.extraEmotes[0].Keep === keep, 'BTTV check: unchanged emote is not touched');
check(!s.extraEmotes[0].Gone && s.extraEmotes[0].New, 'BTTV check: removed and added emotes applied');
check(s.extraEmotes[0].Pog.chat_div.indexOf('/emote/p1/') !== -1, 'BTTV check: the 7TV channel emote still wins on a shared name');
check(!s.extraEmotes[0].FfzOne, 'FFZ check: removed emote applied');

//A response for an older chat is ignored
requests.length = 0;
advance(15 * 60000);
s.Chat_Id[0] = 6;
respond('betterttv', {channelEmotes: [], sharedEmotes: []});
check(s.extraEmotes[0].Keep === keep, 'stale response: ignored');
s.Chat_Id[0] = 5;
requests.length = 0;

//Chat start with a cached set: shown at once, checked again only when older than 15 minutes
s.extraEmotes[0] = {};
s.ChatLive_EmoteMeta['111'].bttv = now - 60000;
s.ChatLive_loadEmotesChannelBTTV(0, 5);
check(s.extraEmotes[0].Keep && requests.length === 0, 'fresh cached set: used, no request');
s.ChatLive_EmoteMeta['111'].bttv = now - 16 * 60000;
s.ChatLive_loadEmotesChannelBTTV(0, 5);
check(s.extraEmotes[0].Keep && requests.length === 1 && requests[0].url.indexOf('betterttv') !== -1, 'stale cached set: used at once and checked');
requests.length = 0;

//Socket health from a fresh socket: silent socket dropped, server reconnect request, backoff, client-bug codes, maintenance
s.ChatLive_SevenTvClose();
s.ChatLive_SevenTvSync();
const base = sockets.length;
ws = lastSocket();
ws.server({op: 1, d: {heartbeat_interval: 45000}});
advance(3 * 45000 - 1);
check(!ws.closed, 'socket kept while within three heartbeat intervals');
advance(1);
check(ws.closed && sockets.length === base, 'silent socket: dropped after three heartbeat intervals');
advance(2000);
ws = lastSocket();
check(sockets.length === base + 1, 'silent socket: a new one opens after 2 s');
ws.server({op: 1, d: {heartbeat_interval: 45000}});
check(sentOps(ws).join('|') === '35 emote_set.update SET2|35 user.update USER7TV', 'reconnect: subscriptions restored');
ws.server({op: 4, d: {}});
advance(2000);
check(sockets.length === base + 2, 'server reconnect request: new socket');
ws = lastSocket();
ws.onclose({code: 1006});
advance(3999);
check(sockets.length === base + 2, 'backoff: second retry waits 4 s');
advance(1);
ws = lastSocket();
check(sockets.length === base + 3, 'backoff: retried');
ws.onclose({code: 4001});
advance(10 * 60000);
check(sockets.length === base + 3, 'client-bug close code: no reconnect');
s.ChatLive_SevenTvSync();
ws = lastSocket();
ws.server({op: 1, d: {heartbeat_interval: 45000}});
ws.onclose({code: 4007});
advance(299999);
check(sockets.length === base + 4, 'maintenance close code: no retry before 5 minutes');
advance(1);
check(sockets.length === base + 5, 'maintenance close code: retried after 5 minutes');

//Chat closed (the timer and cache steps of ChatLive_Clear): socket closed, timers stopped, nothing reopens
ws = lastSocket();
requests.length = 0; //15 minute checks made while the socket tests ran
s.ChatLive_ClearIds(0);
s.ChatLive_CacheRelease(0);
check(ws.closed, 'chat closed: socket closed');
advance(60 * 60000);
check(sockets.length === base + 5 && requests.length === 0, 'chat closed: no reconnect and no more checks');

//Real 7TV messages captured in order on a test channel (jsonreferences/7tv_emote_set_updates.json): a set switch,
//then adds, removes and renames, including the same emote twice under two names, both removed in one message
const real = JSON.parse(fs.readFileSync('jsonreferences/7tv_emote_set_updates.json', 'utf8'));
s.Chat_Id[1] = 9;
s.ChatLive_selectedChannel_id[1] = '222';
s.extraEmotes[1] = {};
s.ChatLive_loadEmotesChannelSeven_tvSuccess(usersResponse('SET0', []), 1, 9);
s.ChatLive_EmoteMeta['222'].user = 'USER7TV';
s.ChatLive_EmoteLiveStart(1, 9);
ws = lastSocket();
ws.server({op: 1, d: {heartbeat_interval: 45000}});
check(sentOps(ws).join('|') === '35 emote_set.update SET0|35 user.update USER7TV', 'real: the test channel is followed');
const expected = [
    [],
    ['COPIUM'],
    [],
    ['COPIUM'],
    ['copium'],
    ['copium', 'catJAM'],
    ['copium', 'catJAM', 'copitest'],
    ['catJAM'],
    ['catJAM', 'COPIUM'],
    ['catJAM', 'cope'],
    ['catJAM']
];
real.forEach((message, i) => {
    ws.server({op: 0, d: message});
    if (message.type === 'user.update') {
        check(requests.length === 1, 'real: the set switch fetches the new set');
        respond('7tv.io', JSON.parse(usersResponse('SET1', [])));
        check(sentOps(ws).slice(-2).join('|') === '36 emote_set.update SET0|35 emote_set.update SET1', 'real: the new set is followed');
    }
    const chat = Object.keys(s.extraEmotes[1]).sort().join(','),
        cache = Object.keys(s.extraEmotesDone.seven_tv['222']).sort().join(',');
    check(chat === expected[i].slice().sort().join(',') && cache === chat, 'real message ' + (i + 1) + ': chat has ' + (chat || 'nothing'));
});
check(
    s.extraEmotes[1].catJAM.chat_div.indexOf('https://cdn.7tv.app/emote/01F6MQ33FG000FFJ97ZB8MWV52/4x.webp') !== -1,
    'real: catJAM uses its 7TV image'
);

console.log(checks + ' live emote update checks passed');
