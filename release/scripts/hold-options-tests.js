/* Hold OK on a grid card opens its options: auto-repeat and the release of that press must not pick an
 * option or re-arm the grid behind the dialog. Loads the real TVKeyValue.js, Screens.js and Users.js key handlers,
 * and Main_KeyOwnershipReset from Main.js. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const s = {};
vm.createContext(s);
vm.runInContext(fs.readFileSync('app/general/TVKeyValue.js', 'utf8'), s);
vm.runInContext(fs.readFileSync('app/specific/Screens.js', 'utf8'), s);

let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}

const listeners = {keydown: new Set(), keyup: new Set()};
let timer = null,
    dialogShown = false,
    plays = 0,
    picks = 0,
    direct = 0;
s.Main_addEventListener = (type, fun) => listeners[type].add(fun);
s.Main_removeEventListener = (type, fun) => listeners[type].delete(fun);
s.Main_setTimeout = fun => ((timer = fun), 1);
s.Main_clearTimeout = () => (timer = null);
s.Main_isScene1DocVisible = () => true;
s.Sidepannel_isShowingUserLive = () => false;
s.Sidepannel_isShowingMenus = () => false;
s.Main_CantClick = () => false;
s.Main_keyClickDelayStart = () => {};
s.Settings_Obj_default = () => direct;
s.Main_isElementShowingWithEle = () => dialogShown;
// Only the dialog's listener swap matters here; its content building needs the full app.
s.Screens_ThumbOptionStart = key => {
    s.Screens_clear = true;
    s.Main_removeEventListener('keydown', s.ScreenObj[key].key_fun);
    s.Main_addEventListener('keydown', s.ScreenObj[key].key_thumb);
    dialogShown = true;
};
s.Screens_ThumbOptionDialogKeyEnter = key => {
    picks++;
    dialogShown = false;
    s.Main_removeEventListener('keydown', s.ScreenObj[key].key_thumb);
    s.Main_addEventListener('keydown', s.ScreenObj[key].key_fun);
};

const key = 1;
s.ScreenObj = {};
s.ScreenObj[key] = {posY: 0, posX: 0, posSub: s.Screens_SubBody, key_play: () => plays++};
s.ScreenObj[key].key_fun = e => s.Screens_handleKeyDown(key, e);
s.ScreenObj[key].key_up = e => s.Screens_handleKeyUp(key, e);
s.ScreenObj[key].key_thumb = e => s.Screens_ThumbOptionhandleKeyDown(key, e);

function send(type, keyCode) {
    Array.from(listeners[type]).forEach(fun => fun({keyCode: keyCode}));
}
function hold(repeats) {
    send('keydown', s.KEY_ENTER);
    const fire = timer;
    timer = null;
    if (fire) fire();
    for (let i = 0; i < repeats; i++) send('keydown', s.KEY_ENTER);
}
function reset() {
    listeners.keydown.clear();
    listeners.keyup.clear();
    listeners.keydown.add(s.ScreenObj[key].key_fun);
    timer = null;
    dialogShown = false;
    plays = picks = 0;
}

for (direct of [0, 1]) {
    const mode = direct ? 'direct: ' : 'legacy: ';
    reset();
    send('keydown', s.KEY_ENTER);
    send('keyup', s.KEY_ENTER);
    check(plays === 1 && !dialogShown, mode + 'a tap still watches');
    check(listeners.keydown.has(s.ScreenObj[key].key_fun) && !listeners.keyup.size, mode + 'a tap re-arms the grid');

    reset();
    hold(10);
    check(dialogShown, mode + 'a hold opens the options');
    check(picks === 0, mode + 'auto-repeat of the held OK cannot pick an option');
    send('keyup', s.KEY_ENTER);
    check(plays === 0 && dialogShown, mode + 'the release neither watches nor closes the options');
    check(!listeners.keyup.size, mode + 'the release removes the grid key-up listener');
    check(!listeners.keydown.has(s.ScreenObj[key].key_fun), mode + 'the grid stays disarmed behind the options');
    check(listeners.keydown.has(s.ScreenObj[key].key_thumb), mode + 'the options keep key-down');
    send('keydown', s.KEY_ENTER);
    check(picks === 1, mode + 'a fresh OK picks the focused option');
    check(listeners.keydown.size === 1 && listeners.keydown.has(s.ScreenObj[key].key_fun), mode + 'only the grid listens after the options close');
}

/* Account screen: OK on a saved account opens the user dialog on key-down. Holding it must not let
 * auto-repeat pick "make main", whose reload lands on the Add User card for the next repeat. */
