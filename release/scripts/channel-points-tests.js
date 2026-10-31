/* Live watch-time reporting for channel points (PlayChannelPoints): endpoint discovery, minute-watched payload and when reporting stops. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}

const requests = [];
const intervals = {};
let intervalId = 0;
const s = vm.createContext({
    btoa: str => Buffer.from(str, 'binary').toString('base64'),
    noop_fun: () => {},
    Main_A_equals_B: (A, B) => A === B,
    Main_setInterval: (fn, timeout, id) => {
        delete intervals[id];
        intervals[++intervalId] = fn;
        return intervalId;
    },
    Main_clearInterval: id => delete intervals[id],
    FullxmlHttpGet: (url, headers, success, error, key, checkResult, method, body) =>
        requests.push({url, headers, success, key, checkResult, method, body}),
    AddUser_UserHasToken: () => s._hasToken,
    _hasToken: true,
    AddUser_UsernameArray: [{id: '4242', access_token: 'user-token'}],
    Play_isOn: true,
    Play_Playing: true,
    Main_isStopped: false,
    _nativePlaying: true,
    OSInterface_getPlaybackState: () => s._nativePlaying,
    Play_isEndDialogVisible: () => false,
    Play_StayDialogVisible: () => false,
    Play_data: {data: ['thumb', 'Streamer', 'title', 'game', '', '', 'streamer', 'bcast-1', false, null, null, '', '', 0, '111', 'en']}
});

//Real Play_isPlaying, so the paused check follows the player's own definition
UglifyJS.parse(fs.readFileSync('app/specific/Play.js', 'utf8')).walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_Defun && node.name.name === 'Play_isPlaying') vm.runInContext(node.print_to_string(), s);
    })
);
vm.runInContext(fs.readFileSync('app/specific/PlayChannelPoints.js', 'utf8'), s);

const activeIntervals = () => Object.keys(intervals).length;
const tick = () => Object.keys(intervals).forEach(id => intervals[id] && intervals[id]());
const last = () => requests[requests.length - 1];
const reply = (req, status, responseText) => req.success({status, responseText}, req.key, req.checkResult);
const sentPayload = req => JSON.parse(Buffer.from(decodeURIComponent(req.body.slice(5)), 'base64').toString('binary'));

//No account: nothing is reported
s._hasToken = false;
s.PlayChannelPoints_Start();
check(activeIntervals() === 0 && requests.length === 0, 'no token starts no reporting');
s._hasToken = true;

//Start: discovers the endpoint from the channel page
s.PlayChannelPoints_Start();
check(activeIntervals() === 1, 'start arms one minute interval');
check(s.PlayChannelPoints_IntervalMs === 60000, 'reports once a minute');
check(last().url === 'https://www.twitch.tv/streamer', 'discovery fetches the channel page');
const page = last();
reply(page, 200, '<script src="https://assets.twitch.tv/config/settings.abc123.js"></script>');
check(last().url === 'https://assets.twitch.tv/config/settings.abc123.js', 'settings script found in the channel page');
reply(last(), 200, 'window.__twilightSettings={"beacon_url":"https:\\/\\/beacon.twitch.tv\\/track?a=1\\u0026b=2"}');
check(s.PlayChannelPoints_SpadeUrl === 'https://beacon.twitch.tv/track?a=1&b=2', 'endpoint unescaped from settings');

//Playing: one minute-watched POST per tick
let count = requests.length;
tick();
check(requests.length === count + 1 && last().method === 'POST', 'playing minute is reported');
check(last().url === 'https://beacon.twitch.tv/track?a=1&b=2', 'report goes to the discovered endpoint');
const payload = sentPayload(last());
check(payload.event === 'minute-watched', 'minute-watched event');
check(payload.properties.channel_id === '111' && payload.properties.broadcast_id === 'bcast-1', 'channel and broadcast ids sent');
check(payload.properties.channel === 'streamer' && payload.properties.live === true, 'channel login and live flag sent');
check(payload.properties.user_id === 4242, 'user id sent as a number');

//Paused, buffering or backgrounded: not reported, but still armed
count = requests.length;
s._nativePlaying = false;
tick();
check(requests.length === count && activeIntervals() === 1, 'paused minute is not reported');
s._nativePlaying = true;
s.Main_isStopped = true;
tick();
check(requests.length === count && activeIntervals() === 1, 'background minute is not reported');
s.Main_isStopped = false;
s.Play_Playing = false;
tick();
check(requests.length === count, 'loading stream is not reported');
s.Play_Playing = true;
tick();
check(requests.length === count + 1, 'reporting resumes when playback does');

//Endpoint gone: rediscover on the next minute instead of reporting
reply(last(), 404, '');
check(s.PlayChannelPoints_SpadeUrl === null, '404 drops the endpoint');
tick();
check(last().url === 'https://www.twitch.tv/streamer' && !last().method, 'next minute rediscovers');
reply(last(), 200, '"https://assets.twitch.tv/config/settings.def.js"');
reply(last(), 200, '"spade_url":"https://spade.twitch.tv/track"');
check(s.PlayChannelPoints_SpadeUrl === 'https://spade.twitch.tv/track', 'spade_url accepted too');

//Both endpoints, in Twitch's order (beacon first): spade is used, beacon kept as fallback
s.PlayChannelPoints_SpadeUrl = null;
tick();
reply(last(), 200, '"https://assets.twitch.tv/config/settings.both.js"');
reply(last(), 200, '{"beacon_url":"https://beacon.twitch.tv/track","spade_url":"https://spade.twitch.tv/track"}');
check(s.PlayChannelPoints_SpadeUrl === 'https://spade.twitch.tv/track', 'spade_url preferred over beacon_url');
tick();
check(last().url === 'https://spade.twitch.tv/track', 'report goes to spade');
//Blocked host (DNS sinkhole): no response at all, status 0
reply(last(), 0, '');
check(s.PlayChannelPoints_SpadeUrl === 'https://beacon.twitch.tv/track', 'unreachable endpoint falls back to the other');
tick();
check(last().url === 'https://beacon.twitch.tv/track', 'next minute reports to the fallback');
reply(last(), 0, '');
check(s.PlayChannelPoints_SpadeUrl === null, 'no endpoint left after both fail');
tick();
check(last().url === 'https://www.twitch.tv/streamer', 'rediscovers when every endpoint failed');
reply(last(), 200, '"https://assets.twitch.tv/config/settings.both.js"');
reply(last(), 200, '{"spade_url":"https://spade.twitch.tv/track"}');
tick();
reply(last(), 204, '');
check(s.PlayChannelPoints_SpadeUrl === 'https://spade.twitch.tv/track', 'accepted report keeps the endpoint');

//Another stream reuses the known endpoint: no channel page or settings script again
count = requests.length;
s.PlayChannelPoints_Start();
check(requests.length === count && activeIntervals() === 1, 'a new stream starts without rediscovery');
tick();
check(requests.length === count + 1 && last().url === 'https://spade.twitch.tv/track', 'its first minute reports to the known endpoint');

//A discovery reply from an older stream is ignored
s.PlayChannelPoints_SpadeUrl = null;
s.PlayChannelPoints_Start();
const stale = last();
check(stale.url === 'https://www.twitch.tv/streamer', 'a stream with no known endpoint discovers it');
s.PlayChannelPoints_Start();
count = requests.length;
reply(stale, 200, '"https://assets.twitch.tv/config/settings.old.js"');
check(requests.length === count, 'stale discovery reply ignored');

//Stream changed under the interval: stop instead of reporting the new one with old ids
s.PlayChannelPoints_SpadeUrl = 'https://spade.twitch.tv/track';
s.Play_data.data[7] = 'bcast-2';
count = requests.length;
tick();
check(requests.length === count && activeIntervals() === 0, 'changed broadcast stops reporting');
s.Play_data.data[7] = 'bcast-1';

//Stop clears everything
s.PlayChannelPoints_Start();
s.PlayChannelPoints_Stop();
check(activeIntervals() === 0 && s.PlayChannelPoints_ChannelId === null, 'stop clears interval and ids');

//Wiring into the player
const play = fs.readFileSync('app/specific/Play.js', 'utf8');
const html = fs.readFileSync('app/index.html', 'utf8');
check(/function Play_onPlayer\(\)[\s\S]*?Play_Playing = true;\s*PlayChannelPoints_Start\(\);/.test(play), 'player start begins reporting');
check(
    /function Play_PreshutdownStream\(closePlayer\) \{[\s\S]*?if \(closePlayer\) \{\s*PlayChannelPoints_Stop\(\);/.test(play),
    'player close stops reporting'
);
check(html.indexOf('specific/PlayChannelPoints.js') !== -1, 'script listed in index.html');

console.log(checks + ' channel points checks passed');
