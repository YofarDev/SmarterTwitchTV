/* Grid switch row (VODs/highlights, sort, period): Right and Left move between the switches even when
 * the list has ended (#50). The switches have no DataObj cells, so the grid-edge guard for Right must
 * not apply to the switch row. Loads the real TVKeyValue.js and Screens.js key handlers. */
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

const focused = new Set();
let direct = 0;
Object.assign(s, {
    Main_addEventListener: () => {},
    Main_removeEventListener: () => {},
    Main_setTimeout: () => 1,
    Main_clearTimeout: () => {},
    Main_isScene1DocVisible: () => true,
    Sidepannel_isShowingUserLive: () => false,
    Sidepannel_isShowingMenus: () => false,
    Main_CantClick: () => false,
    Main_keyClickDelayStart: () => {},
    Settings_Obj_default: () => direct,
    Main_AddClass: id => focused.add(id),
    Main_RemoveClass: id => focused.delete(id),
    Screens_SyncCardFocus: () => {},
    Main_values: {Main_Go: 0},
    Settings_isVisible: () => false,
    Main_CounterDialog: () => {},
    Screens_ChangeFocusAnimationFinished: true
});

const key = 1;
s.ScreenObj = {};

function grid(posX, dataEnded) {
    focused.clear();
    s.ScreenObj[key] = {
        ids: ['g_'],
        posY: -1,
        posX: posX,
        posSub: s.Screens_SubBody,
        FirstRunEnd: true,
        HasSwitches: true,
        SwitchesIcons: ['movie-play', 'history'],
        ColumnsCount: 3,
        itemsCount: 2,
        dataEnded: dataEnded,
        Cells: [[]],
        DataObj: {'0_0': {}, '0_1': {}}
    };
    focused.add('g_-1_' + posX);
    return s.ScreenObj[key];
}

for (direct of [0, 1]) {
    const mode = direct ? 'direct: ' : 'legacy: ';
    for (const ended of [false, true]) {
        const what = mode + (ended ? 'ended list: ' : 'more to load: ');
        const obj = grid(0, ended);
        s.Screens_handleKeyDown(key, {keyCode: s.KEY_RIGHT});
        check(obj.posY === -1 && obj.posX === 1, what + 'Right moves to the next switch');
        check(focused.has('g_-1_1') && !focused.has('g_-1_0'), what + 'the next switch carries the focus ring');
    }
}

// Left on the second switch goes back through the grid's Left path (Direct acts on key-down).
direct = 1;
const back = grid(1, true);
s.Screens_handleKeyDown(key, {keyCode: s.KEY_LEFT});
check(back.posY === -1 && back.posX === 0, 'direct: Left moves back to the first switch');
check(focused.has('g_-1_0') && !focused.has('g_-1_1'), 'direct: the first switch carries the focus ring');

// The grid edge guard still holds on card rows: Right past the last card of an ended list stays put.
const edge = grid(1, true);
edge.posY = 0;
s.Screens_handleKeyDown(key, {keyCode: s.KEY_RIGHT});
check(edge.posY === 0 && edge.posX === 1, 'grid: Right past the last card of an ended list stays put');

console.log(checks + ' switch row checks passed');
