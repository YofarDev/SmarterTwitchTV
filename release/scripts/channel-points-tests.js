/* Channel points and drops: watch-time reporting (PlayChannelPoints: endpoint discovery, minute-watched payload, when reporting stops),
   auto claim of bonus points and drops (PlayAutoClaim) and their settings dialog. */
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
    Play_data: {data: ['thumb', 'Streamer', 'title', 'game', '', '', 'streamer', 'bcast-1', false, null, null, '', '', 0, '111', 'en']},
    //Runtime values (option index): watch time on, everything else off, as the defaults
    _settings: {watch_time_points: 1, auto_claim_bonus: 0, auto_claim_drops: 0, auto_claim_notify_bonus: 0, auto_claim_notify_drops: 0},
    Settings_Obj_default: key => s._settings[key],
    PlayClip_BaseUrl: 'https://gql.twitch.tv/gql',
    Main_OAuth_User_Headers: [
        ['Client-ID', 'tv-client'],
        ['Authorization', 'OAuth user-token']
    ],
    _notices: [],
    OSInterface_showToast: text => s._notices.push(text),
    _timeouts: [],
    Main_setTimeout: (fn, ms) => s._timeouts.push({fn, ms}),
    STR_POINTS_BONUS_CLAIMED: 'Bonus channel points claimed: +%x',
    STR_POINTS_BONUS_CLAIMED_NO_COUNT: 'Bonus channel points claimed',
    STR_POINTS_DROP_CLAIMED: 'Drop claimed: %x'
});

//Real Play_isPlaying, so the paused check follows the player's own definition
UglifyJS.parse(fs.readFileSync('app/specific/Play.js', 'utf8')).walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_Defun && node.name.name === 'Play_isPlaying') vm.runInContext(node.print_to_string(), s);
    })
);
vm.runInContext(fs.readFileSync('app/specific/PlayChannelPoints.js', 'utf8'), s);
vm.runInContext(fs.readFileSync('app/specific/PlayAutoClaim.js', 'utf8'), s);

const activeIntervals = () => Object.keys(intervals).length;
const tick = () => Object.keys(intervals).forEach(id => intervals[id] && intervals[id]());
const last = () => requests[requests.length - 1];
const reply = (req, status, responseText) => req.success({status, responseText}, req.key, req.checkResult);
//Notices wait on a timer before the toast; run what is pending
const flushNotices = () => s._timeouts.splice(0).forEach(t => t.fn());
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

//Watch time off: no discovery and no reports, the minute tick still runs for the claims
const gql = () => requests.filter(r => r.url === 'https://gql.twitch.tv/gql');
const gqlBody = req => JSON.parse(req.body);
s._settings.watch_time_points = 0;
s.PlayChannelPoints_SpadeUrl = null;
count = requests.length;
s.PlayChannelPoints_Start();
tick();
check(requests.length === count && activeIntervals() === 1, 'watch time off discovers no endpoint');
s.PlayChannelPoints_SpadeUrl = 'https://spade.twitch.tv/track';
tick();
tick();
check(requests.length === count && activeIntervals() === 1, 'watch time off sends nothing');
s.PlayChannelPoints_Stop();

//Claims off (default): ticks make no claim requests
s._settings.watch_time_points = 1;
s.PlayChannelPoints_Start();
let gqlCount = gql().length;
for (let i = 0; i < 6; i++) tick();
check(gql().length === gqlCount, 'auto claim off makes no GraphQL requests');
s.PlayChannelPoints_Stop();