vm.runInContext(fs.readFileSync('app/specific/Users.js', 'utf8'), s);
const shown = new Set();
let makeMain = 0,
    addUser = 0;
Object.assign(s, {
    Main_FirstLoad: false,
    Main_values: {},
    Users_ids: ['thumbdiv'],
    Main_isElementShowing: id => shown.has(id),
    Main_HideElement: () => {},
    Users_showUserDialog: () => shown.add('main_dialog_user'),
    Users_HideUserDialog: () => shown.delete('main_dialog_user'),
    // Like the real reload, making an account main resets the cursor to the Add User card.
    AddUser_UserMakeOne: () => (makeMain++, (s.Users_cursorX = 0), (s.Users_cursorY = 0)),
    AddUser_init: () => addUser++
});
function resetUsers(x) {
    listeners.keydown.clear();
    listeners.keyup.clear();
    listeners.keydown.add(s.Users_handleKeyDown);
    shown.clear();
    makeMain = addUser = 0;
    s.Users_HeldKey = 0;
    s.Users_RemoveCursor = 0;
    s.Users_cursorY = 0;
    s.Users_cursorX = x;
}

resetUsers(1);
send('keydown', s.KEY_ENTER);
for (let i = 0; i < 10; i++) send('keydown', s.KEY_ENTER);
check(shown.has('main_dialog_user'), 'account: a held OK opens the user dialog');
check(makeMain === 0 && addUser === 0, 'account: auto-repeat neither makes the account main nor opens Add User');
send('keyup', s.KEY_UP);
send('keydown', s.KEY_ENTER);
check(makeMain === 0, 'account: another key coming up does not release the held OK');
send('keyup', s.KEY_ENTER);
check(!listeners.keyup.size && !s.Users_HeldKey, 'account: the release clears the hold');
send('keydown', s.KEY_ENTER);
check(makeMain === 1 && addUser === 0, 'account: a fresh OK picks the focused option once');

resetUsers(1);
send('keydown', s.KEY_ENTER);
send('keyup', s.KEY_ENTER);
check(shown.has('main_dialog_user') && !listeners.keyup.size, 'account: a tap opens the dialog and leaves no key-up listener');

resetUsers(0);
send('keydown', s.KEY_ENTER);
check(addUser === 1 && !s.Users_HeldKey && !listeners.keyup.size, 'account: OK on Add User opens it without arming the hold');

resetUsers(1);
send('keydown', s.KEY_ENTER);
s.Users_handleKeyUp(); // Main_KeyOwnershipReset after a lost key-up
check(!s.Users_HeldKey && !listeners.keyup.size, 'account: a lost key-up is reset on blur');
send('keydown', s.KEY_ENTER);
check(makeMain === 1, 'account: OK works again after the reset');

/* Grid: the page blurs while OK is held on a card, before the hold opens the options, so that press never comes up.
 * The real Main_KeyOwnershipReset disarms its release; options opened afterwards by holding Left must still take OK. */
vm.runInContext(fs.readFileSync('app/specific/Main.js', 'utf8').match(/function Main_KeyOwnershipReset\(\)[\s\S]*?\n}/)[0], s);
Object.assign(s, {
    UIFocus_SuppressedKeys: {},
    ChannelContent_KeyEnterID: null,
    Main_ChannelContent: 14,
    Main_values: {Main_Go: key},
    Main_GridOwnsInput: () => true
});
direct = 0;
reset();
send('keydown', s.KEY_ENTER);
s.Main_KeyOwnershipReset();
check(listeners.keydown.has(s.ScreenObj[key].key_fun) && !listeners.keyup.size, 'blur: the reset re-arms the grid without the lost release');
send('keydown', s.KEY_LEFT);
const holdLeft = timer;
timer = null;
if (holdLeft) holdLeft();
send('keyup', s.KEY_LEFT);
check(dialogShown, 'blur: holding Left still opens the options');
send('keydown', s.KEY_ENTER);
check(picks === 1, 'blur: OK picks an option after a lost key-up');

console.log(checks + ' hold options checks passed');
