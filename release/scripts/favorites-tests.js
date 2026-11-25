/* Favorites fixture: the per-user favorites store, the options-dialog toggle and the
 * Live now pin sort, against production definitions only. No app init, no network.
 * Run after a full build for --built mode. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');

const wanted =
    /^(Screens_FavoritesSetDefaultObj|Screens_isFavorite|Screens_FavoriteChannel|Screens_FavoriteToggle|Screens_FavoriteMessage|Screens_FavoriteDisplayName|UserLiveFeedobj_FavoritesFirst|ChannelContent_setFavorite|ChannelContent_toggleFavorite|Screens_FavoriteUpdateBadge|Screens_BlockChannelGetId|Screens_BlockChannelGetName|Screens_createCellLive|Screens_ActionsButtonHtml|Screens_ScreenIds|Screens_AriaEscape|Screens_ThumbOptionDialogKeyUpDown|ScreensObj_SortFavoritesFirst|Main_Slice|Main_GetViewerStrings|Main_GetCompactViewerStrings|Main_formatCompactViewers|Main_formatCompactScaled|Main_formatLiveDuration|Main_formatNumber|Main_AddClassWithEle|Main_RemoveClassWithEle)$/;
const sources = built
    ? ['release/githubio/js/main_uncompressed.js']
    : ['app/specific/Main.js', 'app/specific/Screens.js', 'app/specific/ScreensObj.js', 'app/specific/UserLiveFeedobj.js', 'app/specific/ChannelContent.js'];
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

const s = require('./ui-test-sandbox')();
vm.runInContext(definitions.join('\n'), s);
//The Options row order is a data var, not a function: lift it from the same sources
const orderMatch = sources
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n')
    .match(/var Screens_ThumbOptionOrder = (\[[^\]]*\]);/);
if (!orderMatch) throw new Error('Screens_ThumbOptionOrder not found' + (built ? '; rebuild first' : ''));
vm.runInContext('var Screens_ThumbOptionOrder = ' + orderMatch[1] + ';', s);

//Screens_createCellLive and the toggle render translated strings; the real language
//definitions load before the fixtures run
vm.runInContext(fs.readFileSync('app/languages/default.js', 'utf8'), s);
vm.runInContext(fs.readFileSync('app/languages/en_US.js', 'utf8'), s);
vm.runInContext('en_USLang()', s);

/* Store fixture: one user, a favorites object created lazily like blocked. */
let userSet = true,
    saves = 0,
    reloads = 0,
    warned = '';
s.AddUser_IsUserSet = () => userSet;
s.AddUser_UserIsSet = () => userSet;
s.AddUser_UsernameArray = [{id: '1', name: 'user'}];
s.Main_values_History_data = {'1': {live: [], vod: [], clip: [], saved: [], deleted: {}}};
s.Main_setHistoryItem = () => saves++;
s.Main_ReloadScreen = () => reloads++;
s.Main_showWarningDialog = text => (warned = text);
s.Main_A_includes_B = (a, b) => a.indexOf(b) !== -1;

/* The toggle runs on a live cell of the followed live screen. */
const key = s.Main_UserLive;
s.ScreenObj = {};
s.ScreenObj[key] = {
    screen: key,
    screenType: 0,
    posY: 1,
    posX: 2,
    ids: s.Screens_ScreenIds('UserLive', key),
    thumbclass: 'stream_thumbnail_live_holder',
    img_404: '404.png',
    DataObj: {'1_2': ['thumb', 'Streamer', 'title', 'game', 100, '7h 19m', 'streamer', 'broadcast-1', 0, 'logo', 1, 'uptime', '2026-11-25T00:00:00Z', 21074, '42', '', '', '', '']}
};
s.Screens_values_Play_data = s.ScreenObj[key].DataObj['1_2'];

/* 1. The store is created lazily and the lookup is safe before that. */
check(!s.Screens_isFavorite('42'), 'lookup on a user without the favorites key is false');
s.Screens_FavoritesSetDefaultObj();
check(s.Main_values_History_data['1'].favorites !== undefined, 'default object created');
check(!s.Screens_isFavorite('42'), 'empty favorites lookup is false');
check(!s.Screens_isFavorite(undefined), 'missing channel id is false');

/* 2. Toggling on Live now stores the id + name and reloads the screen to re-pin. */
const savesBefore = saves;
s.Screens_FavoriteChannel(key);
const entry = s.Main_values_History_data['1'].favorites['42'];
check(entry && entry.data[1] === '42', 'favorite entry stores the channel id');
check(entry && entry.data[3] === 'streamer', 'favorite entry stores the channel name');
check(entry && entry.date > 0, 'favorite entry has a date');
check(saves > savesBefore, 'toggle persists via Main_setHistoryItem');
check(reloads === 1, 'Live now reloads to re-sort after a toggle');
check(warned === 'Streamer pinned to the top of Following › Live now', 'adding confirms with the channel name and where it shows');
check(s.Screens_isFavorite('42'), 'lookup finds the favorite');
check(s.Screens_isFavorite(42), 'lookup tolerates a numeric id');

