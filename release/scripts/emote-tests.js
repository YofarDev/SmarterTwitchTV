/* "Animated emotes" chat option: real emote loaders and tokenizer, fixture API data, no network. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}

function sandbox() {
    //Offscreen still checks: images are recorded, the test decides each one's pixels (alpha) on load
    const images = [],
        elements = {},
        rules = [],
        timers = [],
        storage = {};
    const s = {
        Main_Log: () => {},
        Main_A_includes_B: (a, b) => a.indexOf(b) !== -1,
        Main_startsWith: (a, b) => a.indexOf(b) === 0,
        twemoji: {parse: text => text},
        Settings_value: {chat_animated_emotes: {defaultValue: 1}},
        Image: function () {
            this.naturalWidth = 112;
            images.push(this);
        },
        Main_getElementById: id => elements[id] || null,
        Main_setTimeout: fn => {
            timers.push(fn);
            return timers.length;
        },
        Main_getItemJson: (key, def) => {
            if (storage.__throw) throw new SyntaxError('bad json');
            return storage.hasOwnProperty(key) ? JSON.parse(storage[key]) : def;
        },
        Main_setItem: (key, value) => {
            storage[key] = value;
            return true;
        },
        document: {
            head: {appendChild: el => (elements[el.id] = el)},
            createElement: tag =>
                tag === 'canvas'
                    ? {
                          getContext: () => ({
                              drawImage: () => {},
                              getImageData: (x, y, w, h) => {
                                  if (s.__alpha === 'throw') throw new Error('tainted');
                                  const data = new Uint8ClampedArray(w * h * 4);
                                  for (let i = 3; i < data.length; i += 4) data[i] = s.__alpha;
                                  return {data: data};
                              }
                          })
                      }
                    : {sheet: {cssRules: rules, insertRule: rule => rules.push(rule)}}
        }
    };
    s.__images = images;
    s.__rules = rules;
    s.__timers = timers;
    s.__storage = storage;
    vm.createContext(s);
    for (const file of ['app/thirdparty/kapchat.js', 'app/specific/ChatLive.js', 'app/specific/ChatVod.js'])
        vm.runInContext(fs.readFileSync(file, 'utf8'), s);
    s.emoteURLSize = '2.0';
    s.ChatLive_selectedChannel_id = ['channel', 'other'];
    s.extraEmotes = [{}, {}];
    s.extraEmotesDone.bttv.channel = {};
    s.extraEmotesDone.seven_tv.channel = {};
    //Background emote prefetch off unless a test turns it on: its images would mix with the still checks
    s.ChatLive_EmoteWarmParallel = 0;
    return s;
}

const s = sandbox();
check(s.ChatLive_AnimatedEmotes === true, 'animated emotes are on by default');

//BTTV: only animated emotes get a still image (BTTV has no /static/ for the others)
s.ChatLive_loadEmotesbttvChannel(
    [
        {id: 'aaaaaaaaaaaaaaaaaaaaaaaa', code: 'Dance', animated: true},
        {id: 'bbbbbbbbbbbbbbbbbbbbbbbb', code: 'Still', animated: false}
    ],
    0
);
const dance = s.extraEmotes[0].Dance,
    still = s.extraEmotes[0].Still;
check(dance.chat_div.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/2x"') !== -1 && dance.chat_div.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/3x 3x') !== -1, 'bttv: animated template src 2x with 3x kept in the srcset');
check(
    dance.chat_div_static.indexOf('/emote/aaaaaaaaaaaaaaaaaaaaaaaa/static/2x.webp') !== -1 &&
        dance.chat_div_static.indexOf('/static/1x.webp 1x,') !== -1 &&
        dance.chat_div_static.indexOf('/static/2x.webp 2x,') !== -1,
    'bttv: animated emote gets the /static/ webp image and srcset'
);
check(still.chat_div_static === null, 'bttv: static emote has no still variant');
check(s.extraEmotesDone.bttv.channel.Dance.chat_div_static === dance.chat_div_static, 'bttv: channel cache keeps the still variant');

s.Chat_loadEmotesbttvGlobal([{id: 'cccccccccccccccccccccccc', code: 'GlobalDance', animated: true}]);
check(
    s.extraEmotes[1].GlobalDance.chat_div_static.indexOf('/cccccccccccccccccccccccc/static/') !== -1 &&
        s.extraEmotesDone.bttvGlobal.GlobalDance.chat_div_static === s.extraEmotes[1].GlobalDance.chat_div_static,
    'bttv global: still variant in both chats and the cache'
);

//7TV: still image from static_name, srcset sizes stay 1x/2x
const files = name => [
    {name: '1x.webp', static_name: '1x_static.webp', format: 'WEBP'},
    {name: '2x.webp', static_name: '2x_static.webp', format: 'WEBP'},
    {name: '2x.avif', static_name: '2x_static.avif', format: 'AVIF'}
];
s.ChatLive_loadEmotesseven_tv(
    {
        emote_set: {
            emotes: [
                {name: 'Wiggle', data: {id: 'w', name: 'x', animated: true, flags: 256, host: {url: '//cdn.7tv.app/emote/w', files: files()}}},
                {name: 'Rock', data: {id: 'r', name: 'x', animated: false, host: {url: '//cdn.7tv.app/emote/r', files: files()}}}
            ]
        }
    },
    0,
    false
);
const wiggle = s.extraEmotes[0].Wiggle;
check(
    wiggle.chat_div_static.indexOf('src="https://cdn.7tv.app/emote/w/2x_static.webp"') !== -1 &&
        wiggle.chat_div_static.indexOf('1x_static.webp 1x,') !== -1 &&
        wiggle.chat_div_static.indexOf('2x_static.webp 2x"') !== -1,
    '7tv: animated emote gets the static_name image with 1x/2x srcset'
);
check(wiggle.chat_div.indexOf('/emote/w/1x.webp 1x,') !== -1, '7tv: animated template srcset unchanged');
check(s.extraEmotes[0].Rock.chat_div_static === null, '7tv: static emote has no still variant');
check(s.extraEmotesDone.seven_tv.channel.Wiggle.chat_div_static === wiggle.chat_div_static, '7tv: channel cache keeps the still variant');

//Cached emotes copied back for a later chat keep the still variant
s.ChatLive_updateExtraEmotes(s.extraEmotesDone.bttv.channel, 1);
check(s.extraEmotes[1].Dance.chat_div_static === dance.chat_div_static, 'cache restore keeps the still variant');

//Cheermotes: Helix gives animated and static tiers
s.Chat_Id = [1, 2];
s.ChatLive_CacheTouch = () => {};
const tier = kind => ({
    1: 'https://cheer/dark/' + kind + '/100/1.' + (kind === 'animated' ? 'gif' : 'png'),
    4: 'https://cheer/dark/' + kind + '/100/4.' + (kind === 'animated' ? 'gif' : 'png')
});
s.ChatLive_loadCheersChannelSuccess(
    JSON.stringify({data: [{prefix: 'Cheer', tiers: [{min_bits: 100, images: {dark: {animated: tier('animated'), static: tier('static')}}}]}]}),
    0,
    1
);

//Tokenizer and Twitch emote URLs follow the option
const line = () => s.extraMessageTokenize('hi Dance Still Wiggle Cheer100', 0, 100);
let html = line();
check(html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/2x"') !== -1 && html.indexOf('/static/') === -1, 'on: animated emotes and cheers stay animated');
check(html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/3x"') === -1, 'on: the main src is 2x, 3x only exists in the srcset');
check(s.emoteURL('25').indexOf('/emoticons/v2/25/default/dark/2.0') !== -1, 'on: twitch emotes use the default (animated) format');

s.ChatLive_AnimatedEmotes = false;
html = line();
check(
    html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/static/2x.webp') !== -1 && html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/2x"') === -1,
    'off: bttv animated emote shows its still image'
);
check(html.indexOf('/bbbbbbbbbbbbbbbbbbbbbbbb/2x"') !== -1, 'off: static emotes are unchanged');
check(
    html.indexOf('zero-width-container') !== -1 && html.indexOf('zero-width-emote" alt="" srcset="https://cdn.7tv.app/emote/w/1x_static.webp') !== -1,
    'off: zero-width 7tv emote uses its still image'
);
check(html.indexOf('https://cheer/dark/static/100/4.png') !== -1 && html.indexOf('/animated/') === -1, 'off: cheermote uses the static tier');
check(s.emoteURL('25').indexOf('/emoticons/v2/25/static/dark/2.0') !== -1, 'off: twitch emotes use the static format');

//Stills are first frames, empty for emotes that animate in: each still is checked once, a blank one
//falls back to the animation (new lines) and a CSS rule swaps lines already built with it
const loadStill = (part, alpha) => {
    const img = s.__images.find(i => i.src.indexOf(part) !== -1);
    s.__alpha = alpha;
    img.onload();
    return img;
};
const stills = s.__images.map(i => i.src);
check(
    s.__images.length > 0 && s.__images.every(i => i.crossOrigin === 'anonymous') && new Set(stills).size === stills.length,
    'off: each still is checked once, with a cross-origin readable image'
);
line();
s.emoteURL('25');
check(s.__images.length === stills.length, 'off: a still already being checked is not checked again');

const danceStill = 'https://cdn.betterttv.net/emote/aaaaaaaaaaaaaaaaaaaaaaaa/static/2x.webp';
loadStill('/aaaaaaaaaaaaaaaaaaaaaaaa/static/', 0);
check(
    s.__rules.length === 1 &&
        s.__rules[0] === '.emoticon[src="' + danceStill + '"] {content: url("https://cdn.betterttv.net/emote/aaaaaaaaaaaaaaaaaaaaaaaa/2x");}',
    'blank still: a CSS rule shows the animation on lines already built with it'
);
html = line();
check(
    html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/2x"') !== -1 && html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/static/') === -1,
    'blank still: new lines use the animated emote'
);

loadStill('/emote/w/2x_static.webp', 255);
loadStill('cheer/dark/static/100/4.png', 'throw');
html = line();
check(html.indexOf('https://cdn.7tv.app/emote/w/2x_static.webp') !== -1, 'visible still: the still stays');
check(html.indexOf('https://cheer/dark/static/100/4.png') !== -1 && s.__rules.length === 1, 'unreadable still: the still stays, no rule');

loadStill('/emoticons/v2/25/static/', 0);
check(
    s.emoteURL('25').indexOf('/emoticons/v2/25/default/dark/2.0') !== -1 && s.__rules.length === 2,
    'blank twitch still: falls back to the default (animated) image'
);

//ChatLive_SetOptions maps the saved Yes/No (0/1 after Settings_SetDefaults) to the flag
const setOptions = fs
    .readFileSync('app/specific/ChatLive.js', 'utf8')
    .match(/ChatLive_AnimatedEmotes = Boolean\(Settings_value\.chat_animated_emotes\.defaultValue\);/);
check(setOptions, 'SetOptions reads the chat_animated_emotes setting');

//Setting and strings
const settings = fs.readFileSync('app/specific/Settings.js', 'utf8');
check(
    /chat_animated_emotes: \{\s*\/\/Migrated to dialog\s*values: \['no', 'yes'\],\s*defaultValue: 2\s*\}/.test(settings),
    'setting defaults to Yes'
);
check(/title: STR_CHAT_ANIMATED_EMOTES,\s*summary: STR_CHAT_ANIMATED_EMOTES_SUMMARY/.test(settings), 'setting is listed in the chat options dialog');
const en = fs.readFileSync('app/languages/en_US.js', 'utf8'),
    declared = fs.readFileSync('app/languages/0_Strings.js', 'utf8');
check(
    ['STR_CHAT_ANIMATED_EMOTES', 'STR_CHAT_ANIMATED_EMOTES_SUMMARY'].every(k => en.indexOf(k + ' =') !== -1 && declared.indexOf(k + ',') !== -1),
    'strings declared and defined in en_US'
);

//7TV global set: fetched once, later chats reuse the cache in both chats (like BTTV and FFZ)
const g = sandbox(),
    globalUrls = [];
g.noop_fun = () => {};
g.Chat_BaseLoadUrl = (url, success) => {
    globalUrls.push(url);
    success(
        JSON.stringify({
            emotes: [{name: 'GlobalWave', data: {id: 'gw', name: 'x', animated: false, host: {url: '//cdn.7tv.app/emote/gw', files: files()}}}]
        })
    );
};
g.Chat_loadSeven_tvGlobalEmotes();
check(
    globalUrls.length === 1 && g.extraEmotes[0].GlobalWave && g.extraEmotesDone.seven_tvGlobal.GlobalWave,
    '7tv global: first chat fetches and caches the set'
);
g.extraEmotes = [{}, {}];
g.Chat_loadSeven_tvGlobalEmotes();
check(globalUrls.length === 1, '7tv global: a later chat does not fetch the set again');
check(
    g.extraEmotes[0].GlobalWave.chat_div === g.extraEmotesDone.seven_tvGlobal.GlobalWave.chat_div &&
        g.extraEmotes[1].GlobalWave.chat_div === g.extraEmotesDone.seven_tvGlobal.GlobalWave.chat_div,
    '7tv global: the cached set reaches both chats'
);


//Background emote prefetch: the WebView has no HTTP cache, so emote images are fetched ahead (global sets and the
//channel's most used emotes) and kept, a few at a time
const bttvIds = n => Array.from({length: n}, (_, i) => ({id: String(i).padStart(24, 'g'), code: 'G' + i, animated: false}));
const warmed = w => w.__images.filter(i => !i.crossOrigin);
{
    const w = sandbox();
    w.ChatLive_EmoteWarmParallel = 2;
    w.Chat_loadEmotesbttvGlobal(bttvIds(4));
    check(warmed(w).length === 2, 'warm: global emotes load at most the parallel limit at once');
    const first = w.__images[0],
        div = w.extraEmotes[0].G0.chat_div;
    check(
        first.src === w.emoteSrc(div) && first.srcset === w.emoteSrcset(div) && first.srcset.indexOf(' 2x,') !== -1 && !first.crossOrigin,
        'warm: same src and srcset as the chat line, no cors mode'
    );
    first.onload();
    check(warmed(w).length === 3, 'warm: a loaded image starts the next one');
    w.__images[1].onerror();
    check(warmed(w).length === 4, 'warm: a failed image starts the next one too');
    w.Chat_loadEmotesbttvGlobal(bttvIds(4));
    check(warmed(w).length === 4, 'warm: an emote already fetched is not fetched again');
    check(w.ChatLive_EmoteWarmKept[first.src] === first, 'warm: the image stays referenced for the memory cache');
}
{
    const w = sandbox();
    w.ChatLive_EmoteWarmParallel = 10;
    w.ChatLive_EmoteWarmMax = 2;
    w.Chat_loadEmotesbttvGlobal(bttvIds(4));
    check(Object.keys(w.ChatLive_EmoteWarmKept).length === 2, 'warm: at most ChatLive_EmoteWarmMax images are kept');
    check(w.ChatLive_EmoteWarmKept[w.__images[3].src] === w.__images[3], 'warm: the oldest kept images are dropped first');
}

//Use counts: chat lines count each emote per channel, the typing preview does not
{
    const u = sandbox();
    u.ChatLive_loadEmotesbttvChannel(
        [
            {id: 'a'.repeat(24), code: 'Hype'},
            {id: 'b'.repeat(24), code: 'Calm'},
            {id: 'c'.repeat(24), code: 'hasOwnProperty'}
        ],
        0
    );
    let html = u.extraMessageTokenize('Calm Hype Hype hasOwnProperty x', 0, 0);
    u.extraMessageTokenize('Hype', 0, 0);
    u.extraMessageTokenize('Calm Calm Calm Calm', 0, 0, null, true);
    let counts = u.ChatLive_EmoteUseGet().channel.c;
    check(counts.Hype === 3 && counts.Calm === 1, 'use: chat lines count emotes, the typing preview does not');
    check(counts['hasOwnProperty'] === 1 && html.split('emoticon').length === 5, 'use: an emote named like an object method is counted and shown');
    u.extraMessageTokenize('hasOwnProperty hasOwnProperty', 0, 0);
    check(u.ChatLive_EmoteUseGet().channel.c['hasOwnProperty'] === 3, 'use: such a name keeps counting');
    check(u.__timers.length === 1, 'use: one save is scheduled for many counts');

    u.ChatLive_EmoteUseGet().other = {t: 1, c: {Old: 5}};
    u.ChatLive_EmoteUseKeep = 2;
    u.ChatLive_EmoteUseChannels = 1;
    u.__timers[0]();
    const stored = JSON.parse(u.__storage.chat_emote_use);
    check(
        Object.keys(stored).join() === 'channel' && Object.keys(stored.channel.c).join() === 'Hype,hasOwnProperty',
        'use: the save keeps the latest channels and their most used emotes'
    );
    u.extraMessageTokenize('Calm', 0, 0);
    check(u.__timers.length === 2, 'use: a count after a save schedules the next save');

    u.ChatLive_EmoteUseCap = 4;
    u.extraMessageTokenize('Hype', 0, 0);
    counts = u.ChatLive_EmoteUseGet().channel.c;
    check(counts.Hype === 2 && counts['hasOwnProperty'] === 1, 'use: counts are halved when one reaches the cap');

    u.ChatLive_selectedChannel_id[0] = null;
    u.extraMessageTokenize('Hype', 0, 0);
    check(u.ChatLive_EmoteUseGet().channel.c.Hype === 2, 'use: nothing is counted without a channel');
}
{
    const x = sandbox();
    x.__storage.__throw = true;
    x.ChatLive_loadEmotesbttvChannel([{id: 'a'.repeat(24), code: 'Hype'}], 0);
    check(x.extraMessageTokenize('Hype', 0, 0).indexOf('emoticon') !== -1, 'use: unreadable saved counts do not stop the line');
    check(x.ChatLive_EmoteUseGet().channel.c.Hype === 1, 'use: unreadable saved counts start over');
}

//A later session: the channel's most used emotes are fetched before the global sets still queued
{
    const v = sandbox();
    v.__storage.chat_emote_use = JSON.stringify({channel: {t: 5, c: {Hype: 2, Gone: 50, Calm: 9}}});
    v.ChatLive_EmoteWarmParallel = 1;
    v.Chat_Id = [1, 2];
    v.Chat_loadEmotesbttvGlobal(bttvIds(2));
    v.ChatLive_loadEmotesChannelBTTVSuccess(
        JSON.stringify({
            channelEmotes: [
                {id: 'a'.repeat(24), code: 'Hype'},
                {id: 'b'.repeat(24), code: 'Calm'},
                {id: 'd'.repeat(24), code: 'Rare'}
            ],
            sharedEmotes: [],
            bots: []
        }),
        0,
        1
    );
    for (let i = 0; i < 4; i++) warmed(v)[i].onload();
    const order = warmed(v).map(i => i.src.split('/')[4]);
    check(
        order.join() === ['0'.padStart(24, 'g'), 'b'.repeat(24), 'a'.repeat(24), '1'.padStart(24, 'g')].join(),
        'warm: most used channel emotes first, by count, then the rest of the global set; unused ones are not fetched'
    );
    const before = warmed(v).length;
    v.ChatLive_updateExtraEmotes(v.extraEmotesDone.bttv.channel, 0);
    v.ChatLive_EmoteWarmChannel(0);
    check(warmed(v).length === before, 'warm: a later chat of the channel does not fetch them again');
}

//Animated emotes off: the still image the chat line will show is fetched
{
    const o = sandbox();
    o.ChatLive_EmoteWarmParallel = 3;
    o.ChatLive_AnimatedEmotes = false;
    o.Chat_loadEmotesbttvGlobal([{id: 'e'.repeat(24), code: 'Spin', animated: true}]);
    check(warmed(o).length === 1 && warmed(o)[0].src.indexOf('/static/2x.webp') !== -1, 'warm: animated emotes off fetches the still image');
}

//Main src size preference: chat renders emotes at ~1.75em, so the fallback src (no srcset
//support) loads 2x for every provider while the srcset keeps every size
{
    const bttv = s.ChatLive_bttv_entry({id: 'bttvid', code: 'Code', animated: false});
    check(bttv.chat_div.indexOf('/bttvid/2x"') !== -1, 'bttv: main src is 2x');
    check(bttv.srcset.indexOf('/bttvid/3x 3x') !== -1, 'bttv: srcset keeps 3x');
    const bttvAnimated = s.ChatLive_bttv_static({id: 'bttvid', code: 'Code', animated: true});
    check(bttvAnimated.indexOf('static/2x.webp"') !== -1, 'bttv: animated still main src is 2x_static');

    const ffz = s.ChatLive_ffz_entry({name: 'FFZ', id: 5, urls: {1: 'https://ffz/1.png', 2: 'https://ffz/2.png', 4: 'https://ffz/4.png'}});
    check(ffz.chat_div.indexOf('/ffz/2.png"') !== -1, 'ffz: main src prefers 2x over 4x');
    check(ffz.srcset.indexOf('/ffz/4.png 4x') !== -1, 'ffz: srcset keeps 4x');
    const ffzNo2x = s.ChatLive_ffz_entry({name: 'FFZ', id: 6, urls: {1: 'https://ffz/1.png'}});
    check(ffzNo2x.chat_div.indexOf('/ffz/1.png"') !== -1, 'ffz: falls back to 1x when no 2x exists');

    const sevenTv = s.ChatLive_seven_tv_entry({
        name: 'Seven',
        data: {
            name: 'Seven',
            id: 'sid',
            animated: true,
            flags: 0,
            host: {
                url: '//cdn.7tv.app/emote/s',
                files: [
                    {name: '1x.webp', format: 'WEBP', static_name: '1x_static.webp'},
                    {name: '2x.webp', format: 'WEBP', static_name: '2x_static.webp'},
                    {name: '4x.webp', format: 'WEBP', static_name: '4x_static.webp'}
                ]
            }
        }
    });
    check(sevenTv.chat_div.indexOf('/s/2x.webp"') !== -1, '7tv: main src is 2x');
    check(sevenTv['4x'].indexOf('/s/4x.webp') !== -1, '7tv: the picker keeps the biggest file');
    check(sevenTv.chat_div_static.indexOf('/s/2x_static.webp"') !== -1, '7tv: animated still main src is 2x_static');
    const sevenTvNo2x = s.ChatLive_seven_tv_entry({
        name: 'Tiny',
        data: {
            name: 'Tiny',
            id: 'tid',
            host: {url: '//cdn.7tv.app/emote/t', files: [{name: '1x.webp', format: 'WEBP'}, {name: '4x.webp', format: 'WEBP'}]}
        }
    });
    check(sevenTvNo2x.chat_div.indexOf('/t/4x.webp"') !== -1, '7tv: falls back to the biggest when no 2x exists');
}

console.log(checks + ' emote checks passed');
