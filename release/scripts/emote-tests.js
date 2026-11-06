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
        rules = [];
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
    vm.createContext(s);
    for (const file of ['app/thirdparty/kapchat.js', 'app/specific/ChatLive.js', 'app/specific/ChatVod.js'])
        vm.runInContext(fs.readFileSync(file, 'utf8'), s);
    s.emoteURLSize = '2.0';
    s.ChatLive_selectedChannel_id = ['channel', 'other'];
    s.extraEmotes = [{}, {}];
    s.extraEmotesDone.bttv.channel = {};
    s.extraEmotesDone.seven_tv.channel = {};
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
check(dance.chat_div.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/3x') !== -1, 'bttv: animated template unchanged');
check(
    dance.chat_div_static.indexOf('/emote/aaaaaaaaaaaaaaaaaaaaaaaa/static/3x.webp') !== -1 &&
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
check(html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/3x"') !== -1 && html.indexOf('/static/') === -1, 'on: animated emotes and cheers stay animated');
check(s.emoteURL('25').indexOf('/emoticons/v2/25/default/dark/2.0') !== -1, 'on: twitch emotes use the default (animated) format');

s.ChatLive_AnimatedEmotes = false;
html = line();
check(
    html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/static/3x.webp') !== -1 && html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/3x"') === -1,
    'off: bttv animated emote shows its still image'
);
check(html.indexOf('/bbbbbbbbbbbbbbbbbbbbbbbb/3x"') !== -1, 'off: static emotes are unchanged');
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

const danceStill = 'https://cdn.betterttv.net/emote/aaaaaaaaaaaaaaaaaaaaaaaa/static/3x.webp';
loadStill('/aaaaaaaaaaaaaaaaaaaaaaaa/static/', 0);
check(
    s.__rules.length === 1 &&
        s.__rules[0] === '.emoticon[src="' + danceStill + '"] {content: url("https://cdn.betterttv.net/emote/aaaaaaaaaaaaaaaaaaaaaaaa/3x");}',
    'blank still: a CSS rule shows the animation on lines already built with it'
);
html = line();
check(
    html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/3x"') !== -1 && html.indexOf('/aaaaaaaaaaaaaaaaaaaaaaaa/static/') === -1,
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

console.log(checks + ' emote checks passed');
