/* Account screen navigation: Up on the first row of the user grid opens the Account tabs, closing the
 * navigation back to the grid redraws the Users focus, and the Add User screen reaches the rail and tabs.
 * Loads the real Users.js, AddUser.js and Navigation.js. */
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
vm.runInContext(fs.readFileSync('app/specific/AddUser.js', 'utf8'), sandbox);

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

/* Add User: Left opens the rail, Up the tabs. Without an account it is the Account destination itself,
 * so Back opens the rail; with one it was opened from the user grid and Back returns there. */
s.KEY_KEYBOARD_BACKSPACE = 8;
s.KEY_RETURN = 27;
s.STR_USER_ADD = 'Add User';
Object.assign(s, {
    Navigation_Render: () => {},
    ScreensObj_SetTopLable: () => {},
    Main_HideWarningDialog: () => {},
    Main_CounterDialogRst: () => calls.push('counter-reset'),
    Main_showLoadDialog: () => {},
    Main_ShowElement: () => {},
    Main_HideElement: () => {},
    AddUser_inputFocus: () => {},
    Main_isAboutDialogVisible: () => false,
    Main_isControlsDialogVisible: () => false,
    AddUser_exit: () => calls.push('exit'),
    Main_SwitchScreen: () => calls.push('switch')
});
s.Navigation_Open = (callback, region) => calls.push('open:' + region + ':' + (callback === s.AddUser_handleKeyDown ? 'adduser' : 'other'));
function addUserKey(key) {
    calls.length = 0;
    s.AddUser_handleKeyDown({keyCode: key});
    return calls.join(',');
}
calls.length = 0;
s.AddUser_init();
check(calls.join(',') === 'counter-reset', 'opening Add User drops the previous grid page counter');
check(s.Main_values.Main_Go === s.Main_addUser, 'Add User is the current screen');
check(addUserKey(s.KEY_LEFT) === 'open:rail:adduser', 'Left on Add User opens the rail');
check(addUserKey(s.KEY_UP) === 'open:tabs:adduser', 'Up on Add User opens the Account tabs');
s.AddUser_UsernameArray = [];
check(addUserKey(s.KEY_RETURN) === 'open:rail:adduser', 'Back without an account opens the rail');
s.AddUser_UsernameArray = [{name: 'alex'}];
check(addUserKey(s.KEY_RETURN) === 'exit,switch', 'Back with an account returns to the screen it came from');

/* The code flow's requests and timers outlive Add User. Leaving it runs its exit, so an answer landing on the next
 * screen must stop the flow instead of acting as Back there: no rail over that screen, no switch away from it. */
vm.runInContext(fs.readFileSync('app/specific/AddUser.js', 'utf8'), s); // the real exit this time
const requests = [];
const failures = [];
const timers = [];
Object.assign(s, {
    STR_ADD_ERROR: 'error',
    STR_ADD_USER_TEXT_COUNTER_NOW: 'now',
    AddCode_Url: '',
    AddCode_UrlToken: '',
    AddCode_Scopes: [],
    AddCode_backup_client_id: '',
    Main_isTV: true,
    Main_IsOn_OSInterface: false,
    Main_removeEventListener: () => {},
    Main_HideLoadDialog: () => {},
    Main_showWarningDialog: () => calls.push('warning'),
    Main_textContent: () => {},
    FullxmlHttpGet: (url, headers, success, error) => {
        requests.push(success);
        failures.push(error);
    },
    Main_setTimeout: fn => timers.push(fn),
    Main_clearTimeout: id => {
        if (id) timers[id - 1] = null;
    }
});
function onAddUser(account) {
    s.AddUser_UsernameArray = account ? [{name: 'alex'}] : [];
    s.Main_values.Main_Before = s.Main_Users;
    s.Main_values.Main_Go = s.Main_addUser;
    requests.length = 0;
    failures.length = 0;
}
// Ids are 1-based positions in timers; this is the wait the last error started.
function errorWait() {
    s.AddUser_getCodeError();
    return timers.length - 1;
}
for (const account of [false, true]) {
    const who = account ? 'with an account: ' : 'without an account: ',
        next = account ? s.Main_Users : s.Main_Live;
    // The device code request is out when the rail or the tabs take the user to the next screen.
    onAddUser(account);
    s.AddUser_getCode();
    s.AddUser_exit();
    s.Main_values.Main_Before = s.Main_addUser;
    s.Main_values.Main_Go = next;
    calls.length = 0;
    const started = timers.length;
    requests[0]({status: 200, responseText: JSON.stringify({user_code: 'A', verification_uri: 'u', device_code: 'd'})});
    check(
        !calls.length && s.Main_values.Main_Go === next && timers.length === started,
        who + 'a late device code answer stops, the next screen stays'
    );
    s.AddUser_getCodeCheck(3);
    s.AddUser_getDeviceCodeSuccess({status: 400, responseText: '{"message":"authorization_pending"}'});
    s.AddUser_getUserTokenSuccess({status: 200, responseText: '{}'});
    check(
        !calls.length && s.Main_values.Main_Go === next && requests.length === 1 && timers.length === started,
        who + 'late countdown, poll and user answers stop too'
    );

    // Both requests also fail through AddUser_getCodeError, so a failure can land after leaving as well.
    onAddUser(account);
    s.AddUser_getCode();
    s.AddUser_getCodeCheck(0); // the poll is out too
    s.AddUser_exit();
    s.Main_values.Main_Go = next;
    calls.length = 0;
    const waits = timers.length;
    failures.forEach(fail => fail());
    check(failures.length === 2 && !calls.length && timers.length === waits, who + 'requests failing after leaving show no error and start no wait');

    // An error goes Back after a wait while Add User is still up, never after the user left.
    onAddUser(account);
    calls.length = 0;
    let wait = errorWait();
    timers[wait]();
    check(
        calls.join(',') === 'warning,' + (account ? 'switch' : 'open:rail:adduser'),
        who + 'an error on Add User still shows and goes Back after the wait'
    );
    onAddUser(account);
    wait = errorWait();
    s.AddUser_exit();
    check(timers[wait] === null, who + 'leaving cancels the error wait');
    onAddUser(account);
    wait = errorWait();
    s.Main_values.Main_Go = next;
    calls.length = 0;
    timers[wait]();
    check(!calls.length && s.Main_values.Main_Go === next, who + 'an error wait that outlives the screen does nothing');
}

console.log(checks + ' account navigation checks passed');