//Bonus points: checked every minute on the watched channel, claimed with the user token
s._settings.auto_claim_bonus = 1;
s.PlayChannelPoints_Start();
gqlCount = gql().length;
tick();
check(gql().length === gqlCount + 1, 'bonus checked on the minute tick');
let check1 = gql()[gql().length - 1];
check(check1.method === 'POST' && check1.headers === s.Main_OAuth_User_Headers, 'bonus check uses the user token');
check(gqlBody(check1).query.indexOf('user(id: "111")') !== -1, 'bonus check targets the watched channel');
reply(check1, 200, JSON.stringify({data: {user: {id: '111', channel: {self: {communityPoints: {balance: 30, availableClaim: null}}}}}}));
check(gql().length === gqlCount + 1, 'no chest, no claim');
tick();
check1 = gql()[gql().length - 1];
reply(check1, 200, JSON.stringify({data: {user: {id: '111', channel: {self: {communityPoints: {balance: 30, availableClaim: {id: 'chest-1'}}}}}}}));
let claim = gql()[gql().length - 1];
check(
    /claimCommunityPoints\(input: \{channelID: "111", claimID: "chest-1"\}\)/.test(gqlBody(claim).query),
    'chest claimed with channel and claim ids'
);
reply(claim, 200, JSON.stringify({data: {claimCommunityPoints: {currentPoints: 80, error: null}}}));
flushNotices();
check(s._notices.length === 0, 'claim is silent with notices off');
s._settings.auto_claim_notify_bonus = 1;
tick();
reply(
    gql()[gql().length - 1],
    200,
    JSON.stringify({data: {user: {id: '111', channel: {self: {communityPoints: {balance: 80, availableClaim: {id: 'chest-2'}}}}}}})
);
reply(gql()[gql().length - 1], 200, JSON.stringify({data: {claimCommunityPoints: {currentPoints: 130, error: null}}}));
check(s._notices.length === 0 && s._timeouts.length === 1, 'notice waits briefly for other claims');
flushNotices();
check(s._notices[0] === 'Bonus channel points claimed: +50', 'notice shows the points earned');
gqlCount = gql().length;
tick();
reply(
    gql()[gql().length - 1],
    200,
    JSON.stringify({data: {user: {id: '222', channel: {self: {communityPoints: {balance: 0, availableClaim: {id: 'x'}}}}}}})
);
check(gql().length === gqlCount + 1, 'chest of another channel is not claimed');
tick();
reply(
    gql()[gql().length - 1],
    200,
    JSON.stringify({data: {user: {id: '111', channel: {self: {communityPoints: {balance: 130, availableClaim: {id: 'chest-3'}}}}}}})
);
reply(gql()[gql().length - 1], 200, JSON.stringify({data: {claimCommunityPoints: {currentPoints: null, error: {code: 'NOT_FOUND'}}}}));
flushNotices();
check(s._notices.length === 1, 'refused claim shows no notice');
tick();
const staleBonus = gql()[gql().length - 1];
s.PlayChannelPoints_Stop();
s.PlayChannelPoints_Start();
gqlCount = gql().length;
reply(staleBonus, 200, JSON.stringify({data: {user: {id: '111', channel: {self: {communityPoints: {balance: 0, availableClaim: {id: 'old'}}}}}}}));
check(gql().length === gqlCount, 'bonus reply from before a restart is ignored');
s._settings.auto_claim_bonus = 0;
s._settings.auto_claim_notify_bonus = 0;
s._notices.length = 0;
s.PlayChannelPoints_Stop();

//Drops: inventory on the first tick and every 5 minutes, BetterTTV eligibility rules
s._settings.auto_claim_drops = 1;
s.PlayChannelPoints_Start();
gqlCount = gql().length;
tick();
check(gql().length === gqlCount + 1 && /dropCampaignsInProgress/.test(gqlBody(gql()[gql().length - 1]).query), 'inventory checked on the first tick');
const inventory = gql()[gql().length - 1];
for (let i = 0; i < 4; i++) tick();
check(gql().length === gqlCount + 1, 'inventory not rechecked within 5 minutes');
tick();
check(gql().length === gqlCount + 2, 'inventory rechecked after 5 minutes');
const drop = (id, name, required, watched, extra) =>
    Object.assign({
        id,
        name,
        requiredMinutesWatched: required,
        self: Object.assign({isClaimed: false, currentMinutesWatched: watched, dropInstanceID: null, hasPreconditionsMet: true}, extra)
    });
