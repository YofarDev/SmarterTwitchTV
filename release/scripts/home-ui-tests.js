/* Home shell polish fixture: compact live-card formatters, detail-band ownership, region hints
 * and the viewer-refresh identity guard, against production definitions only. No app init,
 * no network, no exported test helpers. Run after a full build for --built mode. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');

const wanted =
    /^(Main_formatCompactViewers|Main_formatCompactScaled|Main_GetCompactViewerStrings|Main_GetViewerStrings|Main_formatLiveDuration|Main_formatNumber|Main_Slice|Screens_AriaEscape|Screens_createCellLive|Screens_ActionsButtonHtml|Screens_ScreenIds|Screens_GetObjId|Screens_ObjNotNull|Screens_GetObj|Screens_IsDivFocused|Screens_IsInUse|Screens_UpdateSince|ScreensObj_LiveCellArray|ScreensObj_ThumbInfoUpdate)$/;
const sources = built
    ? ['release/githubio/js/main_uncompressed.js']
    : ['app/specific/Main.js', 'app/specific/Screens.js', 'app/specific/ScreensObj.js'];
const definitions = [];
for (const file of sources) {
    UglifyJS.parse(fs.readFileSync(file, 'utf8')).walk(
        new UglifyJS.TreeWalker(node => {
            if (node instanceof UglifyJS.AST_Defun && wanted.test(node.name.name)) definitions.push(node.print_to_string());
        })
    );
}
const found = new Set(definitions.map(def => def.match(/function (\w+)/)[1]));
for (const name of wanted.source.replace(/[\^$()]/g, '').split('|'))
    if (!found.has(name)) throw new Error(name + ' not found' + (built ? '; rebuild first' : ''));

let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}

/* Presentation sandbox: the extracted production functions run against captured DOM writes. */
const s = require('./ui-test-sandbox')();
const writes = {text: {}, html: {}};
const elementClass = {};
const scene1Classes = new Set(['navigation-enabled', 'navigation-live']);
let detailsHidden = true;
let hintWrites = 0;
s.Main_getElementById = id => ({id});
s.Main_textContent = (id, value) => {
    writes.text[id] = value;
};
s.Main_innerHTML = (id, value) => {
    if (id === 'navigation-footer') hintWrites++;
    writes.html[id] = value;
};
s.Main_AddClass = (id, mclass) => {
    if (id === 'scene1') scene1Classes.add(mclass);
};
s.Main_RemoveClass = (id, mclass) => {
    if (id === 'scene1') scene1Classes.delete(mclass);
};
s.Main_ShowElement = id => {
    if (id === 'navigation-details') detailsHidden = false;
};
s.Main_HideElement = id => {
    if (id === 'navigation-details') detailsHidden = true;
};
let settingsVisible = false;
let directInput = false;
s.Settings_isVisible = () => settingsVisible;
s.Screens_DirectInputMode = () => directInput;
s.Screens_SubActions = 1;
s.twemoji = {parse: text => text};
s.Main_ReplaceLargeFont = text => text;
s.Main_VideoSize = '320x180';
s.Main_randomImg = '?cache=1';
s.Main_isStopped = false;
s.Main_isScene1DocVisible = () => true;
s.Sidepannel_isShowingUserLive = () => false;
s.Sidepannel_isShowingMenus = () => false;
s.Main_isUpdateDialogVisible = () => false;
s.Main_isChangeDialogVisible = () => false;
s.AddUser_UsernameArray = [{id: 'user-id', name: 'user'}];
let capturedTimeout = null;
s.Main_setTimeout = (fun, delay, id) => {
    capturedTimeout = {fun, delay, id};
    return id;
};
s.Main_clearTimeout = () => {};
s.STR_SPACE_HTML = '&nbsp;';
s.STR_SPACE = ' ';
s.STR_VIEWER = 'viewer';
s.STR_VIEWERS = 'viewers';
s.STR_ACTIONS = 'Options';
s.STR_ACTIONS_SHORT = 'OPTIONS';
s.STR_PLAYING = 'Playing ';
s.STR_SINCE = 'Since ';
s.STR_FOR = 'for ';
s.STR_NUMBER_SEPARATOR = ',';
s.Play_streamLiveAt = () => '00:19:15';
s.Main_is_rerun = () => false;
s.STR_UI = {
    liveFor: 'Live for ',
    separator: ' · ',
    browseHelp: '{up}{down} Scroll    {left}{right} Navigate    {ok} Watch    Hold {up} Refresh    Hold {ok} Options    {back} Return',
    browseHelpDirect: '{up}{down} Scroll    {left}{right} Cards and Actions    {ok} Watch    Hold {ok} Options    {back} Return',
    railHelp: '{up}{down} Navigate    {ok} Select    {back} Return',
    tabsHelp: '{left}{right} Navigate tabs    {ok} Select    {back} Return',
    recoveryHelp: '{left}{right} Choose    {ok} Select    {back} Navigation',
    actionsHelp: '{ok} Options    {left} Card    {up}{down} Browse    {back} Card / Return',
    searchHelp: '{ok} Edit search / type    {left}{right} Choose type    {up}{down} Form / results    {back} Return',
    settingsNavHelp: '{ok} Select    {left}{right} Adjust    {up} Navigation    {back} Return',
    compactK: 'K',
    compactM: 'M',
    decimalSeparator: '.',
    durationUnderMinute: '<1m',
    durationMinute: 'm',
    durationHour: 'h'
};
s.ScreenObj = {};
s.Main_values = {Main_Go: null, Search_data: ''};
s.Screens_UpdateSinceId = undefined; // the var declaration lives in Screens.js; the stub captures instead
vm.runInContext(definitions.join('\n'), s);

