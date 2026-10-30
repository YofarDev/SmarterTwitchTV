/* Account screen tabs: Up on the first row of the user grid opens the Account tabs, and closing the
 * navigation back to the grid redraws the Users focus. Loads the real Users.js and Navigation.js. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
    fs
        .readFileSync('app/specific/Main.js', 'utf8')
        .match(/^var Main_[A-Za-z_]+ = \d+;/gm)
        .slice(0, 27)
        .join('\n'),
    sandbox
);
vm.runInContext(fs.readFileSync('app/specific/Navigation.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('app/specific/Users.js', 'utf8'), sandbox);

let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}
const s = sandbox;
const calls = [];
['KEY_KEYBOARD_BACKSPACE', 'KEY_RETURN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_UP', 'KEY_DOWN', 'KEY_PAUSE', 'KEY_6', 'KEY_PLAY', 'KEY_PLAYPAUSE'].forEach(
    (name, i) => (s[name] = 1000 + i)
);
let shown = {};
let thumbs = {};
Object.assign(s, {
    Main_FirstLoad: false,
    Users_ids: ['thumbdiv'],
    Main_values: {Main_Go: s.Main_Users},
    ScreenObj: {},
    Main_CantClick: () => false,
    Main_keyClickDelayStart: () => {},
    Main_isElementShowing: id => Boolean(shown[id]),
    Main_ThumbNull: (y, x) => Boolean(thumbs[y + '_' + x]),
    Main_addEventListener: (type, fn) => calls.push('listen:' + (fn === s.Users_handleKeyDown ? 'users' : 'other')),
    Settings_isVisible: () => false,
    Navigation_Open: (callback, region) => calls.push('open:' + region + ':' + (callback === s.Users_handleKeyDown ? 'users' : 'other')),
    Users_removeFocus: () => calls.push('remove:' + s.Users_cursorY + '_' + s.Users_cursorX),
    Users_addFocus: () => calls.push('focus:' + s.Users_cursorY + '_' + s.Users_cursorX)
});
function up() {
    calls.length = 0;
    s.Users_handleKeyDown({keyCode: s.KEY_UP});
}

thumbs = {'0_0': true, '0_1': true, '1_0': true};
s.Users_cursorY = 0;
s.Users_cursorX = 1;
up();
check(calls.join(',') === 'remove:0_1,open:tabs:users', 'first row Up drops grid focus and opens the Account tabs');

s.Users_cursorY = 1;
s.Users_cursorX = 0;
up();
check(calls.join(',') === 'remove:1_0,focus:0_0', 'lower row Up still moves within the grid');
check(s.Users_cursorY === 0, 'lower row Up lands on the first row');

for (const dialog of ['yes_no_dialog', 'main_dialog_user']) {
    shown = {[dialog]: true};
    s.Users_cursorY = 0;
    up();
    check(calls.length === 0, dialog + ' keeps Up inside the dialog');
}
shown = {};

/* Closing back to the grid (Down from the tabs, Right from the rail) must redraw the Users focus. */
function close(restore) {
    calls.length = 0;
    s.Navigation_Region = '';
    s.Navigation_Callback = s.Users_handleKeyDown;
    s.Navigation_Close(restore);
}
s.Users_status = true;
s.Users_cursorY = 0;
s.Users_cursorX = 1;
close(true);
check(calls.join(',') === 'listen:users,focus:0_1', 'restoring to Users re-adds its listener and focus');
close(false);
check(calls.length === 0, 'closing to another screen leaves Users alone');
s.Users_status = false;
close(true);
check(calls.join(',') === 'listen:users', 'no focus while the user grid is still loading');
s.Users_status = true;
s.Navigation_Onboarding = true;
close(true);
check(calls.join(',') === 'listen:users', 'onboarding keeps its own focus');
s.Navigation_Onboarding = false;
s.Main_values.Main_Go = s.Main_Live;
close(true);
check(!calls.some(call => call.indexOf('focus:') === 0), 'other screens do not get the Users focus');

console.log(checks + ' account navigation checks passed');
