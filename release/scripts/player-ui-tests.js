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
    Main_AddClassWithEle: (ele, cls) => ele.classList.add(cls),
    Main_RemoveClassWithEle: (ele, cls) => ele.classList.remove(cls),
    Play_info_div: element('playerinfo'),
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
    Play_LiveSeekBarHidden: () => false,
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
/* Up from the bar focuses the timeline, which hides the stream info; Down goes straight back to the bar through the
 * Play_handleKeyDown shortcut, and the info must come back with it. Production focus/key functions from PlayEtc. */
for (const name of ['Play_BottomIconsFocus', 'Play_BottonIconsHide', 'Play_handleKeyDown'])
    ast.walk(
        new UglifyJS.TreeWalker(node => {
            if (node instanceof UglifyJS.AST_Defun && node.name.name === name) vm.runInContext(node.print_to_string(), s);
        })
    );
Object.assign(s, {
    Main_HideElementWithEle() {},
    Play_BottomIconsFocusClear() {},
    Play_IconsRemoveFocus() {},
    Play_isPanelShowing: () => 1,
    UserLiveFeed_isPreviewShowing: () => false,
    Play_pause_next_div: element('pause_next_div'),
    Play_Controls_Holder: element('controls_holder'),
    Play_BottonIcons_Progress: element('progress_bar_div'),
    Play_BottonIcons_Progress_Steps: element('progress_bar_steps'),
    Play_side_info_div: element('playsideinfo'),
    Play_BottonIcons_Focus_Class: 'progress_bar_div_focus',
    Play_Status_Visible: 2,
    PlayClip_EnterPos: 0,
    PlayVod_addToJump: 0
});
const info = s.Play_info_div.classList.classes;
s.PlayerUI_State.frames = [];
s.PlayerUI_Show(1);
s.PlayerUI_Handle({keyCode: s.KEY_UP}, false);
check(info.has('opacity_zero') && s.PlayerUI_State.frames.length === 0, 'Up from the bar focuses the timeline and hides the stream info');
s.Play_handleKeyDown({keyCode: s.KEY_DOWN});
check(!info.has('opacity_zero') && s.PlayerUI_State.frames.length === 1, 'Down from the timeline reopens the bar with the stream info');
s.UIFocus_Pop(false);
/* Auto quality caption: the native report names the playing rendition, matched to the stream's own list entry. */
s.STR_UI = {quality: 'Quality', separator: ' · ', qualityAutoPlaying: '{quality} ({playing})'};
s.Play_data.qualities = [
    {id: 'Auto', position: -1},
    {id: '1080p60 | source', position: 0},
    {id: '720p60', position: 1}
];
s.Play_data.qualityPlaying = 'Auto';
s.PlayerUI_State.mode = 1;
s.PlayerUI_State.frames = [{group: 'bar', index: 0}];
s.PlayerUI_State.autoQuality = '';
s.PlayerUI_QualityCaption();
check(element('player-ui-name').textContent === 'Quality · Auto', 'Auto caption before the player reports');
s.PlayerUI_SetAutoQuality(0, '1080p60 | Auto | 8.99Mbps | AVC');
check(element('player-ui-name').textContent === 'Quality · Auto (1080p60 | source)', 'Auto caption names the playing list entry');
s.PlayerUI_SetAutoQuality(0, '720p60 | Auto | 3.42Mbps | AVC');
check(element('player-ui-name').textContent === 'Quality · Auto (720p60)', 'Auto caption follows a rendition switch');
s.PlayerUI_SetAutoQuality(0, '936p60 | Auto | 5.00Mbps | AVC');
check(element('player-ui-name').textContent === 'Quality · Auto (936p60)', 'unlisted rendition keeps the native resolution');
s.Play_data.qualityPlaying = '720p60';
s.PlayerUI_QualityCaption();
check(element('player-ui-name').textContent === 'Quality · 720p60', 'a fixed quality shows as selected');
s.PlayVod_qualities = [
    {id: 'Auto', position: -1},
    {id: '1080p60 | source', position: 0}
];
s.PlayVod_qualityPlaying = 'Auto';
s.PlayerUI_State.mode = 2;
s.PlayerUI_SetAutoQuality(1, '1080p60 | Auto | 6.00Mbps | AVC');
check(element('player-ui-name').textContent === 'Quality · Auto (1080p60 | source)', 'VOD Auto caption uses the VOD list');
s.PlayerUI_State.frames = [];
element('player-ui-name').textContent = '';
s.PlayerUI_SetAutoQuality(1, '720p60 | Auto | 3.00Mbps | AVC');
check(element('player-ui-name').textContent === '' && s.PlayerUI_State.autoQuality === '720p60', 'closed bar only stores the report');
/* Menu auto-hide: the delay comes from the setting, Never arms nothing, and the idle close is visible with Debug logs. */
// Settings_Obj_default is 0-based at runtime: menu_auto_hide 0/1/2 = 5 seconds/15 seconds/Never, debug_logs 0/1 = no/yes.
const priorPlayIsOn = s.Play_isOn;
s.Play_isOn = true;
// The notice goes through the player's dialog: Main_showWarningDialog sits in scene1, hidden under the player.
s.Main_showWarningDialog = text => effects.push(['hidden-toast', text]);
s.Play_showWarningDialog = text => effects.push(['toast', text]);
// Debug log lines go to the console, which the WebView passes to logcat for the Debug logs server.
const priorConsole = s.console,
    logs = [];