/* 3. Toggling again removes the entry. */
s.Screens_FavoriteChannel(key);
check(!s.Main_values_History_data['1'].favorites['42'], 'second toggle removes the favorite');
check(!s.Screens_isFavorite('42'), 'lookup is false after removal');
check(warned === 'Streamer removed from favorites', 'removing confirms too');

/* 4. Without a user the toggle warns and stores nothing. */
userSet = false;
s.Screens_FavoriteChannel(key);
check(warned === s.STR_FAVORITE_NO_USER, 'no user warns instead of toggling');
check(!s.Main_values_History_data['1'].favorites['42'], 'no user stores nothing');
userSet = true;

/* 5. On other screens the toggle flips the star of the focused card instead of reloading. */
let badgeHidden = null;
const otherKey = 1;
s.ScreenObj[otherKey] = {
    screen: otherKey,
    screenType: 0,
    posY: 1,
    posX: 2,
    ids: s.Screens_ScreenIds('Live', otherKey)
};
const icon = {classList: {list: ['hideimp']}};
icon.classList.add = c => icon.classList.list.push(c);
icon.classList.remove = c => (icon.classList.list = icon.classList.list.filter(x => x !== c));
s.Main_getElementById = id => (id === s.ScreenObj[otherKey].ids[2] + '1_2' ? {querySelector: sel => (sel === '.stream_fav_icon' ? icon : null)} : null);

s.Screens_values_Play_data = s.ScreenObj[key].DataObj['1_2'];
const reloadsBefore = reloads;
s.Screens_FavoriteChannel(otherKey);
badgeHidden = icon.classList.list.indexOf('hideimp') === -1;
check(badgeHidden, 'favorite on a non UserLive screen shows the star');
s.Screens_FavoriteChannel(otherKey);
check(icon.classList.list.indexOf('hideimp') !== -1, 'unfavorite hides the star again');
check(reloads === reloadsBefore, 'no reload on other screens');

/* 6. Stable favorites-first sort of the followed live list. */
const cell = userId => ({user_id: userId, id: 'b' + userId});
const data = [cell('a'), cell('b'), cell('c'), cell('d'), cell('e')];

s.Main_values_History_data['1'].favorites = {b: {date: 1, data: []}, d: {date: 2, data: []}};

check(s.ScreensObj_SortFavoritesFirst(data, 0) === false, 'first page (rendered 0) never asks for a rebuild');
check(
    data.map(c => c.user_id).join('') === 'bdace',
    'favorites pin to the front, the rest keeps the API order'
);

check(s.ScreensObj_SortFavoritesFirst([cell('a')], 0) === false, 'no favorites leaves the order and flag untouched');
check(s.ScreensObj_SortFavoritesFirst([], 0) === false, 'empty data is a no-op');

/* A favorite in a later page bubbles into the rendered prefix: rebuild needed. */
const paged = [cell('a'), cell('b'), cell('c'), cell('x'), cell('f')];
s.Main_values_History_data['1'].favorites = {f: {date: 3, data: []}};
check(s.ScreensObj_SortFavoritesFirst(paged, 3) === true, 'late-page favorite in the rendered prefix asks for a rebuild');
check(paged.map(c => c.user_id).join('') === 'fabcx', 'late-page favorite pins to the front');

/* The favorite was already rendered: no rebuild, just the rest in order. */
const rendered = [cell('a'), cell('b'), cell('c'), cell('d')];
s.Main_values_History_data['1'].favorites = {a: {date: 1, data: []}};
check(s.ScreensObj_SortFavoritesFirst(rendered, 3) === false, 'already rendered favorite does not rebuild');

/* 7. Live cells render the star for favorites, hidden otherwise (createCellLive). */
s.Main_VideoSize = '320x180';
s.Main_randomImg = '';
s.twemoji = {parse: text => text};
s.Main_ReplaceLargeFont = text => text;
s.Main_videoCreatedAtWithHM = () => '';
s.Play_timeMs = () => 0;
s.Main_ColorBadgeLive = 'd92626';
s.Main_ColorBadgeVod = '00843a';
s.Main_ColorBadgeClip = 'c2410c';
s.Main_ColorIndicatorVod = '00a94b';
s.Main_ColorIndicatorHosting = 'FED000';
s.Main_ColorIndicatorLive = 'ff4d4d';
s.SettingsColor_Accent = '#7635fc';
s.Main_ColorBadgeFavorite = 'FED000';
const ScreenObjSaved = s.ScreenObj[key];
const liveData = ScreenObjSaved.DataObj['1_2'];
ScreenObjSaved.DataObj = {};

s.Main_values_History_data['1'].favorites = {42: {date: 1, data: []}};
const favHtml = s.Screens_createCellLive('0_0', ScreenObjSaved.ids, liveData, key);
check(/icon-star stream_fav_icon strokedeline(?! hideimp)/.test(favHtml), 'favorite cell shows the star');