gqlCount = gql().length;
reply(
    inventory,
    200,
    JSON.stringify({
        data: {
            currentUser: {
                id: '4242',
                inventory: {
                    dropCampaignsInProgress: [
                        {
                            id: 'camp-1',
                            timeBasedDrops: [
                                drop('d-ready', 'Avatar', 60, 60, {dropInstanceID: 'inst-1'}),
                                drop('d-short', 'Spray', 60, 59),
                                drop('d-claimed', 'Old', 30, 30, {isClaimed: true}),
                                drop('d-locked', 'Locked', 30, 30, {hasPreconditionsMet: false})
                            ]
                        },
                        {id: 'camp-2', timeBasedDrops: [drop('d-noinst', 'Skin', 120, 125)]}
                    ]
                }
            }
        }
    })
);
const claims = gql().slice(gqlCount);
check(claims.length === 2, 'only finished, unclaimed, unlocked drops are claimed');
check(gqlBody(claims[0]).variables.input.dropInstanceID === 'inst-1', 'drop claimed with its instance id');
check(gqlBody(claims[1]).variables.input.dropInstanceID === '4242#camp-2#d-noinst', 'missing instance id built as user#campaign#drop');
check(/claimDropRewards\(input: \$input\)/.test(gqlBody(claims[0]).query), 'claimDropRewards mutation');
reply(claims[0], 200, JSON.stringify({data: {claimDropRewards: {status: 'ELIGIBLE_FOR_ALL'}}}));
flushNotices();
check(s._notices.length === 0, 'drop claim is silent with notices off');
s._settings.auto_claim_notify_drops = 1;
reply(claims[1], 200, JSON.stringify({data: {claimDropRewards: {status: 'DROP_INSTANCE_ALREADY_CLAIMED'}}}));
flushNotices();
check(s._notices.length === 0, 'refused drop claim shows no notice');
s.PlayAutoClaim_DropNames[99] = 'Lootbox';
reply(
    {success: s.PlayAutoClaim_DropClaimSuccess, key: 99, checkResult: s.PlayAutoClaim_Generation},
    200,
    JSON.stringify({data: {claimDropRewards: {status: 'ELIGIBLE_FOR_ALL'}}})
);
flushNotices();
check(s._notices[0] === 'Drop claimed: Lootbox', 'notice names the claimed drop');
s.PlayChannelPoints_Stop();
s._settings.auto_claim_drops = 0;

//Notices close together share one toast, one line each, and never replace a toast still on screen
s._notices.length = 0;
s._settings.auto_claim_notify_bonus = 1;
s.PlayAutoClaim_NoticeShownAt = 0;
s.PlayAutoClaim_Notify('auto_claim_notify_bonus', 'Bonus channel points claimed: +50');
s.PlayAutoClaim_Notify('auto_claim_notify_drops', 'Drop claimed: Spray');
s.PlayAutoClaim_Notify('auto_claim_notify_drops', 'Drop claimed: Avatar');
check(s._timeouts.length === 1 && s._timeouts[0].ms === 1000, 'one short wait for notices of the same tick');
flushNotices();
check(
    s._notices.length === 1 && s._notices[0] === 'Bonus channel points claimed: +50\nDrop claimed: Spray\nDrop claimed: Avatar',
    'bonus and drops in one toast, a line each'
);
s.PlayAutoClaim_Notify('auto_claim_notify_drops', 'Drop claimed: Lootbox');
check(s._timeouts.length === 1 && s._timeouts[0].ms > 3000, 'next notice waits for the toast on screen to end');
flushNotices();
check(s._notices.length === 2 && s._notices[1] === 'Drop claimed: Lootbox', 'then shows on its own');
s._settings.auto_claim_notify_drops = 0;
s.PlayAutoClaim_Notify('auto_claim_notify_drops', 'Drop claimed: Hidden');
check(s._timeouts.length === 0, 'notice with its toggle off is not queued');
s._settings.auto_claim_notify_bonus = 0;
s._notices.length = 0;

