/* VOD channel logo fixture: the logo the VOD player starts with when a VOD opens from a list, and
 * the logo the VOD info answer stores, against production definitions only. The VOD cell array has
 * no logo field, so a VOD of another channel must not start with the previous channel's logo.
 * Run after a full build for --built mode. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');

const wanted = /^(Main_OpenVodStart|PlayVod_get_vod_infoResult)$/;
const sources = built ? ['release/githubio/js/main_uncompressed.js'] : ['app/specific/Main.js', 'app/specific/PlayVod.js'];
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

const noop = () => {};
let logoAtOpen;
const loaded = [];
const s = {
    Main_values: {},
    Main_values_Play_data: null,
    Play_data: {data: []},
    Main_IsOn_OSInterface: true,
    PlayVod_isOn: true,
    Main_ThumbOpenIsNull: () => false,
    Main_clearAllPlayerEvents: noop,
    Main_removeEventListener: noop,
    Main_RemoveClass: noop,
    Play_SetSceneBackground: noop,
    //What the VOD player shows first (PlayVod_Start loads Main_selectedChannelLogo)
    Main_openVod: () => (logoAtOpen = s.Main_values.Main_selectedChannelLogo),
    Main_getElementById: id => ({id}),
    Play_LoadLogo: (el, src) => loaded.push(src),
    PlayVod_previews_pre_start: noop,
    PlayVod_UpdateGameInfoLabels: noop,
    PlayVod_ProcessChapters: noop,
    PlayVod_updateVodInfoPanel: noop
};
vm.createContext(s);
vm.runInContext(definitions.join('\n'), s);

//A VOD cell as ScreensObj builds it: 14 is the channel id, 15 the duration, no logo field
const vodCell = (channelId, name) => {
    const cell = ['https://thumb.jpg', name, 'Nov 9', '', '100', '', name.toLowerCase(), '2924251354', '', 'en', 'title', '10410'];
    cell[14] = channelId;
    cell[15] = '2h53m30s';
    return cell;
};
const open = cell => s.Main_OpenVodStart(cell, '0_0', ['a', 'b'], noop);

//From the channel's own VOD screen: its logo is kept
s.Main_values.Main_selectedChannel_id = '23257020';
s.Main_values.Main_selectedChannelLogo = 'https://ster-logo.png';
open(vodCell('23257020', 'ster'));
check(logoAtOpen === 'https://ster-logo.png', 'same channel: the player starts with its logo');

//Same channel, the id stored as a number by another screen: still kept
s.Main_values.Main_selectedChannel_id = 23257020;
open(vodCell('23257020', 'ster'));
check(logoAtOpen === 'https://ster-logo.png', 'same channel, numeric id: the logo is kept');

//From another list after watching another channel: that channel's logo is not shown
s.Main_values.Main_selectedChannel_id = '27446144';
s.Main_values.Main_selectedChannelLogo = 'https://fubgun-logo.png';
open(vodCell('23257020', 'ster'));
check(logoAtOpen === '', 'other channel: the player starts with no logo (placeholder), not the previous one');
check(s.Main_values.Main_selectedChannel_id === '23257020', 'the VOD channel id is stored');

//The VOD info answer shows and stores the creator's logo
s.PlayVod_get_vod_infoResult({
    status: 200,
    responseText: JSON.stringify({
        data: {
            video: {creator: {id: '23257020', login: 'ster', displayName: 'ster', profileImageURL: 'https://ster-logo.png', roles: {isPartner: true}}}
        }
    })
});
check(loaded[loaded.length - 1] === 'https://ster-logo.png', 'VOD info: the creator logo is shown');
check(s.Main_values.Main_selectedChannelLogo === 'https://ster-logo.png', 'VOD info: the creator logo is stored for later uses');

console.log(checks + ' VOD logo checks passed');