s.Main_values_History_data['1'].favorites = {};
const plainHtml = s.Screens_createCellLive('0_1', ScreenObjSaved.ids, liveData, key);
check(/icon-star stream_fav_icon strokedeline hideimp/.test(plainHtml), 'non-favorite cell keeps the star hidden');
check(favHtml.indexOf('stream_fav_icon') === plainHtml.indexOf('stream_fav_icon'), 'the star markup sits at the same child position either way');

/* 8. Options rows: Favorite (id 9) is drawn under Follow (id 2); Up/Down follow the on-screen
 * order and skip hidden rows, and stop at either end. */
const rows = {};
for (let i = -1; i <= 9; i++) rows[i] = {className: 'hist_div'};
rows[-1].className = 'hist_div hideimp';
let focused = 2;
s.Main_getElementById = id => rows[id.replace('dialog_thumb_opt_setting_', '')] || null;
s.Screens_histRemoveFocus = () => {};
s.Screens_ThumbOptionAddFocus = pos => (focused = pos);
s.Screens_ThumbOptionPosY = 2;
s.Screens_ThumbOptionDialogKeyUpDown(key, 2, 1);
check(s.Screens_ThumbOptionPosY === 9 && focused === 9, 'down from Follow lands on Favorite');
s.Screens_ThumbOptionDialogKeyUpDown(key, 9, 1);
check(s.Screens_ThumbOptionPosY === 3 && focused === 3, 'down from Favorite lands on Block channel');
s.Screens_ThumbOptionDialogKeyUpDown(key, 3, -1);
check(s.Screens_ThumbOptionPosY === 9, 'up from Block channel returns to Favorite');

s.Screens_ThumbOptionPosY = 8;
s.Screens_ThumbOptionDialogKeyUpDown(key, 8, 1);
check(s.Screens_ThumbOptionPosY === 8, 'down on the last row (Go to screen) stays on it');

rows[9].className = 'hist_div hideimp';
s.Screens_ThumbOptionPosY = 2;
s.Screens_ThumbOptionDialogKeyUpDown(key, 2, 1);
check(s.Screens_ThumbOptionPosY === 3, 'a hidden Favorite row (categories, banners) is skipped');

s.Screens_ThumbOptionPosY = 0;
s.Screens_ThumbOptionDialogKeyUpDown(key, 0, -1);
check(s.Screens_ThumbOptionPosY === 0, 'up past a hidden first row keeps the current row');

/* 9. The player's followed feed and side panel put favorites first, keeping the feed sort. */
const node = id => ({stream: {broadcaster: {id: id}}});
s.Main_values_History_data['1'].favorites = {c: {date: 1, data: []}, e: {date: 2, data: []}};
const feed = [node('a'), node('b'), node('c'), node('d'), node('e'), {stream: null}];
const sortedFeed = s.UserLiveFeedobj_FavoritesFirst(feed);
check(sortedFeed.map(n => (n.stream ? n.stream.broadcaster.id : '-')).join('') === 'ceabd-', 'feed favorites lead, the rest keeps its order');
s.Main_values_History_data['1'].favorites = {};
check(s.UserLiveFeedobj_FavoritesFirst(feed) === feed, 'no favorites returns the feed untouched');
userSet = false;
s.Main_values_History_data['1'].favorites = {c: {date: 1, data: []}};
check(s.UserLiveFeedobj_FavoritesFirst(feed) === feed, 'signed out returns the feed untouched');
userSet = true;

/* 10. Channel page Favorite button: label and pressed state follow the store, the toggle confirms. */
const html = {},
    attrs = {};
s.Main_innerHTML = (id, value) => (html[id] = value);
s.Main_getElementById = id => ({setAttribute: (name, value) => (attrs[id + ':' + name] = value)});
s.Main_values = {Main_selectedChannel_id: '77', Main_selectedChannel: 'chan', Main_selectedChannelDisplayname: 'Chan'};
s.Main_values_History_data['1'].favorites = {};
s.ChannelContent_setFavorite();
check(/Favorite$/.test(html.channel_content_titley_3) && attrs['channel_content_thumbdivy_3:aria-pressed'] === 'false', 'channel page shows Favorite at rest');
s.ChannelContent_toggleFavorite();
check(s.Screens_isFavorite('77'), 'channel page button stores the favorite');
check(s.Main_values_History_data['1'].favorites['77'].data[3] === 'chan', 'channel page stores the login name');
check(/Favorited$/.test(html.channel_content_titley_3) && /FED000/.test(html.channel_content_titley_3), 'set state reads Favorited with the gold star');
check(attrs['channel_content_thumbdivy_3:aria-pressed'] === 'true', 'set state is announced as pressed');
check(warned === 'Chan pinned to the top of Following › Live now', 'channel page confirms the toggle');
userSet = false;
s.ChannelContent_setFavorite();
check(/Sign in to favorite$/.test(html.channel_content_titley_3), 'signed out the button asks to sign in');
s.ChannelContent_toggleFavorite();
check(warned === s.STR_FAVORITE_NO_USER, 'signed out the button warns instead of toggling');
userSet = true;

console.log('favorites-tests: ' + checks + ' checks OK' + (built ? ' (built)' : ''));