//Settings: defaults and the dialog
const settingsSource = fs.readFileSync('app/specific/Settings.js', 'utf8');
const settingsCtx = vm.createContext({STR_NO: 'No', STR_YES: 'Yes', Settings_value: {}});
const pointsKeys = ['watch_time_points', 'auto_claim_bonus', 'auto_claim_notify_bonus', 'auto_claim_drops', 'auto_claim_notify_drops'];
//Only the new Settings_value entries: the full object calls helpers that need the whole app
UglifyJS.parse(settingsSource).walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_VarDef && node.name.name === 'Settings_value') {
            node.value.properties.forEach(prop => {
                if (pointsKeys.concat('points_opt').indexOf(prop.key) !== -1) {
                    settingsCtx.Settings_value[prop.key] = vm.runInContext('(' + prop.value.print_to_string() + ')', settingsCtx);
                }
            });
        }
        if (node instanceof UglifyJS.AST_VarDef && node.name.name === 'Settings_DialogPointsKeys') {
            vm.runInContext('var ' + node.print_to_string(), settingsCtx);
        }
        if (
            node instanceof UglifyJS.AST_Defun &&
            [
                'Settings_DialogShowPoints',
                'Settings_DialogPointsRefresh',
                'Settings_DialogPointsRow',
                'Settings_Obj_default',
                'Settings_Obj_values'
            ].indexOf(node.name.name) !== -1
        )
            vm.runInContext(node.print_to_string(), settingsCtx);
    })
);
const sv = settingsCtx.Settings_value;
check(sv.points_opt && sv.points_opt.values[0] === 'None', 'dialog entry defined like the other dialog entries');
//Stored defaults are option index + 1
check(sv.watch_time_points.defaultValue === 2, 'watch time points default on');
check(sv.auto_claim_bonus.defaultValue === 1 && sv.auto_claim_drops.defaultValue === 1, 'auto claims default off');
check(sv.auto_claim_notify_bonus.defaultValue === 1 && sv.auto_claim_notify_drops.defaultValue === 1, 'claim notices default off');
['OPT', 'WATCH', 'WATCH_SUMMARY', 'BONUS', 'BONUS_SUMMARY', 'NOTIFY_BONUS', 'NOTIFY_BONUS_SUMMARY', 'DROPS', 'DROPS_SUMMARY'].forEach(
    k => (settingsCtx['STR_POINTS_' + k] = 'STR_POINTS_' + k)
);
['NOTIFY_DROPS', 'NOTIFY_DROPS_SUMMARY'].forEach(k => (settingsCtx['STR_POINTS_' + k] = 'STR_POINTS_' + k));
//Minimal dialog DOM: the dependent row divs, their value text and the stored values
const fakeDiv = () => {
    const div = {
        classes: new Set(),
        get className() {
            return Array.from(div.classes).join(' ');
        },
        classList: {add: c => div.classes.add(c), remove: c => div.classes.delete(c)}
    };
    return div;
};
const divs = {};
pointsKeys.forEach(k => (divs[k + '_div'] = fakeDiv()));
const hidden = k => divs[k + '_div'].classes.has('hideimp');
const stored = {},
    shownText = {};
Object.assign(settingsCtx, {
    Main_getElementById: id => divs[id] || null,
    Main_A_includes_B: (A, B) => (A ? A.indexOf(B) !== -1 : false),
    Main_AddClassWithEle: (el, c) => el.classList.add(c),
    Main_RemoveClassWithEle: (el, c) => el.classList.remove(c),
    Main_setItem: (k, v) => (stored[k] = v),
    Main_textContent: (k, v) => (shownText[k] = v)
});
//Runtime values are option indexes (Settings_SetDefaults subtracts 1 from the stored value)
pointsKeys.forEach(k => (sv[k].defaultValue -= 1));
let dialog = null;
settingsCtx.Settings_DialogShow = (obj, title) => {
    dialog = {obj, title};
    settingsCtx.Settings_DialogValue = Object.keys(obj);
};
settingsCtx.Settings_DialogShowPoints();
check(dialog.title === 'STR_POINTS_OPT', 'dialog titled channel points and drops');
check(Object.keys(dialog.obj).join() === pointsKeys.join(), 'dialog lists the five toggles, each notice under its claim');
check(dialog.obj.auto_claim_notify_drops.title === 'STR_POINTS_NOTIFY_DROPS', 'drops notice has its own title');
check(dialog.obj.auto_claim_drops.title === 'STR_POINTS_DROPS' && dialog.obj.auto_claim_drops.values.join() === 'No,Yes', 'toggles are No/Yes');
check(
    /Settings_Content\('points_opt'/.test(settingsSource) && /'points_opt'\)\) Settings_DialogShowPoints\(click\)/.test(settingsSource),
    'dialog opens from the settings list'
);