s.console = {log: text => logs.push(text)};
s.STR_MENU_AUTO_HIDE_TOAST = 'toast:menu-auto-hide';
s.PlayerUI_State.mode = 1;
s.PlayerUI_State.suspended = false;
s.PlayerUI_State.frames = [{group: 'bar', index: 0}];
timers.clear();
s.Settings_Obj_default = key => ({menu_auto_hide: 0, debug_logs: 0})[key] || 0;
s.PlayerUI_ScheduleHide();
check(timers.size === 1 && [...timers.values()][0].due === clock + 5000, 'default keeps the historical 5 second auto-hide');
s.Settings_Obj_default = key => ({menu_auto_hide: 1, debug_logs: 0})[key] || 0;
timers.clear();
s.PlayerUI_ScheduleHide();
check(timers.size === 1 && [...timers.values()][0].due === clock + 15000, 'second choice waits 15 seconds');
s.Settings_Obj_default = key => ({menu_auto_hide: 2, debug_logs: 0})[key] || 0;
timers.clear();
s.PlayerUI_ScheduleHide();
check(timers.size === 0, 'Never arms no auto-hide');
s.Settings_Obj_default = key => ({menu_auto_hide: 0, debug_logs: 1})[key] || 0;
timers.clear();
s.PlayerUI_ScheduleHide();
[...timers.values()][0].fn();
check(
    effects.some(x => Array.isArray(x) && x[0] === 'toast' && x[1] === 'toast:menu-auto-hide'),
    'idle close announces itself with Debug logs on'
);
check(effects.some(x => Array.isArray(x) && x[0] === 'hidePanel' && x[1] === 1), 'idle close hides the live panel');
check(logs.includes('PlayerUI: menu auto-hide fired'), 'idle close is logged with Debug logs on');
s.PlayerUI_State.frames = [{group: 'bar', index: 0}];
const toastsBefore = effects.filter(x => Array.isArray(x) && x[0] === 'toast').length,
    idleLogsBefore = logs.length;
