/* Followed live side panel keys: Back returns to the rail like Right, the 3 shortcut closes to the grid,
 * Settings, About and Controls also work over Search and Add User (no ScreenObj).
 * Runs the production functions below; every other call is a recording stub. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');
const source = built
    ? fs.readFileSync('release/githubio/js/main_uncompressed.js', 'utf8')
    : fs.readFileSync('app/specific/Sidepannel.js', 'utf8') + ';' + fs.readFileSync('app/specific/Main.js', 'utf8');
const wanted = ['Sidepannel_handleKeyDown', 'Sidepannel_userLiveKeyRight', 'Sidepannel_StartMain', 'Sidepannel_ShowUtility', 'Main_showSettings'];
const definitions = {};
UglifyJS.parse(source).walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_Defun && wanted.indexOf(node.name.name) !== -1) definitions[node.name.name] = node.print_to_string();
    })
);
wanted.forEach(name => assert(definitions[name], (built ? 'Rebuild first: ' : '') + name + ' not found'));
const code = wanted.map(name => definitions[name]).join('\n');

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
function setup() {
    calls = [];
    const s = {console};
    callees.forEach(name => {
        s[name] = function () {
            calls.push([name].concat(Array.prototype.slice.call(arguments)));
        };
    });
    globals.forEach(name => {
        if (!(name in s)) s[name] = undefined;
    });
    vm.createContext(s);
    vm.runInContext(fs.readFileSync('app/general/TVKeyValue.js', 'utf8'), s);
    vm.runInContext(code, s);
    Object.assign(s, {
        Sidepannel_IsMain: false,
        Sidepannel_Callback: function screenKeys() {},
        Main_values: {Main_Go: 1},
        ScreenObj: {1: {key_controls: function gridControls() {}}},
        Main_showAboutDialog: function () {
            calls.push(['Main_showAboutDialog'].concat(Array.prototype.slice.call(arguments)));
        },
        Main_showControlsDialog: function () {
            calls.push(['Main_showControlsDialog'].concat(Array.prototype.slice.call(arguments)));
        },
        UserLiveFeed_loadingData: [],
        UserLiveFeedobj_UserLivePos: 0
    });
    return s;
}
function called(name, arg) {
    return calls.some(call => call[0] === name && (arguments.length < 2 || call[1] === arg));
}
function check(condition, message) {
    assert(condition, message);
    checks++;
}

['KEY_RETURN', 'KEY_KEYBOARD_BACKSPACE', 'KEY_RIGHT'].forEach(name => {
    const s = setup();
    s.Sidepannel_handleKeyDown({keyCode: s[name]});
    check(called('Navigation_Open', s.Sidepannel_Callback), name + ' returns to the rail with the screen keys');
    check(called('Main_removeEventListener', 'keydown') && !called('Main_SwitchScreen'), name + ' leaves the panel without switching screen');
    check(s.Sidepannel_IsMain === true, name + ': Left on the grid opens the rail again');
});

const s = setup();
s.Sidepannel_handleKeyDown({keyCode: s.KEY_3});
check(called('Sidepannel_Hide') && called('Main_SwitchScreen') && !called('Navigation_Open'), 'the 3 shortcut closes the panel to the grid');
check(s.Sidepannel_IsMain === true, 'after the 3 shortcut, Left on the grid opens the rail again');

// Settings from the panel exits the screen like the rail Settings entry, so Search and Add User are left too
['KEY_6', 'KEY_PAUSE'].forEach(name => {
    const p = setup();
    p.Main_values.Main_Go = 0; // Search: no ScreenObj
    p.Sidepannel_handleKeyDown({keyCode: p[name]});
    check(called('Navigation_ExitCurrent') && !called('Main_ExitCurrent'), name + ': Settings exits the screen like the rail Settings entry');
    check(called('Settings_init') && called('Sidepannel_Hide'), name + ': Settings opens and the panel hides');
});

// About and Controls: a screen with a ScreenObj keeps its dialog controls, Search and Add User go back to the rail
[
    ['KEY_7', 'Main_showAboutDialog', 7],
    ['KEY_8', 'Main_showControlsDialog', 8]
].forEach(([name, dialog, railIndex]) => {
    const grid = setup();
    grid.Sidepannel_handleKeyDown({keyCode: grid[name]});
    check(
        calls.some(call => call[0] === dialog && call[1] === grid.Sidepannel_Callback && call[2] === grid.ScreenObj[1].key_controls),
        name + ' on a grid: the dialog closes with the screen controls'
    );
    check(
        grid.Navigation_Callback === undefined && !called('Navigation_Activate') && called('Sidepannel_Hide'),
        name + ' on a grid: the rail is not involved'
    );

    const search = setup();
    search.Main_values.Main_Go = 0;
    search.Sidepannel_handleKeyDown({keyCode: search[name]});
    check(
        called('Navigation_Activate', railIndex) && !called(dialog),
        name + ' on Search: the rail entry opens the dialog, so it closes back to the rail'
    );
    check(search.Navigation_Callback === search.Sidepannel_Callback, name + ' on Search: the rail returns with the Search keys');
    check(called('Sidepannel_Hide'), name + ' on Search: the panel hides');
});

console.log(checks + ' side panel checks passed' + (built ? ' (built)' : ''));
