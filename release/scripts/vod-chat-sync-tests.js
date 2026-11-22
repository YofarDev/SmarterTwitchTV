/* VOD chat paging: production Main_Addline/fetch-ahead definitions driven by a fake clock and fake GQL pages. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const UglifyJS = require('uglify-js');

const names = [
    'Chat_PlayerTime',
    'Main_Addline',
    'Chat_FetchAhead',
    'Chat_loadChatNext',
    'Chat_loadChatNextRequest',
    'Chat_loadChatNextResult',
    'Chat_loadChatNextError',
    'Chat_loadChatPageDone',
    'Chat_MessageVector',
    'Chat_MessageVectorNext'
];
const varNames = ['Chat_FetchAheadSeconds', 'Chat_NextPendingTimeout', 'Chat_ResyncSeconds'];

function definitions(built) {
    const found = new Map();
    const files = built ? ['release/githubio/js/main_uncompressed.js'] : ['app/specific/ChatVod.js'];
    for (const file of files)
        UglifyJS.parse(fs.readFileSync(file, 'utf8')).walk(
            new UglifyJS.TreeWalker(node => {
                if (node instanceof UglifyJS.AST_Defun && names.includes(node.name.name)) found.set(node.name.name, node.print_to_string());
                if (node instanceof UglifyJS.AST_VarDef && varNames.includes(node.name.name) && node.value)
                    found.set(node.name.name, 'var ' + node.print_to_string() + ';');
            })
        );
    for (const name of names.concat(varNames)) assert.ok(found.has(name), 'production definition missing: ' + name);
    return [...found.values()].join('\n');
}

//rate: chat messages per second, latency: GQL round trip in seconds, pageSize: comments per page
function harness(source, opts) {
    const rate = opts.rate,
        latency = opts.latency,
        pageSize = opts.pageSize || 50,
        chatEnd = opts.chatEnd || 100000;
    const all = [];
    for (let n = 0, t = 0; t < chatEnd; n++, t = n / rate) all.push({id: 'm' + n, time: Math.floor(t)});

    const h = {clock: 0, inflight: [], requests: 0, maxInflight: 0, shown: [], inits: 0, failNext: opts.failNext || 0, ended: false};
    //Cursor is the index of the next page start, as an opaque string
    function page(from) {
        const items = all.slice(from, from + pageSize);
        return {cursor: items.length ? String(from + items.length) : '', comments: items};
    }

    const s = {
        Chat_Messages: [],
        Chat_MessagesNext: [],
        Chat_Position: 0,
        Chat_lastMsgTime: 0,
        Chat_cursor: null,
        Chat_hasEnded: false,
        Chat_loadingMore: false,
        Chat_JustStarted: true,
        Chat_offset: 0,
        Chat_Id: [1, 0],
        Chat_NextPendingAt: 0,
        Chat_loadChatNextId: 0,
        Chat_addLinesId: 0,
        ChannelVod_vodOffset: 0,
        Main_values: {ChannelVod_vodId: '1'},
        PlayClip_BaseUrl: 'gql',
        Play_base_chat_headers_Array: [],
        Chat_loadChatRequestPost_Cursor: '{"cursor":"%c"}',
        noop_fun: () => {},
        STR_BR: '',
        STR_CHAT_END: 'END',
        Date: {now: () => 1700000000000 + Math.round(h.clock * 1000)},
        OSInterface_gettime: () => h.clock * 1000,
        Main_Slice: a => a.slice(),
        Chat_Clean: () => {},
        Chat_Play: () => {},
        Chat_Init: () => h.inits++,
        Main_clearInterval: () => {},
        Main_setTimeout: (fn, ms) => {
            h.inflight.push({at: h.clock + ms / 1000, timer: fn});
            return 1;
        },
        Chat_loadChatRequest: () => {},
        ChatLive_ElementAdd: msg => {
            if (msg.time === undefined) h.ended = true;
            else h.shown.push({id: msg.id, time: msg.time, at: h.clock});
        },
        FullxmlHttpGet: (url, headers, callback, fail, id, chat, method, body) => {
            h.requests++;
            const from = Number(JSON.parse(body).cursor);
            const ok = h.failNext <= 0;
            if (!ok) h.failNext--;
            h.inflight.push({at: h.clock + latency, callback: callback, id: id, from: from, ok: ok});
            h.maxInflight = Math.max(h.maxInflight, h.inflight.filter(r => r.callback).length);
        },
        //Stand in for the comment parser: same cursor/vector/page-done flow as Chat_loadChatSuccess
        Chat_loadChatSuccess: (responseText, id) => {
            const p = JSON.parse(responseText),
                null_next = s.Chat_cursor === null;
            s.Chat_cursor = p.cursor;
            for (const c of p.comments) {
                const msg = {chat_number: 0, id: c.id, time: c.time, message: c.id};
                if (null_next) s.Chat_MessageVector(msg);
                else if (s.Chat_cursor !== '') s.Chat_MessageVectorNext(msg);
            }
            s.Chat_loadChatPageDone(id, null_next);
        }
    };
    vm.createContext(s);
    vm.runInContext(source, s);
    h.s = s;

    h.deliver = function () {
        const due = h.inflight.filter(r => r.at <= h.clock);
        h.inflight = h.inflight.filter(r => r.at > h.clock);
        for (const r of due) {
            if (r.timer) r.timer();
            else r.callback({status: r.ok ? 200 : 500, responseText: JSON.stringify(page(r.from))}, r.id);
        }
    };
    //Initial offset load, as Chat_loadChatRequest would deliver it
    h.start = function () {
        s.Chat_loadChatSuccess(JSON.stringify(page(0)), 1);
    };
    //Run until `seconds`, delivering responses every 100 ms and ticking Main_Addline every second
    h.runUntil = function (seconds) {
        while (h.clock < seconds) {
            h.clock = Math.round((h.clock + 0.1) * 10) / 10;
            h.deliver();
            if (Math.abs(h.clock - Math.round(h.clock)) < 1e-9) s.Main_Addline(1);
        }
    };
    h.all = all;
    return h;
}

function runChecks(source, check) {
    //Busy chats used to drift up to 200 s behind (one page per tick at most), then hard reset
    for (const rate of [5, 25, 60]) {
        for (const latency of [0.2, 0.5]) {
            const h = harness(source, {rate: rate, latency: latency});
            h.start();
            h.runUntil(600);
            const lag = Math.max.apply(
                null,
                h.shown.map(m => m.at - m.time)
            );
            const expected = h.all.filter(m => m.time < 599).length;
            const shownIds = new Set(h.shown.map(m => m.id));
            check(lag <= 3, 'rate ' + rate + '/s latency ' + latency + 's: chat lag stays within 3 s (got ' + lag.toFixed(1) + ')');
            check(h.inits === 0, 'rate ' + rate + '/s latency ' + latency + 's: no 200 s fallback reset');
            check(
                h.all.filter(m => m.time < 599).every(m => shownIds.has(m.id)) && h.shown.length >= expected,
                'rate ' + rate + '/s latency ' + latency + 's: every due message is shown, page last lines included'
            );
            check(h.maxInflight <= 1, 'rate ' + rate + '/s latency ' + latency + 's: one page request in flight at a time');
        }
    }
    {
        //Pages come one at a time (each needs the previous cursor), a slow link can't keep up with a
        //very busy chat; the lag is then bounded by the resync instead of drifting to minutes
        const h = harness(source, {rate: 150, latency: 1.5});
        h.start();
        h.s.Chat_Init = () => {
            h.inits++;
            const from = h.all.findIndex(m => m.time >= Math.floor(h.s.Chat_offset));
            h.s.Chat_Messages = [];
            h.s.Chat_MessagesNext = [];
            h.s.Chat_Position = 0;
            h.s.Chat_lastMsgTime = 0;
            h.s.Chat_cursor = null;
            h.s.Chat_NextPendingAt = 0;
            h.inflight = h.inflight.filter(r => !r.callback);
            h.inflight.push({
                at: h.clock + 1.5,
                timer: () => h.s.Chat_loadChatSuccess(JSON.stringify({cursor: String(from + 50), comments: h.all.slice(from, from + 50)}), 1)
            });
        };
        h.runUntil(600);
        const lag = Math.max.apply(
            null,
            h.shown.map(m => m.at - m.time)
        );
        check(
            h.inits > 0 && lag <= h.s.Chat_ResyncSeconds + 5,
            'slow link on a very busy chat resyncs within ' + h.s.Chat_ResyncSeconds + ' s (lag ' + lag.toFixed(1) + ')'
        );
    }
    {
        //Buffer stays bounded: requests stop once the buffer is far enough ahead of the player
        const h = harness(source, {rate: 10, latency: 0.3});
        h.start();
        h.runUntil(5);
        const last = h.s.Chat_MessagesNext.length ? h.s.Chat_MessagesNext : h.s.Chat_Messages;
        const ahead = last[last.length - 1].time - h.clock;
        check(ahead <= h.s.Chat_FetchAheadSeconds + 10, 'fetch ahead stops near the configured window (ahead ' + ahead + ' s)');
    }
    {
        //A failed page is retried by the error timer only, no duplicate request from the tick
        const h = harness(source, {rate: 60, latency: 0.3, failNext: 1});
        h.start();
        h.runUntil(60);
        check(h.maxInflight <= 1, 'failed page retry never overlaps a tick request');
        check(
            Math.max.apply(
                null,
                h.shown.map(m => m.at - m.time)
            ) <= 5,
            'chat catches up after a failed page'
        );
    }
    {
        //Chat that runs out ends with the end line instead of stalling
        const h = harness(source, {rate: 10, latency: 0.3, chatEnd: 30});
        h.start();
        h.s.Chat_lastMsgTime = 0;
        h.runUntil(40);
        const shownIds = new Set(h.shown.map(m => m.id));
        check(
            h.all.every(m => shownIds.has(m.id)),
            'short chat shows every message'
        );
    }
}

function run(built = false) {
    const source = definitions(built);
    let checks = 0;
    runChecks(source, (ok, label) => {
        assert.ok(ok, label);
        checks++;
    });
    console.log(checks + ' VOD chat sync checks passed' + (built ? ' (generated definitions)' : ''));
}

module.exports = {definitions, harness, runChecks};
if (require.main === module) run(process.argv.includes('--built'));
