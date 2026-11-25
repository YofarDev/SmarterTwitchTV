/* Favorites fixture: the per-user favorites store, the options-dialog toggle and the
 * Live now pin sort, against production definitions only. No app init, no network.
 * Run after a full build for --built mode. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');

const wanted =
    /^(Screens_FavoritesSetDefaultObj|Screens_isFavorite|Screens_FavoriteChannel|Screens_FavoriteUpdateBadge|Screens_BlockChannelGetId|Screens_BlockChannelGetName|Screens_createCellLive|Screens_ActionsButtonHtml|Screens_ScreenIds|Screens_AriaEscape|Screens_ThumbOptionDialogKeyUpDown|ScreensObj_SortFavoritesFirst|Main_Slice|Main_GetViewerStrings|Main_GetCompactViewerStrings|Main_formatCompactViewers|Main_formatCompactScaled|Main_formatLiveDuration|Main_formatNumber|Main_AddClassWithEle|Main_RemoveClassWithEle)$/;
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

const s = require('./ui-test-sandbox')();
vm.runInContext(definitions.join('\n'), s);

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
check(s.Screens_isFavorite('42'), 'lookup finds the favorite');
check(s.Screens_isFavorite(42), 'lookup tolerates a numeric id');

/* 3. Toggling again removes the entry. */
s.Screens_FavoriteChannel(key);
check(!s.Main_values_History_data['1'].favorites['42'], 'second toggle removes the favorite');
check(!s.Screens_isFavorite('42'), 'lookup is false after removal');

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

/* 8. Down on the last visible row stays put when the Favorite row below is hidden
 * (categories, banners): clamping onto the hidden row selected it without focus. */
const rows = {};
for (let i = -1; i <= 9; i++) rows[i] = {className: 'hist_div'};
rows[9].className = 'hist_div hideimp';
let focused = 8;
s.Main_getElementById = id => rows[id.replace('dialog_thumb_opt_setting_', '')] || null;
s.Main_A_includes_B = (a, b) => a.indexOf(b) !== -1;
s.Screens_histRemoveFocus = () => {};
s.Screens_ThumbOptionAddFocus = pos => (focused = pos);
s.Screens_ThumbOptionTotalPosition = 9;
s.Screens_ThumbOptionPosY = 8;
s.Screens_ThumbOptionDialogKeyUpDown(key, 8, 1);
check(s.Screens_ThumbOptionPosY === 8 && focused === 8, 'down past a hidden last row keeps the current row');

rows[9].className = 'hist_div';
s.Screens_ThumbOptionDialogKeyUpDown(key, 8, 1);
check(s.Screens_ThumbOptionPosY === 9 && focused === 9, 'a visible Favorite row takes the focus');
s.Screens_ThumbOptionDialogKeyUpDown(key, 9, 1);
check(s.Screens_ThumbOptionPosY === 9 && focused === 9, 'down on the last row stays on it');

console.log('favorites-tests: ' + checks + ' checks OK' + (built ? ' (built)' : ''));