/* Compact duration: minutes and hours only, no seconds, never a stale 0m.
 * ago() builds timestamps against the real clock because the render and timer paths
 * call the formatter without an explicit now. */
const now = Date.now();
const ago = minutes => new Date(now - minutes * 60000).toISOString();
check(s.Main_formatLiveDuration(ago(0.5), now) === '<1m', 'under one minute reads <1m');
check(s.Main_formatLiveDuration(ago(0), now) === '<1m', 'zero elapsed reads <1m, not 0m');
check(s.Main_formatLiveDuration(ago(-5), now) === '<1m', 'clock skew clamps to <1m');
check(s.Main_formatLiveDuration('not-a-date', now) === '<1m', 'invalid date clamps to <1m');
check(s.Main_formatLiveDuration(ago(1), now) === '1m', 'one minute');
check(s.Main_formatLiveDuration(ago(59), now) === '59m', '59m keeps minutes form');
check(s.Main_formatLiveDuration(ago(60), now) === '1h', 'one hour drops the zero minutes');
check(s.Main_formatLiveDuration(ago(7 * 60 + 19), now) === '7h 19m', 'hours and minutes form');
check(s.Main_formatLiveDuration(ago(1440 + 5), now) === '24h 5m', 'days accumulate as hours');

/* Compact viewers: exact below 1000, one decimal above, 1000K promotes to 1M. */
check(s.Main_formatCompactViewers(0) === '0', 'zero viewers');
check(s.Main_formatCompactViewers(undefined) === '0', 'missing viewers');
check(s.Main_formatCompactViewers(1) === '1', 'single viewer stays exact');
check(s.Main_formatCompactViewers(999) === '999', '999 stays exact');
check(s.Main_formatCompactViewers(1000) === '1.0K', 'one thousand gains one decimal');
check(s.Main_formatCompactViewers(21074) === '21.1K', '21074 rounds to one decimal');
check(s.Main_formatCompactViewers(994999) === '995.0K', '995K stays K');
check(s.Main_formatCompactViewers(999999) === '1.0M', 'rounded 1000K promotes to 1M');
check(s.Main_formatCompactViewers(1000000) === '1.0M', 'one million');
check(s.Main_formatCompactViewers(1234567) === '1.2M', 'millions round to one decimal');
check(s.Main_GetCompactViewerStrings(21074) === '21.1K viewers', 'compact line keeps the viewer word');
check(s.Main_GetCompactViewerStrings(1) === '1 viewer', 'singular viewer word');

