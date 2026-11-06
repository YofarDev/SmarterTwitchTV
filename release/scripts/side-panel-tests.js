/* Followed live side panel keys: Back returns to the rail like Right, the 3 shortcut closes to the grid.
 * Runs the production functions below; every other call is a recording stub. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');
const source = built ? fs.readFileSync('release/githubio/js/main_uncompressed.js', 'utf8') : fs.readFileSync('app/specific/Sidepannel.js', 'utf8');
const wanted = ['Sidepannel_handleKeyDown', 'Sidepannel_userLiveKeyRight', 'Sidepannel_StartMain'];
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

console.log(checks + ' side panel checks passed' + (built ? ' (built)' : ''));
