/* VOD chat paging: production Main_Addline/fetch-ahead definitions driven by a fake clock and fake GQL pages. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const vm = require('vm');
const assert = require('assert');
const UglifyJS = require('uglify-js');

/* APK side: the segment ID3 wall clock parser, plain Java compiled like ad-filter-tests (JDK 8+) */
function runJava() {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sptv-wallclock-'));
    const bin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') + path.sep : '';
    try {
        for (const [command, args] of [
            [
                'javac',
                [
                    '--release',
                    '8',
                    '-d',
                    output,
                    'apk/app/src/main/java/com/fgl27/twitch/SegmentWallClock.java',
                    'release/scripts/java/SegmentWallClockTest.java'
                ]
            ],
            ['java', ['-cp', output, 'com.fgl27.twitch.SegmentWallClockTest']]
        ]) {
            const result = spawnSync(bin + command, args, {encoding: 'utf8'});
            if (result.stderr) process.stderr.write(result.stderr);
            if (result.error) throw result.error;
            if (result.status !== 0) throw new Error(command + ' failed with exit ' + result.status + ': ' + result.stdout);
            if (result.stdout) process.stdout.write(result.stdout);
        }
    } finally {
        fs.rmSync(output, {recursive: true, force: true});
    }
}

const names = [
    'Chat_PlayerTime',
    'Chat_VodGap',
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
const varNames = ['Chat_FetchAheadSeconds', 'Chat_NextPendingTimeout', 'Chat_ResyncSeconds', 'Chat_VodGapMax'];

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

    //Real Date for parsing, fake clock for now()
    const FakeDate = function (value) {
        return new Date(value);
    };
    FakeDate.now = () => 1700000000000 + Math.round(h.clock * 1000);
    const h = {wallClock: 0, clock: 0, inflight: [], requests: 0, maxInflight: 0, shown: [], inits: 0, failNext: opts.failNext || 0, ended: false};
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
        Date: FakeDate,
        OSInterface_gettime: () => h.clock * 1000,
        //VOD timeline gap fixture: off unless a check turns PlayVod_isOn on
        PlayVod_isOn: false,
        Main_values_Play_data: [],
        OSInterface_getWallClockOffset: () => h.wallClock,
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
    //Initial page from a chat time, like Chat_loadChatRequest with Chat_offset
    h.start = function (fromTime) {
        const from = fromTime ? all.findIndex(m => m.time >= fromTime) : 0;
        s.Chat_loadChatSuccess(JSON.stringify(page(from)), 1);
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

function gapChecks(source, check) {
    const createdAt = '2026-11-20T01:53:15Z',
        created = Date.parse(createdAt);
    function gapHarness(gapSeconds) {
        const h = harness(source, {rate: 10, latency: 0.3});
        h.s.PlayVod_isOn = true;
        h.s.Main_values_Play_data[12] = createdAt;
        h.wallClock = created + gapSeconds * 1000;
        return h;
    }
    {
        //Values from VOD 2934472461 at 43 h: the timeline is 104 s short of the wall clock
        const h = gapHarness(104);
        h.clock = 154836;
        check(Math.round(h.s.Chat_PlayerTime()) === 154940, 'VOD chat time adds the stream downtime gap (issue #43)');
        h.s.PlayVod_isOn = false;
        check(h.s.Chat_PlayerTime() === 154836, 'clip/live chat time ignores the wall clock');
    }
    {
        const h = gapHarness(104);
        h.wallClock = 0;
        h.clock = 50;
        check(h.s.Chat_PlayerTime() === 50, 'unknown wall clock (older APK, no segment yet) keeps the raw position');
        h.wallClock = created + 7 * 3600 * 1000;
        check(h.s.Chat_PlayerTime() === 50, 'implausible gap past 6 h is ignored');
        h.wallClock = created - 120 * 1000;
        check(h.s.Chat_PlayerTime() === 50, 'wall clock well before the VOD creation is ignored');
        h.wallClock = created - 3600;
        check(Math.abs(h.s.Chat_PlayerTime() - 46.4) < 1e-6, 'small negative gap (transcode before VOD creation) is kept');
        h.s.Main_values_Play_data[12] = undefined;
        h.wallClock = created + 104000;
        check(h.s.Chat_PlayerTime() === 50, 'missing VOD creation date keeps the raw position');
    }
    {
        //Chat shown in step with the mapped time across a long session
        const h = gapHarness(104);
        h.clock = 0;
        h.start(104);
        h.runUntil(300);
        const lag = Math.max.apply(
            null,
            h.shown.map(m => m.at + 104 - m.time)
        );
        const early = h.shown.some(m => m.time > m.at + 104);
        check(lag <= 3 && !early && h.inits === 0, 'with a 104 s gap chat lines show at video time + gap (lag ' + lag.toFixed(1) + ')');
    }
}

function run(built = false) {
    if (!built) runJava();
    const source = definitions(built);
    let checks = 0;
    const check = (ok, label) => {
        assert.ok(ok, label);
        checks++;
    };
    runChecks(source, check);
    gapChecks(source, check);
    console.log(checks + ' VOD chat sync checks passed' + (built ? ' (generated definitions)' : ''));
}

module.exports = {definitions, harness, runChecks};
if (require.main === module) run(process.argv.includes('--built'));