/* Live card markup: compact spans with stable IDs, VOD-badge cells keep the Since copy. */
function streamFixture(overrides) {
    const stream = {
        thumbnail_url: 'https://thumb/{width}x{height}',
        user_name: 'Streamer',
        user_login: 'streamer',
        user_id: '42',
        title: 'A title',
        game_name: 'A game',
        game_id: '7',
        viewer_count: 21074,
        started_at: ago(7 * 60 + 19),
        id: 'broadcast-1',
        type: 'live',
        language: 'en'
    };
    Object.assign(stream, overrides || {});
    return stream;
}
const key = s.Main_UserLive;
s.ScreenObj[key] = {
    screen: key,
    screenType: 0,
    isHistory: false,
    thumbclass: 'stream_cell_period',
    img_404: '404.png',
    ids: s.Screens_ScreenIds('Live', 'live_key'),
    DataObj: {},
    Cells: [{}],
    posY: 0,
    posX: 0,
    posSub: 0,
    focusPos: '0_0',
    itemsCount: 1,
    addFocus: () => {}
};
const idArray = s.ScreenObj[key].ids;
const liveHtml = s.Screens_createCellLive('0_0', idArray, s.ScreensObj_LiveCellArray(streamFixture()), key);
check(s.ScreenObj[key].DataObj['0_0'][12] === ago(7 * 60 + 19), 'raw started_at stays in the data array');
check(s.ScreenObj[key].DataObj['0_0'][13] === 21074, 'raw viewer count stays in the data array');
check(liveHtml.indexOf('Live for 7h 19m') !== -1, 'duration built from field 12 at render time');
check(liveHtml.indexOf('21.1K viewers') !== -1, 'viewer span renders the compact count');
check(liveHtml.indexOf('stream_info_live_duration') !== -1 && liveHtml.indexOf(idArray[9] + '0_0') !== -1, 'duration span keeps its stable id');
check(liveHtml.indexOf('stream_info_live_viewers') !== -1 && liveHtml.indexOf(idArray[10] + '0_0') !== -1, 'viewer span keeps its stable id');
check(liveHtml.indexOf('stream_info_live_meta') !== -1 && liveHtml.indexOf(' · ') !== -1, 'decorative separator span between the two values');
check(liveHtml.indexOf('Since') === -1, 'live cells drop the Since copy');
check(liveHtml.indexOf('00:19:') === -1, 'no seconds clock on the card');
const freshHtml = s.Screens_createCellLive('0_1', idArray, s.ScreensObj_LiveCellArray(streamFixture({started_at: new Date(now - 30000).toISOString()})), key);
check(freshHtml.indexOf('&lt;1m') !== -1, 'under-minute duration is HTML-escaped');
check(freshHtml.indexOf('<1m') === -1, 'raw <1m never reaches innerHTML');
const vodValues = s.ScreensObj_LiveCellArray(streamFixture());
const vodHtml = s.Screens_createCellLive('0_2', idArray, vodValues, key, null, 'https://vod.jpg', true);
check(vodHtml.indexOf('Since') !== -1 && vodHtml.indexOf('21,074') !== -1, 'VOD-badge cells keep the Since/for copy');
check(vodHtml.indexOf('stream_info_live_duration') === -1, 'VOD-badge cells never claim a live duration');

/* Viewer refresh: same broadcast updates the compact span, a different broadcast never does. */
s.ScreensObj_ThumbInfoUpdate({data: [streamFixture({viewer_count: 21500})]}, key + '', '0', '0', 'broadcast-1');
check(writes.html[idArray[10] + '0_0'] === '21.5K viewers', 'same-broadcast refresh rewrites only the viewer span');
check(s.ScreenObj[key].DataObj['0_0'][13] === 21500, 'refresh stores the new raw count');
check(writes.html[idArray[9] + '0_0'] === undefined, 'refresh never rewrites the duration span');
s.ScreensObj_ThumbInfoUpdate({data: [streamFixture({viewer_count: 30000, id: 'broadcast-2'})]}, key + '', '0', '0', 'broadcast-1');
check(writes.html[idArray[10] + '0_0'] === '21.5K viewers', 'different broadcast id rejects the update');
s.ScreensObj_ThumbInfoUpdate({data: [streamFixture({viewer_count: 30000, user_id: '43'})]}, key + '', '0', '0', 'broadcast-1');
check(writes.html[idArray[10] + '0_0'] === '21.5K viewers', 'different streamer identity rejects the update');

