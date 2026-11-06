/* Background, resume and dialog paths on screens without a ScreenObj (Search, Add User).
 * Runs the production functions below; every other call is a recording stub. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');
const source = built
    ? fs.readFileSync('release/githubio/js/main_uncompressed.js', 'utf8')
    : ['Main.js', 'Screens.js', 'Navigation.js'].map(file => fs.readFileSync('app/specific/' + file, 'utf8')).join('\n');
const wanted = [
    'Main_CheckStop',
    'Main_CheckDialogs',
    'Main_CheckResume',
    'Main_CheckAccessibility',
    'Main_HideUpdateDialog',
    'Screens_ClearAnimation',
    'Screens_IsDivFocused',
    'Screens_Isfocused',
    'Navigation_Activate',
    'Main_SwitchScreen',
    'Main_CheckAccessibilitySet',
    'Main_CheckAccessibilityHide',
    'Main_HideExitDialog'
];
const definitions = {};
UglifyJS.parse(source).walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_Defun && wanted.indexOf(node.name.name) !== -1) definitions[node.name.name] = node.print_to_string();
    })
);
wanted.forEach(name => assert(definitions[name], (built ? 'Rebuild first: ' : '') + name + ' not found'));
const code = wanted.map(name => definitions[name]).join('\n');
// In the built bundle the wrapper indents the app code, so the id declarations do not start the line.
const ids = source.match(/^[ \t]*var Main_[A-Za-z]+ = \d+;/gm).join('\n');

// Every global the functions call becomes a recording stub; every other global starts undefined.
const toplevel = UglifyJS.parse(code);
toplevel.figure_out_scope();
const callees = new Set(),
    globals = new Set();
const walker = new UglifyJS.TreeWalker(node => {
    if (
        node instanceof UglifyJS.AST_SymbolRef &&
        node.thedef &&
        node.thedef.undeclared &&
        wanted.indexOf(node.name) === -1 &&
        !(node.name in globalThis)
    ) {
        const parent = walker.parent();
        if (parent instanceof UglifyJS.AST_Call && parent.expression === node) callees.add(node.name);
        else globals.add(node.name);
    }
});
toplevel.walk(walker);

let calls = [],
    checks = 0;
function setup(screen, overrides) {
    calls = [];
    const s = {console, Boolean, Date};
    callees.forEach(name => {
        s[name] = function () {
            calls.push([name].concat(Array.prototype.slice.call(arguments)));
        };
    });
    globals.forEach(name => {
        if (!(name in s)) s[name] = undefined;
    });
    vm.createContext(s);
    vm.runInContext(ids, s);
    vm.runInContext(code, s);
    // Production functions record their calls too, so a check can see that one ran.
    wanted.forEach(name => {
        const real = s[name];
        s[name] = function () {
            calls.push([name].concat(Array.prototype.slice.call(arguments)));
            return real.apply(this, arguments);
        };
    });
    Object.assign(s, {
        Main_IsOn_OSInterface: true,
        Main_updateClockId: 'clock',
        Main_CheckResumeVodsId: 'resumeVods',
        Play_data: {data: []},
        Main_isScene1DocVisible: () => true,
        Settings_Obj_default: () => false,
        ScreenObj: [],
        Main_values: {Main_Go: s[screen]}
    });
    // One grid screen with an animated thumbnail on its focused card.
    s.ScreenObj[s.Main_Live] = {
        HasAnimateThumb: true,
        AnimateThumbId: 'animate',
        itemsCount: 1,
        posY: 0,
        posX: 0,
        focusPos: '0_0',
        DataObj: {'0_0': {}},
        ids: ['a', 'b'],
        addFocus: true,
        key_fun: function key_fun() {},
        key_controls: function key_controls() {},
        init_fun: function () {
            calls.push(['init_fun']);
        }
    };
    Object.assign(s, overrides || {});
    return s;
}
function called(name, arg) {
    return calls.some(call => call[0] === name && (arguments.length < 2 || call[1] === arg));
}
function check(condition, message) {
    assert(condition, message);
    checks++;
}

['Main_Search', 'Main_addUser'].forEach(screen => {
    let s = setup(screen);
    s.Main_CheckStop();
    check(called('Main_clearInterval', 'clock'), screen + ': stop runs to the end and clears the clock interval');
    check(!called('Main_SwitchScreen'), screen + ': stop leaves the screen in place');

    s = setup(screen);
    s.Main_CheckResume();
    check(called('Settings_burn_in_protection_start'), screen + ': resume runs to the end');
    check(!called('Main_SwitchScreen'), screen + ': resume does not switch screen');

    s = setup(screen);
    check(s.Screens_Isfocused() === false, screen + ': Screens_Isfocused is false without a ScreenObj');

    s = setup(screen, {Main_isAboutDialogVisible: () => true});
    s.Main_CheckDialogs();
    check(called('Main_HideAboutDialog'), screen + ': stop hides an open About dialog');
    check(!called('Main_addEventListener') && !called('Screens_addFocus'), screen + ': no grid key handler is added');
});

// Updates & Changelog from the rail: the screen handler goes back under the dialog's key capture.
['Main_Search', 'Main_addUser'].forEach(screen => {
    const handler = function screenHandler() {};
    let s = setup(screen, {Navigation_Callback: handler});
    s.Navigation_Activate(9);
    const listen = calls.findIndex(call => call[0] === 'Main_addEventListener' && call[1] === 'keydown' && call[2] === handler);
    const show = calls.findIndex(call => call[0] === 'Main_UpdateDialogShowCheck');
    check(listen !== -1 && listen < show, screen + ': the rail gives the key handler back before showing the update dialog');

    s = setup(screen, {Navigation_Callback: handler});
    s.Navigation_Activate(7);
    check(!called('Main_addEventListener'), screen + ': About from the rail still returns through the rail');

    s = setup(screen);
    s.Main_HideUpdateDialog();
    check(called('Main_PreventClick', false), screen + ': closing the update dialog releases the key capture');
    check(!called('Main_addEventListener') && !called('Search_init') && !called('AddUser_init'), screen + ': closing the update dialog adds nothing');
});

// A grid screen keeps the existing behavior.
let s = setup('Main_Live');
s.Main_CheckStop();
check(called('Main_clearInterval', 'animate'), 'Live: stop clears the thumbnail animation');
check(called('Main_clearInterval', 'clock'), 'Live: stop runs to the end');

s = setup('Main_Live');
s.Main_CheckResume();
check(called('Main_SwitchScreen'), 'Live: resume on a focused grid still refreshes the screen');

s = setup('Main_Live');
s.Main_HideUpdateDialog();
check(called('init_fun'), 'Live: closing the update dialog re-inits the screen');

s = setup('Main_Live', {Main_isAboutDialogVisible: () => true});
s.Main_CheckDialogs();
check(called('Main_addEventListener', 'keydown') && called('Screens_addFocus'), 'Live: stop with About open restores the grid keys');

// History VOD and clip checks: stopped by Main_CheckStop, restarted on resume, run once when overdue.
const sixHours = 1000 * 60 * 360,
    workers = {Main_RunVODWorker: function Main_RunVODWorker() {}, Main_RunClipWorker: function Main_RunClipWorker() {}};
function scheduled(name, fun, delay) {
    return calls.some(call => call[0] === name && call[1] === fun && call[2] === delay);
}
s = setup('Main_Live', Object.assign({Main_RunVODWorkerLast: 0, Main_RunClipWorkerLast: 0}, workers));
s.Main_CheckResume();
check(scheduled('Main_setInterval', s.Main_RunVODWorker, sixHours), 'resume restarts the VOD history check');
check(scheduled('Main_setInterval', s.Main_RunClipWorker, sixHours + 1000 * 60 * 10), 'resume restarts the clip history check');
check(scheduled('Main_setTimeout', s.Main_RunVODWorker, 50000), 'resume runs an overdue VOD history check');
check(scheduled('Main_setTimeout', s.Main_RunClipWorker, 80000), 'resume runs an overdue clip history check');

const recent = Date.now() - 1000 * 60 * 60;
s = setup('Main_Live', Object.assign({Main_RunVODWorkerLast: recent, Main_RunClipWorkerLast: recent}, workers));
s.Main_CheckResume();
check(scheduled('Main_setInterval', s.Main_RunVODWorker, sixHours), 'resume restarts the VOD history check after a recent run');
check(
    !calls.some(call => call[0] === 'Main_setTimeout' && (call[1] === s.Main_RunVODWorker || call[1] === s.Main_RunClipWorker)),
    'resume does not repeat a recent run'
);

s = setup('Main_Live', {Main_RunVODWorkerResumeId: 'vodResume', Main_RunClipWorkerResumeId: 'clipResume'});
s.Main_CheckStop();
check(called('Main_clearTimeout', 'vodResume') && called('Main_clearTimeout', 'clipResume'), 'stop cancels the pending resume runs');

// A dialog or panel closing over Search or Add User: Main_SwitchScreen stays there instead of opening Live.
const keyHandlers = {
    Search_handleKeyDown: function Search_handleKeyDown() {},
    Search_KeyboardEvent: function Search_KeyboardEvent() {},
    AddUser_handleKeyDown: function AddUser_handleKeyDown() {},
    Main_CheckAccessibilityKey: function Main_CheckAccessibilityKey() {}
};
const shown = {Main_Search: 'search_scroll', Main_addUser: 'add_user_scroll'};
function onScreen(screen, extra) {
    return Object.assign({Main_isElementShowing: id => id === shown[screen]}, keyHandlers, extra || {});
}
function listened(name, fun) {
    return calls.some(call => call[0] === name && call[1] === 'keydown' && call[2] === fun);
}
function returned(screen, s) {
    if (screen === 'Main_Search') return called('Search_init') && !called('init_fun');
    return listened('Main_addEventListener', s.AddUser_handleKeyDown) && !called('AddUser_init') && !called('init_fun');
}
['Main_Search', 'Main_addUser'].forEach(screen => {
    s = setup(screen, onScreen(screen));
    s.Main_HideExitDialog();
    check(returned(screen, s), screen + ': closing the Exit dialog stays on the screen');

    s = setup(screen, onScreen(screen));
    s.Main_SwitchScreen();
    check(returned(screen, s), screen + ': closing a panel over the screen stays on it');

    // Back or the rail hide the screen before switching, as today that ends on Live (no loop back into Add User).
    s = setup(screen, keyHandlers);
    s.Main_SwitchScreen();
    check(
        called('init_fun') && !called('Search_init') && !listened('Main_addEventListener', s.AddUser_handleKeyDown),
        screen + ': after leaving it, Live as before'
    );
});
s = setup('Main_Live', keyHandlers);
s.Main_HideExitDialog();
check(called('init_fun'), 'Live: closing the Exit dialog still re-inits the screen');

// Accessibility warning on resume: no TypeError, the screen keys stop while it shows, closing it gives them back.
function removed(fun) {
    return calls.some(call => call[0] === 'Main_removeEventListener' && call[1] === 'keydown' && call[2] === fun);
}
['Main_Search', 'Main_addUser'].forEach(screen => {
    s = setup(screen, onScreen(screen, {Settings_Obj_default: () => true, OSInterface_isAccessibilitySettingsOn: () => true}));
    s.Main_CheckResume();
    check(called('Main_CheckAccessibilitySet'), screen + ': resume shows the accessibility warning');
    check(called('Settings_burn_in_protection_start'), screen + ': resume with the warning runs to the end');
    check(
        removed(s.Search_handleKeyDown) && removed(s.Search_KeyboardEvent) && removed(s.AddUser_handleKeyDown),
        screen + ': the screen keys stop while the warning shows'
    );
    check(
        calls.some(call => call[0] === 'Main_addEventListener' && call[2] === s.Main_CheckAccessibilityKey),
        screen + ': the warning takes the keys'
    );
    s = setup(screen, onScreen(screen));
    s.Main_CheckAccessibilityHide(true);
    check(returned(screen, s), screen + ': closing the warning stays on the screen');
});

s = setup('Main_Live', Object.assign({Settings_Obj_default: () => true, OSInterface_isAccessibilitySettingsOn: () => true}, keyHandlers));
s.Main_CheckResume();
check(
    calls.some(call => call[0] === 'Main_removeEventListener' && call[2] === s.ScreenObj[s.Main_Live].key_fun),
    'Live: the warning still removes the grid keys'
);

console.log(checks + ' background screen checks passed' + (built ? ' (built)' : ''));