//Dependent rows: each notice follows its claim, bonus follows watch time
const navKeys = () => settingsCtx.Settings_DialogValue.join();
const refresh = () => settingsCtx.Settings_DialogPointsRefresh();
const set = values => Object.keys(values).forEach(k => (sv[k].defaultValue = values[k]));
check(
    navKeys() === 'watch_time_points,auto_claim_bonus,auto_claim_drops' && hidden('auto_claim_notify_bonus') && hidden('auto_claim_notify_drops'),
    'defaults: both notices hidden and skipped while their claims are off'
);
set({auto_claim_drops: 1});
refresh();
check(navKeys() === 'watch_time_points,auto_claim_bonus,auto_claim_drops,auto_claim_notify_drops', 'drops notice appears under drops');
check(hidden('auto_claim_notify_bonus'), 'bonus notice stays hidden while bonus is off');
refresh();
check(navKeys().split('auto_claim_notify_drops').length === 2, 'refresh does not add a row twice');
set({auto_claim_bonus: 1});
refresh();
check(navKeys() === pointsKeys.join(), 'bonus notice appears under bonus, rows in dialog order');
set({auto_claim_notify_bonus: 1, auto_claim_notify_drops: 1, auto_claim_drops: 0});
refresh();
check(sv.auto_claim_notify_drops.defaultValue === 0 && stored.auto_claim_notify_drops === 1, 'drops off turns its notice off and saves it');
check(shownText.auto_claim_notify_drops === 'No' && hidden('auto_claim_notify_drops'), 'drops notice shows No and is hidden');
check(sv.auto_claim_notify_bonus.defaultValue === 1 && !hidden('auto_claim_notify_bonus'), 'bonus notice unaffected by drops');
check(
    /position === 'watch_time_points' \|\| position === 'auto_claim_bonus' \|\| position === 'auto_claim_drops'\) Settings_DialogPointsRefresh\(\)/.test(
        settingsSource
    ),
    'refresh runs when watch time or a claim toggle changes'
);

//Watch time off cascades: bonus, then its notice
set({auto_claim_drops: 1, auto_claim_notify_drops: 1});
refresh();
set({watch_time_points: 0});
refresh();
check(sv.auto_claim_bonus.defaultValue === 0 && stored.auto_claim_bonus === 1, 'watch time off turns bonus off and saves it');
check(
    sv.auto_claim_notify_bonus.defaultValue === 0 && hidden('auto_claim_bonus') && hidden('auto_claim_notify_bonus'),
    'bonus and its notice hidden'
);
check(navKeys() === 'watch_time_points,auto_claim_drops,auto_claim_notify_drops', 'drops and its notice remain');
check(sv.auto_claim_notify_drops.defaultValue === 1, 'drops notice kept');
set({watch_time_points: 1});
refresh();
check(
    navKeys() === 'watch_time_points,auto_claim_bonus,auto_claim_drops,auto_claim_notify_drops',
    'bonus returns in place, its notice waits for bonus'
);
check(sv.auto_claim_bonus.defaultValue === 0 && shownText.auto_claim_bonus === 'No', 'bonus comes back off, the user turns it on');
const en = fs.readFileSync('app/languages/en_US.js', 'utf8'),
    strings = fs.readFileSync('app/languages/0_Strings.js', 'utf8');
check(
    ['STR_POINTS_OPT', 'STR_POINTS_BONUS_CLAIMED', 'STR_POINTS_DROP_CLAIMED'].every(
        k => en.indexOf(k + ' =') !== -1 && strings.indexOf(k + ',') !== -1
    ),
    'strings defined and declared'
);

//Wiring into the player
const play = fs.readFileSync('app/specific/Play.js', 'utf8');
const html = fs.readFileSync('app/index.html', 'utf8');
check(/function Play_onPlayer\(\)[\s\S]*?Play_Playing = true;\s*PlayChannelPoints_Start\(\);/.test(play), 'player start begins reporting');
check(
    /function Play_PreshutdownStream\(closePlayer\) \{[\s\S]*?if \(closePlayer\) \{\s*PlayChannelPoints_Stop\(\);/.test(play),
    'player close stops reporting'
);
check(html.indexOf('specific/PlayChannelPoints.js') !== -1 && html.indexOf('specific/PlayAutoClaim.js') !== -1, 'scripts listed in index.html');

console.log(checks + ' channel points checks passed');