/* Detail band: only a real focused live card with the grid owning input reserves it. */
s.Main_values.Main_Go = key;
writes.text = {};
scene1Classes.delete('navigation-detail');
s.Navigation_Region = '';
s.Navigation_Onboarding = false;
s.Navigation_UpdateDetails(key);
check(writes.text['navigation-detail-title'] === 'A title', 'focused live card fills the title');
check(writes.text['navigation-detail-name'] === 'Streamer · 21,500 viewers', 'detail keeps the full, refreshed viewer count');
check(writes.text['navigation-detail-category'] === 'A game', 'detail fills the category');
check(!detailsHidden && scene1Classes.has('navigation-detail'), 'detail band visible with the shell state class');

s.ScreenObj[key].DataObj['0_0'].image = true;
s.Navigation_UpdateDetails(key);
check(writes.text['navigation-detail-title'] === '', 'placeholder cell clears all detail fields');
check(writes.text['navigation-detail-name'] === '' && writes.text['navigation-detail-category'] === '', 'no stale category or name');
check(detailsHidden && !scene1Classes.has('navigation-detail'), 'placeholder hides the band and frees the grid');
delete s.ScreenObj[key].DataObj['0_0'].image;

s.Navigation_Region = 'rail';
s.Navigation_UpdateDetails(key);
check(detailsHidden, 'rail focus hides the detail band');
s.Navigation_Region = 'tabs';
s.Navigation_UpdateDetails(key);
check(detailsHidden, 'tabs focus hides the detail band');
s.Navigation_Region = '';
s.Navigation_Onboarding = true;
s.Navigation_UpdateDetails(key);
check(detailsHidden, 'onboarding hides the detail band');
s.Navigation_Onboarding = false;
settingsVisible = true;
s.Navigation_UpdateDetails(key);
check(detailsHidden, 'settings hides the detail band');
settingsVisible = false;
s.ScreenObj[key].screenType = 1;
s.Navigation_UpdateDetails(key);
check(detailsHidden, 'non-live screens hide the detail band');
s.ScreenObj[key].screenType = 0;
s.ScreenObj[key].isHistory = true;
s.Navigation_UpdateDetails(key);
check(detailsHidden, 'history screens hide the detail band');
s.ScreenObj[key].isHistory = false;
s.ScreenObj[key].posSub = s.Screens_SubActions;
s.Navigation_UpdateDetails(key);
check(!detailsHidden, 'the Actions subtarget still counts as card focus');
s.ScreenObj[key].posSub = 0;
s.Navigation_UpdateDetails(s.Main_Live);
check(detailsHidden, 'a stale screen key never paints over the current screen');