s.Settings_Obj_default = key => ({menu_auto_hide: 0, debug_logs: 0})[key] || 0;
timers.clear();
s.PlayerUI_ScheduleHide();
[...timers.values()][0].fn();
check(effects.filter(x => Array.isArray(x) && x[0] === 'toast').length === toastsBefore, 'no notice without Debug logs');
check(logs.length === idleLogsBefore, 'no idle close log without Debug logs');
check(!effects.some(x => Array.isArray(x) && x[0] === 'hidden-toast'), 'no notice goes to the dialog hidden under the player');
/* A key the menu does not handle closes it and leaves the stream panel up; with Debug logs on, the notice names its key code. */
s.STR_MENU_KEY_CLOSE_TOAST = 'toast:key %x';
s.Settings_Obj_default = key => ({menu_auto_hide: 2, debug_logs: 1})[key] || 0;
s.PlayerUI_State.frames = [];
s.PlayerUI_Show(1);
const panelHides = effects.filter(x => Array.isArray(x) && x[0] === 'hidePanel').length;
// 179 is play/pause, a media key the menu leaves to the playback handler.
check(s.PlayerUI_Handle({keyCode: 179}, false) === false, 'an unknown key passes on to the playback handler');
check(s.PlayerUI_State.frames.length === 0, 'an unknown key closes the menu');
check(effects.filter(x => Array.isArray(x) && x[0] === 'hidePanel').length === panelHides, 'an unknown key leaves the stream panel up');
check(
    effects.some(x => Array.isArray(x) && x[0] === 'toast' && x[1] === 'toast:key 179'),
    'the key code close announces itself with Debug logs on'
);
const keyLog = logs.indexOf('PlayerUI: menu closed by keyCode 179');
check(keyLog !== -1 && logs.indexOf('PlayerUI: menu closed') > keyLog, 'the key code close is logged, then the close itself');
s.Settings_Obj_default = key => ({menu_auto_hide: 2, debug_logs: 0})[key] || 0;
s.PlayerUI_Show(1);
const keyToastsBefore = effects.filter(x => Array.isArray(x) && x[0] === 'toast').length,
    keyLogsBefore = logs.length;
s.PlayerUI_Handle({keyCode: 179}, false);
check(effects.filter(x => Array.isArray(x) && x[0] === 'toast').length === keyToastsBefore, 'no key code notice without Debug logs');
check(logs.length === keyLogsBefore, 'no close logs without Debug logs');
/* keyCode 0 is an Android key the WebView cannot map; some TVs send one alongside real presses (#3). The menu ignores it. */
s.Settings_Obj_default = key => ({menu_auto_hide: 0, debug_logs: 1})[key] || 0;
timers.clear();
s.PlayerUI_State.frames = [];
s.PlayerUI_Show(1);
// PlayerUI_Render is a stub here, so give the bar its six buttons.
s.PlayerUI_Frame().entries = [0, 1, 2, 3, 4, 5];
s.PlayerUI_Handle({keyCode: s.KEY_RIGHT}, false);
const zeroIndex = s.PlayerUI_Frame().index,
    zeroTimer = s.PlayerUI_State.hiddenTimer,
    zeroToasts = effects.filter(x => Array.isArray(x) && x[0] === 'toast').length,
    zeroLogs = logs.length;
check(s.PlayerUI_Handle({keyCode: 0}, false) === true, 'keyCode 0 is consumed, the playback handler never sees it');
check(s.PlayerUI_State.frames.length === 1 && s.PlayerUI_Frame().index === zeroIndex, 'keyCode 0 keeps the menu open on the same button');
check(s.PlayerUI_State.hiddenTimer === zeroTimer && timers.has(zeroTimer), 'keyCode 0 leaves the auto-hide timer as it was');
check(
    effects.filter(x => Array.isArray(x) && x[0] === 'toast').length === zeroToasts && logs.length === zeroLogs,
    'keyCode 0 shows no notice and writes no log line'
);
s.PlayerUI_Open('chat');
s.PlayerUI_Frame().entries = [s.Play_controlsChat];
check(s.PlayerUI_Handle({keyCode: 0}, false) === true && s.PlayerUI_State.frames.length === 2, 'keyCode 0 keeps an open drawer open');
for (const reset of ['Play_qualityReset', 'Play_ResetSpeed', 'Play_ResetLowlatency']) if (!s[reset]) s[reset] = () => {};
s.PlayerUI_Handle({keyCode: s.KEY_RETURN}, false);
check(s.PlayerUI_State.frames.length === 1, 'back after keyCode 0 still closes just the drawer');
/* A close that skips PlayerUI_Close (the focus stack cleared on a screen change) is logged too. */
s.Settings_Obj_default = key => ({menu_auto_hide: 2, debug_logs: 1})[key] || 0;
s.PlayerUI_Show(1);
const popLogsBefore = logs.length;
s.UIFocus_Pop(false);
check(
    s.PlayerUI_State.frames.length === 0 && logs.length === popLogsBefore + 1 && logs[popLogsBefore] === 'PlayerUI: menu closed',
    'a close outside PlayerUI_Close is logged'
);
s.console = priorConsole;
s.Play_isOn = priorPlayIsOn;
console.log(checks + ' production player action checks passed');
