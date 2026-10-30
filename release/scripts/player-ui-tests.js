/* Execute production action descriptors through PlayerUI, with observable bridge/state stubs. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');
const source = fs.readFileSync(built ? 'release/githubio/js/main_uncompressed.js' : 'app/specific/PlayEtc.js', 'utf8');
const ast = UglifyJS.parse(source);
let maker;
ast.walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_Defun && node.name.name === 'Play_MakeControls') maker = node;
    })
);
const constants = source.slice(source.indexOf('var Play_controls ='), source.indexOf('function Play_MakeControls()'));
const assignments = maker.body.filter(
    node =>
        node instanceof UglifyJS.AST_SimpleStatement &&
        node.body instanceof UglifyJS.AST_Assign &&
        node.body.left.print_to_string().startsWith('Play_controls[')
);
const nodes = new Map(),
    effects = [],
    timers = new Map();
let clock = 0,
    serial = 0,
    checks = 0;
function element(id) {
    if (!nodes.has(id))
        nodes.set(id, {
            id,
            style: {},
            textContent: '',
            classList: {
                classes: new Set(),
                add(c) {
                    this.classes.add(c);
                },
                remove(c) {
                    this.classes.delete(c);
                }
            },
            setAttribute() {},
            removeAttribute() {},
            focus() {},
            querySelector() {
                return null;
            },
            querySelectorAll() {
                return [];
            }
        });
    return nodes.get(id);
}
const s = {
    console,
    Array,
    Math,
    Play_isOn: true,
    PlayVod_isOn: false,
    PlayClip_isOn: false,
    PlayExtra_PicturePicture: false,
    Play_MultiEnable: false,
    Play_isFullScreen: true,
    Play_Multi_MainBig: false,
    Play_ChatEnable: false,
    Play_LowLatency: 0,
    Play_ChatDelayValue: 0,
    Play_ChatPositions: 0,
    Play_ChatSizeValue: 0,
    Play_ChatFullScreenObj: {},
    Play_Status_Visible: 0,
    Main_values: {ChatBackground: 0, Play_ChatForceDisable: false},
    Settings_value: {
        content_lang: {values: ['All', 'English'], defaultValue: 0},
        disabled_shared: {defaultValue: 0},
        show_feed_player: {defaultValue: 0},
        preview_sizes: {defaultValue: 0},
        preview_volume_new: {defaultValue: 0},
        preview_others_volume_new: {defaultValue: 0}
    },
    Main_getElementById: element,
    Main_ShowElement: id => effects.push('show:' + id),
    Main_HideElement: id => effects.push('hide:' + id),
    Main_AddClass: (id, cls) => element(id).classList.add(cls),
    Main_RemoveClass: (id, cls) => element(id).classList.remove(cls),
    Main_addEventListener() {},
    Main_removeEventListener() {},
    Main_isScene2DocVisible: () => true,
    Main_textContent: (id, value) => {
        element(id).textContent = value;
    },
    Main_textContentWithEle: (el, value) => {
        if (el) el.textContent = value;
    },
    Main_setItem: (key, value) => effects.push(['store', key, value]),
    Main_SaveValuesWithTimeout: () => effects.push('save'),
    Main_setTimeout: (fn, delay) => {
        const id = ++serial;
        timers.set(id, {fn, due: clock + delay});
        return id;
    },
    Main_clearTimeout: id => timers.delete(id),
    Play_isEndDialogVisible: () => false,
    Play_StayDialogVisible: () => false,
    Play_isChatShown: () => s.Play_ChatEnable,
    Play_showChat: () => {
        s.Play_ChatEnable = true;
        effects.push('chat:on');
    },
    Play_hideChat: () => {
        s.Play_ChatEnable = false;
        effects.push('chat:off');
    },
    Play_clearHidePanel() {},
    Play_hidePanelFull: mode => effects.push(['hidePanel', mode]),
    OSInterface_setPlaybackSpeed: value => effects.push(['speed', value]),
    Play_ResetSpeed: () => effects.push('speed:reset'),
    Play_ChatPosition: () => effects.push('chatpos'),
    PhoneChat_Show: () => effects.push('phone:show'),
    Play_ResetLowlatency() {},
    PlayVod_ChaptersArray: [],
    Play_HasLive: false,
    PlayClip_HasVOD: false,
    Play_MultiArray: [{data: ['a']}, {data: ['b']}, {data: []}, {data: []}],
    Play_CurrentSpeed: 3,
    Play_FullScreenPosition: 0,
    Play_FullScreenSize: 0,
    Play_ChatFontSize: 0,
    STR_CHAT_BASE_ARRAY: ['right'],
    STR_CHAT_100_ARRAY: ['full'],
    STR_CHAT_SIDE_ARRAY: ['side'],
    Play_PreviewEnable: 0,
    Play_volumes: [100, 50, 100, 100],
    Play_audio_enable: [1, 1, 0, 0],
    Settings_GetVolumes: () => [0, 25, 50, 75, 100],
    Settings_Obj_default: () => 0,
    Main_IsOn_OSInterface: true,
    Main_A_includes_B: (a, b) => String(a).includes(b),
    Play_data: {
        quality: 'Auto',
        qualityPlaying: 'Auto',
        qualityIndex: 1,
        qualities: [
            {id: 'Auto', position: -1},
            {id: '720p', position: 2}
        ]
    },
    Play_data_base: {},
    Play_getQualitiesCount: () => s.Play_data.qualities.length,
    PlayVod_qualities: [{id: 'Auto', position: -1}],
    PlayVod_getQualitiesCount: () => s.PlayVod_qualities.length,
    PlayVod_qualityPlaying: 'Auto',
    PlayVod_qualityIndex: 0,
    PlayClip_qualities: [{id: 'Auto', position: -1}],
    PlayClip_getQualitiesCount: () => s.PlayClip_qualities.length,
    PlayClip_qualityPlaying: 'Auto',
    PlayClip_qualityIndex: 0,
    Play_SetPlayQuality: id => {
        s.Play_data.quality = id;
        effects.push(['select', id]);
    },
    Play_SetHtmlQuality() {},
    Play_info_quality: {},
    OSInterface_SetQuality: position => effects.push(['quality', position]),
    OSInterface_RestartPlayer: (...args) => effects.push(['restart', ...args]),
    Play_qualityIndexReset: () => effects.push('quality:reset'),
    Play_ResetPanel: mode => effects.push(['resetPanel', mode]),
    UIFocus_DomRelease: () => false,
    Play_BottonIcons_Pause: null,
    UIFocus_Suspend() {},
    UIFocus_Stack: [],
    UIFocus_Push: owner => {
        if (!owner || !owner.id || typeof owner.handle !== 'function') return false;
        s.UIFocus_Stack.push(owner);
        return true;
    },
    UIFocus_Pop: () => {
        const owner = s.UIFocus_Stack.pop();
        if (!owner) return null;
        if (owner.cleanup) owner.cleanup();
        return owner;
    },
    Play_ForceShowPannel() {},
    KEY_ENTER: 13,
    KEY_LEFT: 37,
    KEY_UP: 38,
    KEY_RIGHT: 39,
    KEY_DOWN: 40,
    KEY_RETURN: 27,
    KEY_KEYBOARD_BACKSPACE: 8
};
// Labels are fixtures; production descriptors, callbacks, indexes and adapter behavior are not copied.
for (const name of new Set(source.match(/\bSTR_[A-Z_0-9]+\b/g))) if (!(name in s)) s[name] = name;
vm.createContext(s);
vm.runInContext(constants, s);
// Provide only initialization dependencies used by object literals (not callback dependencies).
for (const statement of assignments) {
    const initializers = [];
    statement.body.right.walk(
        new UglifyJS.TreeWalker(function (node) {
            if (node instanceof UglifyJS.AST_Function) return true;
            if (node instanceof UglifyJS.AST_SymbolRef && !(node.name in s)) initializers.push(node.name);
        })
    );
    for (const name of initializers) s[name] = 0;
    vm.runInContext(statement.print_to_string(), s);
}
if (built) {
    const definitions = [];
    ast.walk(
        new UglifyJS.TreeWalker(node => {
            if (node instanceof UglifyJS.AST_Defun && /^PlayerUI_/.test(node.name.name)) definitions.push(node.print_to_string());
            if (node instanceof UglifyJS.AST_Var) {
                const matches = node.definitions.filter(def => /^PlayerUI_/.test(def.name.name));
                if (matches.length) definitions.push(new UglifyJS.AST_Var({definitions: matches}).print_to_string());
            }
        })
    );
    vm.runInContext(definitions.join('\n'), s);
} else vm.runInContext(fs.readFileSync('app/specific/PlayerUI.js', 'utf8'), s);
function check(value, label) {
    assert.ok(value, label);
    checks++;
}
check(Object.keys(s.Play_controls).length === 48, 'all production control declarations loaded');
const mapped = new Set(Object.values(s.PlayerUI_Groups()).flat());
for (const key of Object.keys(s.Play_controls))
    check(
        mapped.has(Number(key)) || [s.Play_controlsBack, s.Play_controlsAudio, s.Play_controlsPreview].includes(Number(key)),
        'every action has a destination: ' + key
    );
for (const key of Object.keys(s.Play_controls)) {
    const control = s.Play_controls[key];
    control.position = Number(key);
    control.doc = element('control-' + key);
    control.doc_title = element('title-' + key);
    control.doc_name = element('value-' + key);
    control.button_text = element('text-' + key);
    control.bottomArrows = () => {};
}
s.PlayerUI_Render = () => effects.push('render');
s.PlayerUI_State.mode = 1;
s.PlayerUI_State.frames = [{group: 'playback', index: 0, entries: [s.Play_controlsSpeed]}];
check(s.PlayerUI_Action(s.Play_controlsSpeed, 1), 'speed adjustment accepted');
check(s.Play_controls[s.Play_controlsSpeed].defaultValue === 4, 'real speed descriptor selects pending value');
s.PlayerUI_Action(s.Play_controlsSpeed, 0);
check(
    effects.some(x => Array.isArray(x) && x[0] === 'speed' && x[1] === 1.05),
    'production callback sets actual playback speed'
);
s.PlayerUI_State.frames = [{group: 'chat', index: 0, entries: [s.Play_controlsChat, s.Play_controlsPhoneChat]}];
s.PlayerUI_Action(s.Play_controlsChat, 0);
check(s.Play_ChatEnable && effects.includes('chat:on'), 'real chat toggle side effect');
check(
    effects.some(x => Array.isArray(x) && x[0] === 'store' && x[1] === 'ChatEnable' && x[2] === 'true'),
    'chat preference preserved'
);
s.PlayerUI_Action(s.Play_controlsPhoneChat, 0);
check(effects.includes('phone:show'), 'existing pairing lifecycle invoked');
s.PlayerUI_State.mode = 2;
check(!s.PlayerUI_Action(s.Play_controlsPhoneChat, 0), 'phone action rechecks VOD availability at execution');
s.PlayerUI_State.mode = 1;
s.PlayerUI_State.frames = [{group: 'quality', index: 0, entries: [s.Play_controlsQuality]}];
s.PlayerUI_Action(s.Play_controlsQuality, 0);
check(
    effects.some(x => Array.isArray(x) && x[0] === 'quality' && x[1] === 2),
    'quality commits actual bridge position'
);
/* Quality drawer list: one row per rendition; picking the playing one must not restart. */
s.Play_data.qualities = [
    {id: 'Auto', position: -1},
    {id: '720p', position: 2},
    {id: '480p', position: 4}
];
s.Play_data.qualityPlaying = 'Auto';
s.Play_data.qualityIndex = 0;
s.PlayerUI_State.mode = 1;
s.PlayerUI_State.frames = [
    {group: 'bar', index: 2},
    {group: 'quality', index: 0, entries: ['q:Auto', 'q:720p', 'q:480p'], list: true}
];
const commitEffects = () => effects.filter(x => Array.isArray(x) && (x[0] === 'quality' || x[0] === 'restart' || x[0] === 'select')).length;
const commitsBefore = commitEffects();
s.PlayerUI_Handle({keyCode: s.KEY_ENTER}, false);
check(commitEffects() === commitsBefore, 'picking the playing rendition changes nothing');
check(!effects.some(x => Array.isArray(x) && x[0] === 'restart'), 'playing rendition pick never restarts the stream');
check(s.PlayerUI_State.frames.length === 1 && s.PlayerUI_State.frames[0].group === 'bar', 'playing rendition pick returns to the bar');
s.PlayerUI_State.frames = [
    {group: 'bar', index: 2},
    {group: 'quality', index: 1, entries: ['q:Auto', 'q:720p', 'q:480p'], list: true}
];
s.PlayerUI_Handle({keyCode: s.KEY_ENTER}, false);
check(commitEffects() === commitsBefore + 2, 'picking another rendition commits exactly once');
check(s.Play_data.qualityIndex === 1, 'picked rendition index stored');
check(s.PlayerUI_State.frames.length === 1 && s.PlayerUI_State.frames[0].group === 'bar', 'applied pick returns to the bar');
/* A hole in the mode's qualities array must not shift the stored index of the picked rendition. */
s.Play_data.qualities = [{id: 'Auto', position: -1}, null, {id: '720p', position: 2}];
s.Play_data.qualityPlaying = 'Auto';
s.Play_data.qualityIndex = 0;
const holeList = s.PlayerUI_QualityList();
check(holeList.items.length === 2 && holeList.indexes[1] === 2, "list keeps each rendition's array index");
s.PlayerUI_State.frames = [
    {group: 'bar', index: 2},
    {group: 'quality', index: 1, entries: ['q:Auto', 'q:720p'], list: true}
];
s.PlayerUI_Handle({keyCode: s.KEY_ENTER}, false);
check(s.Play_data.qualityIndex === 2, 'picked rendition stores its own array index');
s.Play_data.qualities = [
    {id: 'Auto', position: -1},
    {id: '720p', position: 2},
    {id: '480p', position: 4}
];
/* Spinner rows: Left/Right adjust values through the production updown. */
s.PlayerUI_State.frames = [{group: 'chatSettings', index: 0, entries: [s.Play_controlsChatPos]}];
s.Play_ChatEnable = true;
s.Play_ChatPositions = 0;
s.Play_controls[s.Play_controlsChatPos].defaultValue = 0;
s.PlayerUI_Action(s.Play_controlsChatPos, 1);
check(s.Play_ChatPositions === 1 && effects.includes('chatpos'), 'chat position adjusts with the right key');
s.PlayerUI_Action(s.Play_controlsChatPos, -1);
check(s.Play_ChatPositions === 0, 'chat position adjusts back with the left key');
/* Drawer orientation helpers: per-drawer help line and full cleanup of drawer state. */
s.STR_UI = {playerHelp: 'adjust', playerHelpMenu: 'menu', playerHelpList: 'list', playerHelpAction: 'action'};
check(s.PlayerUI_HelpText({group: 'more'}) === 'menu', 'More menu shows the open help line');
check(s.PlayerUI_HelpText({group: 'quality', list: true}) === 'list', 'quality list shows the select help line');
check(
    s.PlayerUI_HelpText({group: 'playback', index: 0, entries: [s.Play_controlsSpeed]}) === 'adjust',
    'rows with a value range keep the adjust help line'
);
check(s.PlayerUI_HelpText({group: 'playback', index: 0, entries: [s.Play_controlsScreeOff]}) === 'action', 'action rows do not advertise Left/Right');
/* Paused state: every main-player start clears it; the chip is hidden either way. */
s.PlayerUI_State.paused = true;
s.PlayerUI_State.frames = [];
s.PlayerUI_ResetPaused();
check(!s.PlayerUI_State.paused && effects.includes('hide:player-ui-paused'), 'paused state and chip reset on a new playback');
s.document = {activeElement: null, body: {}};
s.PlayerUI_State.frames = [];
s.PlayerUI_Show(1);
element('player-ui').classList.add('player-ui-drawer-open');
element('scene2').classList.add('player-ui-drawer-open');
s.UIFocus_Pop(false);
check(
    !element('player-ui').classList.classes.has('player-ui-drawer-open') && !element('scene2').classList.classes.has('player-ui-drawer-open'),
    'owner cleanup drops the drawer-open state'
);
s.PlayerUI_State.frames = [{group: 'bar', index: 0}];
s.Play_MultiEnable = true;
check(!s.PlayerUI_Available(s.Play_controlsQuality, 'quality'), 'single-stream quality absent in multistream');
check(s.PlayerUI_Available(s.Play_controlsQualityMulti, 'quality'), 'multistream restart remains reachable');
check(s.PlayerUI_Available(s.Play_controlsAudioVol1, 'audio'), 'populated second slot audio visible');
check(!s.PlayerUI_Available(s.Play_controlsAudioVol2, 'audio'), 'empty third slot audio hidden');
s.Play_MultiEnable = false;
s.PlayExtra_PicturePicture = true;
check(s.PlayerUI_Available(s.Play_controlsQualityMini, 'quality'), 'PiP quality/restart remains reachable');
s.PlayExtra_PicturePicture = false;
s.PlayerUI_State.frames = [{group: 'bar', index: 0}];
s.PlayerUI_ScheduleHide();
check(timers.size === 1, 'one bar hide timer');
s.PlayerUI_State.frames.push({group: 'chat', index: 1, entries: [s.Play_controlsPhoneChat]});
s.PlayerUI_ScheduleHide();
check(timers.size === 0, 'drawer suspends hide timer');
s.PlayerUI_SuspendPhone();
check(s.PlayerUI_State.suspended, 'pairing suspends owner');
s.PlayerUI_ResumePhone(false);
check(!s.PlayerUI_State.suspended && s.PlayerUI_State.frames.length === 2, 'pairing restores drawer and row');
check(timers.size === 0, 'pairing return does not hide active drawer');
s.PlayerUI_State.frames = [{group: 'bar', index: 2}];
s.PlayerUI_ScheduleHide();
clock += 5000;
for (const timer of [...timers.values()]) if (timer.due <= clock) timer.fn();
check(
    effects.some(x => Array.isArray(x) && x[0] === 'hidePanel' && x[1] === 1),
    'bar timeout delegates existing hide policy'
);
/* Timeline focus, then Back: the hide path resets focus to the buttons after hiding the panel, which must not
 * reopen the bar over the hidden panel (no timeline). Production focus bridge from PlayEtc. */
for (const name of ['Play_BottomIconsFocus', 'Play_BottonIconsResetFocus'])
    ast.walk(
        new UglifyJS.TreeWalker(node => {
            if (node instanceof UglifyJS.AST_Defun && node.name.name === name) vm.runInContext(node.print_to_string(), s);
        })
    );
let panelShowing = false;
s.Play_isPanelShowing = () => (panelShowing ? 1 : 0);
s.PlayerUI_State.frames = [];
s.PlayerUI_State.suspended = false;
s.PlayVod_PanelY = 0;
s.Play_BottonIconsResetFocus(true);
check(s.PlayVod_PanelY === 1 && s.PlayerUI_State.frames.length === 0, 'focus reset after hiding the panel leaves the bar closed');
panelShowing = true;
s.PlayVod_PanelY = 0;
s.Play_BottonIconsResetFocus(true);
check(s.PlayerUI_State.frames.length === 1, 'focus back to the buttons over a shown panel opens the bar');
s.UIFocus_Pop(false);
console.log(checks + ' production player action checks passed');