/* Footer hints: the input owner resolves first, then screen and subtarget specifics. */
const footer = () => writes.html['navigation-footer'];
s.Navigation_Region = '';
s.Navigation_LastHint = '';
hintWrites = 0;
s.Navigation_UpdateHint(key);
check(footer().indexOf('icon-key-up') !== -1 && footer().indexOf('navigation-key-ok') !== -1, 'grid hint renders key glyphs');
hintWrites = 0;
s.Navigation_UpdateHint(key);
check(hintWrites === 0, 'identical hints skip the DOM write');
s.Navigation_Region = 'rail';
s.Navigation_UpdateHint(key);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.railHelp), 'rail region resolves the rail hint');
s.Navigation_Region = 'tabs';
s.Navigation_UpdateHint(key);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.tabsHelp), 'tabs region resolves the tabs hint');
s.Navigation_Region = 'recovery';
s.Navigation_UpdateHint(key);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.recoveryHelp), 'onboarding resolves the recovery hint');
s.Navigation_Region = '';
s.Navigation_UpdateHint(s.Main_Search);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.searchHelp), 'search screen resolves the search hint');
s.Navigation_UpdateHint(s.Main_ChannelContent);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.channelHelp), 'channel content resolves its own hint');
settingsVisible = true;
s.Navigation_UpdateHint(key);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.settingsNavHelp), 'settings resolves the settings hint');
settingsVisible = false;
s.ScreenObj[key].posSub = s.Screens_SubActions;
s.Navigation_UpdateHint(key);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.actionsHelp), 'Actions subtarget resolves the actions hint');
s.ScreenObj[key].posSub = 0;
directInput = true;
s.Navigation_UpdateHint(key);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.browseHelpDirect), 'direct input resolves the direct hint');
check(s.Navigation_KeyHintHtml(s.STR_UI.browseHelpDirect).indexOf('Hold') !== -1, 'direct hint keeps Hold OK Options');
directInput = false;
s.Navigation_UpdateHint(key);
check(footer() === s.Navigation_KeyHintHtml(s.STR_UI.browseHelp), 'legacy grid resolves the browse hint');
check(s.Navigation_KeyHintHtml(s.STR_UI.browseHelp).indexOf('{') === -1, 'every placeholder becomes a glyph');

/* Since timer: minute-boundary contract, compact text, only the focused live cell. */
s.Main_values.Main_Go = key;
s.ScreenObj[key].DataObj['0_0'] = s.ScreensObj_LiveCellArray(streamFixture({viewer_count: 21074}));
capturedTimeout = null;
writes.text = {};
s.Screens_UpdateSince(key);
check(writes.text[idArray[9] + '0_0'] === 'Live for 7h 19m', 'since timer writes the compact duration');
check(capturedTimeout && capturedTimeout.delay > 50 && capturedTimeout.delay <= 60500, 'next tick lands at the next minute boundary');
s.ScreenObj[key].posY = -1;
capturedTimeout = null;
s.Screens_UpdateSince(key);
check(!capturedTimeout, 'an unfocused grid stops the timer chain');

/* Language parity: every new STR_UI key exists in both en_US and uk_UA (uk replaces the object). */
const enSource = fs.readFileSync('app/languages/en_US.js', 'utf8');
const ukSource = fs.readFileSync('app/languages/uk_UA.js', 'utf8');
for (const name of [
    'railHelp',
    'tabsHelp',
    'recoveryHelp',
    'compactK',
    'compactM',
    'decimalSeparator',
    'durationUnderMinute',
    'durationMinute',
    'durationHour'
]) {
    check(new RegExp('\\b' + name + ':').test(enSource) && new RegExp('\\b' + name + ':').test(ukSource), 'STR_UI.' + name + ' exists in en_US and uk_UA');
}

/* Shell geometry contract: the source CSS owns the compact band and the space changes. */
const shell = fs.readFileSync('app/index.html', 'utf8');
check(/\.navigation-details\s*{[^}]*top:\s*82%/.test(shell), 'detail band starts at 82%');
check(/\.navigation-live #screens_holder\s*{[^}]*height:\s*68%/.test(shell), 'live grid keeps the full browsing height');
check(/\.navigation-live.navigation-detail #screens_holder\s*{\s*height:\s*56%/.test(shell), 'detail-visible grid sits at 56%');
check(/\.navigation-enabled #clock_holder\s*{[^}]*display:\s*none/.test(shell), 'browsing shell hides the clock');
check(/\.navigation-rail.navigation-expanded\s*{[^}]*width:\s*22%/.test(shell), 'expanded rail narrowed to 22%');
check(/\.navigation-enabled #dialog_counter\s*{[^}]*bottom:\s*9\.5%/.test(shell), 'counter realigned above the footer');
check(/#navigation-refresh\s*{[^}]*border-left/.test(shell), 'refresh joins the toolbar group with a divider');
check(!/id="dialog_counter"[^>]*style=/.test(shell), 'counter positioning moved out of inline styles');

console.log(checks + ' home shell checks passed');
