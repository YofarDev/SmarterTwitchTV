/* Actual TV chat functions under a deterministic clock; no DOM/network credentials. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
function sandbox(source = fs.readFileSync('app/specific/ChatLive.js', 'utf8')) {
    let now = 1000, serial = 0;
    const timers = new Map(), rendered = [];
    const s = {
        Date: class extends Date { static now() { return now; } },
        Main_setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, {fn, due: now + (Number(delay) > 0 ? Number(delay) : 0)}); return id; },
        Main_clearTimeout: id => timers.delete(id),
        Main_clearInterval: () => {}, Main_Log: () => {},
        Play_ChatDelayPosition: 5000, Chat_CleanMax: 10,
        Main_helix_api: 'fixture/', noop_fun: () => {}, BaseXmlHttpGet: () => {},
        Settings_value: {disabled_shared: {defaultValue: false}, show_chatters: {defaultValue: false}},
        Main_A_equals_B: (a, b) => a === b,
        Chat_loadBadgesGlobalRequestWithChannel: () => {},
        Chat_tagCSS: () => {}, Chat_div: [{}, {}],
        Chat_loadBadgesTransform: obj => obj,
        AddUser_UsernameArray: [{id: 'account'}]
    };
    vm.createContext(s); vm.runInContext(source, s);
    s.ChatLive_ElementAdd = msg => rendered.push({id: msg.message, slot: msg.chat_number, time: now});
    s.Chat_Clean = () => {};
    s.Chat_Id = [1, 2]; s.ChatLive_Messages = [[], []]; s.ChatLive_LineAddCounter = [0, 0];
    function advance(end) {
        for (;;) {
            const next = [...timers].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
            if (!next) break;
            now = next[1].due; timers.delete(next[0]); next[1].fn();
        }
        now = end;
    }
    return {s, timers, rendered, advance, now: () => now};
}
const message = (id, slot = 0, addToStart = false) => ({message: id, chat_number: slot, addToStart});
for (const rate of [20, 100]) for (const delay of [0, 5000, 30000]) {
    const h = sandbox(), {s} = h;
    s.Play_ChatDelayPosition = delay;
    for (let i = 0; i < rate * 2; i++) {
        h.advance(1000 + i * 1000 / rate);
        for (let slot = 0; slot < 2; slot++) s.ChatLive_LineAddCheckDelay(slot, message(i, slot));
        check(h.timers.size <= (delay ? 2 : 0), 'one timer per slot at ' + rate + '/s delay ' + delay);
    }
    h.advance(40000);
    check(h.rendered.length === rate * 4, 'all workload messages delivered');
    check(h.rendered.every(x => x.time >= 1000 + x.id * 1000 / rate + delay), 'captured deadlines respected');
}
{
    const h = sandbox(), {s} = h;
    for (let i = 0; i < 1000; i++) s.ChatLive_LineAddCheckDelay(0, message(i));
    check(h.timers.size === 1, '1000 pending messages use one timer');
    h.advance(5999); check(h.rendered.length === 0, 'no early delivery');
    h.advance(6000); check(h.rendered.map(x => x.id).every((x, i) => x === i), 'ties keep arrival order');
    s.Play_ChatDelayPosition = 30000; s.ChatLive_LineAddCheckDelay(0, message('late'));
    s.Play_ChatDelayPosition = 5000; s.ChatLive_LineAddCheckDelay(0, message('early'));
    h.advance(11000); check(h.rendered.at(-1).id === 'early', 'decrease rearms earlier deadline');
    s.Play_ChatDelayPosition = 40000; s.ChatLive_LineAddCheckDelay(0, message('latest'));
    h.advance(36000); check(h.rendered.at(-1).id === 'late', 'increase preserves older deadline');
    s.ChatLive_LineAddCheckDelay(1, message('other', 1));
    const stale = [...h.timers.values()][0].fn;
    s.ChatLive_DelayClear(0); stale();
    check(s.ChatLive_Delayed[0] === null && h.timers.size === 1, 'clear releases only its slot and stale timer cannot rearm');
    h.advance(100000); check(h.rendered.at(-1).id === 'other', 'second slot continues');
    s.ChatLive_LineAddCheckDelay(0, message('prepend', 0, true));
    check(h.rendered.at(-1).id === 'prepend', 'history prepend bypasses delay');
    s.Play_ChatDelayPosition = 1; s.ChatLive_Latency[0] = NaN;
    s.ChatLive_LineAddCheckDelay(0, message('invalid')); h.advance(h.now());
    check(h.rendered.at(-1).id === 'invalid', 'invalid latency uses zero timeout');
    s.Play_ChatDelayPosition = 5; s.ChatLive_Playing = false;
    for (let i = 0; i < 1000; i++) s.ChatLive_LineAddCheckDelay(0, message(i));
    h.advance(h.now() + 5);
    check(s.ChatLive_Messages[0].length === 21 && s.ChatLive_Messages[0][0].message === 979, 'existing pause cap/order preserved');
    s.ChatLive_Playing = true;
    s.ChatLive_Messages[0].forEach(s.ChatLive_LineAdd);
    check(h.rendered.at(-1).id === 999, 'paused rows replay in order');
    s.ChatLive_LineAddCheckDelay(0, message('old generation')); s.Chat_Id[0]++;
    h.advance(h.now() + 5); check(h.rendered.at(-1).id === 999, 'generation prevents obsolete delivery');
    s.ChatLive_ElementAdd = () => s.ChatLive_DelayClear(0);
    s.ChatLive_LineAddCheckDelay(0, message('reentrant')); s.ChatLive_LineAddCheckDelay(0, message('never'));
    h.advance(h.now() + 5); check(s.ChatLive_Delayed[0] === null, 'reentrant clear stops drain');
}
{
    const {s} = sandbox();
    s.ChatLive_selectedChannel_id = ['active0', 'active1'];
    const shared = Array.from({length: 100}, (_, i) => ({broadcaster_id: 'shared' + i}));
    s.ChatLive_CacheSetPins(0, shared); s.ChatLive_CacheSetPins(1, [shared[0]]);
    const providers = ['bttv', 'ffz', 'seven_tv', 'ChannelEmotes', 'BadgesChannel', 'cheers'];
    function populate(id) {
        providers.forEach(p => s.extraEmotesDone[p][id] = {fixture: id});
        s.cheers[id] = {fixture: id}; s.ChatLive_sharedProfileImg[id] = id;
        s.ChatLive_CacheTouch(id);
    }
    ['active0', 'active1', ...shared.map(x => x.broadcaster_id)].forEach(populate);
    for (let i = 0; i < 100; i++) populate('visit' + i);
    check(s.ChatLive_CacheRecent.length === 122, '20 inactive plus pinned union');
    check(providers.every(p => Object.keys(s.extraEmotesDone[p]).length === 122), 'providers evict together');
    check(Object.keys(s.cheers).length === 122 && Object.keys(s.ChatLive_sharedProfileImg).length === 122, 'derived cheer/image data evicts too');
    s.ChatLive_CacheTouch('visit80'); populate('new');
    check(s.extraEmotesDone.bttv.visit80 && !s.extraEmotesDone.bttv.visit81, 'reuse refreshes recency');
    s.ChatLive_CacheSetPins(0, []);
    check(s.extraEmotesDone.bttv.shared0, 'second slot keeps shared pin');
    check(s.ChatLive_CacheRecent.length === 23, 'departed shared participants unpin');
    delete s.extraEmotesDone.ChannelEmotes.active0;
    s.ChatLive_loadEmotesChannelBTTVSuccess('{}', 0, -1);
    s.ChatLive_loadChannelEmotesSuccess('{}', 0, -1);
    check(!s.extraEmotesDone.ChannelEmotes.active0, 'stale responses cannot publish');
    let requests = 0; s.BaseXmlHttpGet = () => requests++;
    s.ChatLive_loadChannelEmotes(0, 1); s.ChatLive_loadChannelEmotes(0, 1);
    check(requests === 2 && !s.extraEmotesDone.ChannelEmotes.active0, 'failed/incomplete channel load remains retryable');
    s.ChatLive_loadChannelEmotesSuccess('{"data":[]}', 0, 1); s.ChatLive_loadChannelEmotes(0, 1);
    check(requests === 2 && s.extraEmotesDone.ChannelEmotes.active0, 'empty successful channel result is cached');
    s.extraEmotes[0] = {}; s.extraEmotes[1] = {};
    s.ChatLive_updateExtraEmotes({same: {id: 'a'}}, 0); s.ChatLive_updateExtraEmotes({same: {id: 'b'}}, 1);
    check(s.extraEmotes[0].same.id === 'a' && s.extraEmotes[1].same.id === 'b', 'colliding emotes stay slot-local');
    for (const [provider, callback, empty] of [
        ['bttv', 'ChatLive_loadEmotesChannelBTTVSuccess', {channelEmotes: [], sharedEmotes: []}],
        ['ffz', 'ChatLive_loadEmotesChannelFFZSuccess', {sets: {}}],
        ['seven_tv', 'ChatLive_loadEmotesChannelSeven_tvSuccess', {id: 'fixture', emote_set: null}]
    ]) {
        delete s.extraEmotesDone[provider].active0;
        s[callback]('{}', 0, 1);
        check(!s.extraEmotesDone[provider].active0, provider + ' incomplete response remains retryable');
        s[callback](JSON.stringify(empty), 0, 1);
        check(s.extraEmotesDone[provider].active0 && Object.keys(s.extraEmotesDone[provider].active0).length === 0, provider + ' empty success cached');
    }
    s.ChatLive_sharedChannelBadgeLoaded = [{}, {}];
    s.ChatLive_updateBanner = () => {};
    s.ChatLive_checkSharedSuccess(JSON.stringify({data: [{participants: [{broadcaster_id: 'current-shared'}]}]}), 0, 1);
    check(s.ChatLive_CachePins[0]['current-shared'] && !s.ChatLive_CachePins[0].shared99, 'latest shared session rebuilds pins');
    s.ChatLive_SharedShowedWarning[0] = true;
    s.ChatLive_updateBannerSuccess(JSON.stringify({data: [{id: 'departed', display_name: 'Departed', profile_image_url: 'fixture'}]}), 0, 1);
    check(!s.ChatLive_sharedProfileImg.departed, 'late participant response cannot refill departed image');
    s.ChatLive_checkSharedSuccess('{"data":[]}', 0, 1);
    check(Object.keys(s.ChatLive_CachePins[0]).join(',') === 'active0', 'shared session departure unpins participants');
}
{
    const h = sandbox(), {s} = h;
    const noop = () => {};
    s.Settings_value = new Proxy({}, {get: () => ({defaultValue: 0})});
    s.Main_values = {Play_ChatForceDisable: false}; s.Main_IsOn_OSInterface = true;
    s.AddUser_IsUserSet = () => false;
    s.Chat_loadBadgesGlobal = noop; s.Chat_loadBadgesGlobalRequest = noop;
    s.ChatLive_loadCheersChannel = noop; s.ChatLive_loadEmotesChannelBTTV = noop;
    s.ChatLive_loadEmotesChannelFFZ = noop; s.ChatLive_loadEmotesChannelSeven_tv = noop;
    s.ChatLive_StartShared = noop; s.ChatLive_PreLoadChat = noop; s.ChatLive_loadChat = noop;
    s.ChatLive_SendStart = noop; s.ChatLive_loadChatters = noop;
    s.ChatLive_Close = noop; s.ChatLive_SendClose = noop; s.ChatLive_CheckClear = noop;
    s.ChatLive_resetChatters = noop; s.Main_emptyWithEle = noop;
    s.Play_data = {data: []}; s.PlayExtra_data = {data: []};
    s.Play_data.data[14] = 'first'; s.Play_data.data[6] = 'First';
    s.PlayExtra_data.data[14] = 'second'; s.PlayExtra_data.data[6] = 'Second';
    s.ChatLive_SetOptions(0, 'first', 'First');
    const oldId = s.Chat_Id[0];
    s.ChatLive_LineAddCheckDelay(0, message('stale after SkipClear'));
    const stale = [...h.timers.values()][0].fn;
    s.ChatLive_Init(0, true);
    stale();
    check(s.Chat_Id[0] !== oldId && s.ChatLive_Delayed[0] === null && h.rendered.length === 0, 'SkipClear initialization releases queued objects and replaces generation');
    const mockDiv = () => {
        const el = {children: [], parentNode: null, isFragment: false};
        Object.defineProperty(el, 'firstChild', {get: () => el.children[0] || null});
        el.appendChild = child => {
            const adopt = c => {
                if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1);
                c.parentNode = el;
                el.children.push(c);
            };
            //appending a document fragment inserts its children and empties it
            if (child.isFragment) {
                child.children.slice().forEach(adopt);
                child.children.length = 0;
            } else adopt(child);
        };
        return el;
    };
    s.document = {createDocumentFragment: () => Object.assign(mockDiv(), {isFragment: true})};
    const chat0 = mockDiv(), chat1 = mockDiv(), logged0 = mockDiv(), logged1 = mockDiv();
    const lineA = mockDiv(), lineB = mockDiv(), nameA = mockDiv(), nameB = mockDiv();
    chat0.appendChild(lineA); chat1.appendChild(lineB);
    logged0.appendChild(nameA); logged1.appendChild(nameB);
    s.Chat_div = [chat0, chat1];
    s.Main_getElementById = id => (id === 'chat_loggedin0' ? logged0 : logged1);
    s.ChatLive_LineAddCheckDelay(0, message('switch0')); s.ChatLive_LineAddCheckDelay(1, message('switch1', 1));
    const lineWaiting = mockDiv();
    s.ChatLive_InsertLast[0] = h.now(); //inside the insert interval, so the line waits
    s.ChatLive_InsertLine(0, lineWaiting);
    s.ChatLive_Switch(); h.advance(10000);
    check(h.timers.size === 0 && h.rendered.length === 0, 'switch releases both scheduler queues');
    check(chat0.firstChild === lineB && chat1.firstChild === lineA, 'switch moves the line nodes between chats');
    check(chat1.children[1] === lineWaiting && chat0.children.length === 1, 'switch moves a line still waiting for its insert with its chat');
    check(logged0.firstChild === nameB && logged1.firstChild === nameA, 'switch moves the logged in labels');
    check(s.ChatLive_SpamLast[0] === null && s.ChatLive_SpamLast[1] === null, 'switch resets the spam trackers');
    s.extraEmotes[0] = {fixture: {}};
    s.ChatLive_Clear(0);
    check(Object.keys(s.extraEmotes[0]).length === 0 && Object.keys(s.ChatLive_CachePins[0]).length === 0, 'clear releases active emotes and pins');
}
{
    const {s} = sandbox();
    s.extraEmotes[0] = {};
    s.ChatLive_selectedChannel_id[0] = 'channel';
    s.ChatLive_CacheSetPins(0, []);
    s.emoteURLFromObj = images => images.url_4x;
    s.emoteTemplate = url => '<img src="' + url + '">';
    const response = JSON.stringify({data: [{id: '42', name: 'FixtureEmote', theme_mode: ['dark'], images: {url_4x: 'fixture.png'}}]});
    let requested = 0;
    s.BaseXmlHttpGet = () => requested++;
    s.ChatLive_loadChannelEmotes(0, 1);
    s.ChatLive_loadChannelEmotes(0, 1);
    check(requested === 2, 'overlapping channel loads both requested');
    s.ChatLive_loadChannelEmotesSuccess(response, 0, 1);
    s.ChatLive_loadChannelEmotesSuccess(response, 0, 1);
    check(s.extraEmotesDone.ChannelEmotes.channel.FixtureEmote.id === 'FixtureEmote42', 'overlapping response preserves populated cache despite account dedup');
    s.AddUser_UsernameArray[0].id = 'second-account';
    s.ChatLive_loadChannelEmotes(0, 1);
    check(s.userEmote['second-account'].FixtureEmote.id === 'FixtureEmote42', 'picker restores cached emote after account switch');
    s.AddUser_UsernameArray[0].id = 'account';
    s.ChatLive_CacheRelease(0);
    for (let i = 0; i < 21; i++) s.ChatLive_CacheTouch('evict' + i);
    check(!s.extraEmotesDone.ChannelEmotes.channel && s.userEmote.account.FixtureEmote, 'channel eviction leaves intentional account-level copy');
    s.ChatLive_selectedChannel_id[0] = 'channel';
    s.ChatLive_CacheSetPins(0, []);
    s.ChatLive_loadChannelEmotes(0, 1);
    s.ChatLive_loadChannelEmotesSuccess(response, 0, 1);
    check(s.extraEmotesDone.ChannelEmotes.channel.FixtureEmote.id === 'FixtureEmote42', 'reload rebuilds evicted cache independently of account copy');
    s.AddUser_UsernameArray[0].id = 'third-account';
    s.ChatLive_loadChannelEmotes(0, 1);
    check(s.userEmote['third-account'].FixtureEmote.id === 'FixtureEmote42', 'eviction reload account switch preserves picker');
}
{
    //Consecutive identical messages merge into the last line with a (xN) counter
    const h = sandbox(), {s} = h;
    const makeEl = () => {
        const el = {
            children: [],
            parentNode: null,
            className: '',
            textContent: '',
            appendChild(c) {
                c.parentNode = this;
                this.children.push(c);
            },
            get lastChild() {
                return this.children[this.children.length - 1] || null;
            }
        };
        return el;
    };
    s.document = {createElement: () => makeEl()};
    s.ChatLive_ElementAdd = msg => {
        msg.element = makeEl();
        makeEl().appendChild(msg.element); //holder that keeps the line attached, as Chat_div does
        h.rendered.push({text: msg.text, nick: msg.nick, time: h.now()});
    };
    const spam = (text, nick, extra) => s.ChatLive_LineAddCheckDelay(0, Object.assign({message: text, text: text, nick: nick, chat_number: 0}, extra));

    spam('hello', 'a');
    h.advance(6000); //sandbox default 5s chat delay
    check(h.rendered.length === 1, 'spam: first message renders');
    spam('hello', 'a');
    spam('hello', 'a');
    h.advance(11000);
    check(h.rendered.length === 1, 'spam: repeats delivered inside the window merge into the first line');
    check(s.ChatLive_SpamLast[0].count === 3, 'spam: counter grew to 3');
    const span = s.ChatLive_SpamLast[0].el.lastChild;
    check(span.className === 'chat_spam_count' && span.textContent === ' (x3)', 'spam: counter span created and updated');

    spam('hello', 'b');
    h.advance(16000);
    check(h.rendered.length === 2, 'spam: same text from another user is a new line');
    spam('hello', 'a');
    h.advance(21000);
    check(h.rendered.length === 3 && s.ChatLive_SpamLast[0].count === 1, 'spam: a line in between breaks the streak');

    h.advance(60000);
    spam('hello', 'a');
    h.advance(65000);
    check(h.rendered.length === 4 && s.ChatLive_SpamLast[0].count === 1, 'spam: repeat after the window is a new line');

    //History prepends and system lines never merge and reset the tracker
    spam('prepend', 'a', {addToStart: true});
    check(h.rendered.length === 5 && s.ChatLive_SpamLast[0] === null, 'spam: history prepend renders and resets the tracker');
    s.ChatLive_LineAddCheckDelay(0, {message: 'system', chat_number: 0});
    h.advance(71000);
    check(h.rendered.length === 6 && s.ChatLive_SpamLast[0] === null, 'spam: system line renders and resets the tracker');
    spam('hello', 'a');
    h.advance(76000);
    check(h.rendered.length === 7, 'spam: repeat after a system line is a new line');

    //Chat_Clean removed the tracked line, further repeats must not merge into the detached node
    s.ChatLive_SpamLast[0].el.parentNode = null;
    spam('hello', 'a');
    h.advance(82000);
    check(h.rendered.length === 8 && s.ChatLive_SpamLast[0].count === 1, 'spam: detached tracked line starts a new visible line');

    //A channel switch/restart clears the tracker, no merge across chats
    spam('hello', 'a');
    h.advance(88000);
    check(s.ChatLive_SpamLast[0].count === 2, 'spam: still merges while attached');
    s.ChatLive_DelayClear(0);
    check(s.ChatLive_SpamLast[0] === null, 'spam: channel switch clears the tracker');
    spam('hello', 'a');
    h.advance(94000);
    check(h.rendered.length === 9 && s.ChatLive_SpamLast[0].count === 1, 'spam: identical message after switch is a new line');
}
{
    //A burst drain is split into batches so one task never appends every line
    const h = sandbox(), {s} = h;
    s.Play_ChatDelayPosition = 5000;
    s.ChatLive_DelayDrainBatch = 2;
    for (let i = 0; i < 4; i++) s.ChatLive_LineAddCheckDelay(0, message(i));
    const fire = () => {
        const next = [...h.timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        h.timers.delete(next[0]);
        next[1].fn();
    };
    //make everything due without moving the fake clock past the deadlines
    s.ChatLive_Delayed[0].queue.forEach(e => (e.due = 0));
    [...h.timers.values()][0].due = 0;
    fire();
    check(h.rendered.length === 2 && h.timers.size === 1, 'drain delivers at most one batch per task');
    fire();
    check(h.rendered.length === 4 && h.timers.size === 0, 'remaining batch is delivered on the next task');
}
{
    //The line entry animation is skipped above ChatLive_AniRateMax lines per second
    const h = sandbox(), {s} = h;
    s.Play_ChatEnable = true;
    s.ChatLive_chat_line_class = 'chat_line_animation chat_line_holder';
    let animated = 0;
    for (let i = 0; i < 15; i++) if (s.ChatLive_AniClassName(0) === s.ChatLive_chat_line_class) animated++;
    check(animated === 10, 'animation applies up to the per second limit');
    s.Play_ChatEnable = false;
    check(s.ChatLive_AniClassName(0) === 'chat_line_holder', 'hidden chat never animates');
    s.Play_ChatEnable = true;
    h.advance(h.now() + 2000);
    check(s.ChatLive_AniClassName(0) === s.ChatLive_chat_line_class, 'limit resets on the next second');
}
{
    //Batched line inserts: a busy chat touches the DOM at most once per ChatLive_InsertInterval
    const h = sandbox(), {s} = h;
    const mockDiv = () => {
        const el = {children: [], parentNode: null, isFragment: false, inserts: 0};
        el.appendChild = child => {
            el.inserts++;
            const adopt = c => {
                if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1);
                c.parentNode = el;
                el.children.push(c);
            };
            if (child.isFragment) {
                child.children.slice().forEach(adopt);
                child.children.length = 0;
            } else adopt(child);
        };
        return el;
    };
    s.document = {createDocumentFragment: () => Object.assign(mockDiv(), {isFragment: true})};
    const chat0 = mockDiv(), chat1 = mockDiv();
    s.Chat_div = [chat0, chat1];
    const line = name => ({name: name, parentNode: null});
    const names = div => div.children.map(c => c.name).join(',');
    const interval = s.ChatLive_InsertInterval;

    s.ChatLive_InsertLine(0, line('a'));
    check(names(chat0) === 'a' && chat0.inserts === 1 && h.timers.size === 0, 'insert: a line after a quiet period is inserted at once');
    h.advance(h.now() + 100);
    s.ChatLive_InsertLine(0, line('b'));
    s.ChatLive_InsertLine(0, line('c'));
    check(names(chat0) === 'a' && h.timers.size === 1, 'insert: lines inside the interval wait, one timer');
    s.ChatLive_InsertLine(1, line('x'));
    check(names(chat1) === 'x', 'insert: each chat keeps its own interval');
    h.advance(h.now() + interval - 101);
    check(names(chat0) === 'a', 'insert: nothing before the interval ends');
    h.advance(h.now() + 1);
    check(names(chat0) === 'a,b,c' && chat0.inserts === 2, 'insert: waiting lines go in together, in order, with one DOM insert');

    const before = chat0.inserts, start = h.now();
    for (let i = 0; i < 40; i++) {
        h.advance(start + i * 125); //8 lines per second for 5 seconds
        s.ChatLive_InsertLine(0, line('f' + i));
    }
    h.advance(start + 40 * 125 + interval);
    const flood = chat0.children.slice(3).map(c => c.name);
    check(flood.length === 40 && flood.every((n, i) => n === 'f' + i), 'insert: a flood keeps every line in order');
    check(chat0.inserts - before <= Math.ceil((40 * 125) / interval) + 1, 'insert: 8 lines a second touch the DOM at most twice a second');

    h.advance(h.now() + interval * 2);
    s.ChatLive_InsertLine(0, line('quiet'));
    s.ChatLive_InsertLine(0, line('late'));
    check(names(chat0).slice(-6) === ',quiet' && h.timers.size === 1, 'insert: a line right behind an insert waits for the interval');
    s.ChatLive_ClearIds(0);
    h.advance(h.now() + interval * 2);
    check(names(chat0).indexOf('late') === -1 && h.timers.size === 0, 'insert: clearing a chat drops its waiting lines and timer');

    //The real ChatLive_ElementAdd (the sandbox stubs it) hands its line to the batched insert
    const source = fs.readFileSync('app/specific/ChatLive.js', 'utf8');
    const start2 = source.indexOf('function ChatLive_ElementAdd(');
    const end2 = source.slice(start2).search(/\r?\n\}\r?\n/); //ChatLive.js is stored with CRLF
    s.ChatLive_ElementAdd = vm.runInContext('(' + source.slice(start2, start2 + end2) + '\n})', s);
    s.document.createElement = () => {
        const el = mockDiv();
        Object.defineProperty(el, 'innerHTML', {set: html => el.appendChild(Object.assign(mockDiv(), {html: html}))});
        Object.defineProperty(el, 'firstChild', {get: () => el.children[0] || null});
        return el;
    };
    Object.assign(s, {Play_ChatEnable: true, ChatLive_chat_line_class: 'chat_line_holder', ChatLive_Individual_Background: 0});
    const div = mockDiv();
    s.Chat_div = [div, chat1];
    h.advance(h.now() + interval);
    s.ChatLive_ElementAdd({chat_number: 0, message: 'one'});
    s.ChatLive_ElementAdd({chat_number: 0, message: 'two'});
    check(div.children.length === 1 && h.timers.size === 1, 'insert: ElementAdd inserts the first line and holds the next');
    h.advance(h.now() + interval);
    const second = div.children[1] && div.children[1].firstChild.html;
    check(div.children.length === 2 && div.inserts === 2 && second.indexOf('two') !== -1, 'insert: ElementAdd lines reach the chat in order');
}
{
    //twemoji: non ASCII text without emoji code units skips the emoji scan
    const s = {};
    vm.createContext(s);
    vm.runInContext(fs.readFileSync('app/thirdparty/twemoji.js', 'utf8'), s);
    check(s.twemoji.parse('hello') === 'hello', 'twemoji: ascii fast path unchanged');
    check(s.twemoji.parse('Привет мир') === 'Привет мир', 'twemoji: cyrillic skips the scan');
    check(s.twemoji.parse('Καλημέρα') === 'Καλημέρα', 'twemoji: greek skips the scan');
    check(s.twemoji.parse('こんにちは') === 'こんにちは', 'twemoji: CJK skips the scan');
    check(s.twemoji.parse('مرحبا') === 'مرحبا', 'twemoji: arabic skips the scan');
    check(s.twemoji.parse('Привет <мир>') === 'Привет &lt;мир&gt;', 'twemoji: fast path keeps the html escape');
    check(s.twemoji.parse('😀').indexOf('<img') === 0 && s.twemoji.parse('😀').indexOf('1f600') !== -1, 'twemoji: emoji still parsed');
    check(s.twemoji.parse('hi 😀 there').indexOf('<img') !== -1, 'twemoji: emoji inside text still parsed');
    check(s.twemoji.parse('❤️').indexOf('2764') !== -1, 'twemoji: variation selector emoji still parsed');
    check(s.twemoji.parse('©️').indexOf('a9') !== -1, 'twemoji: single code unit emoji still parsed');
    check(s.twemoji.parse('㊗️').indexOf('<img') !== -1, 'twemoji: block edge emoji still parsed');
    check(s.twemoji.parse('👨‍👩‍👧').indexOf('1f468-200d-1f469-200d-1f467') !== -1, 'twemoji: zwj family still parsed');
}
console.log(checks + ' TV scheduler/cache checks passed');
module.exports = {sandbox, message};
