/* Settings dialog scrolling (Chat options): the real Settings_ScrollConatiner against mock rows of mixed height.
 * Also the Settings_value labels as built at load time, and the Menu auto-hide delay for each option. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}

const source = fs.readFileSync('app/specific/Settings.js', 'utf8');
const start = source.indexOf('var Settings_DialogScrollY = 0;');
const end = source.indexOf('\n}\n', source.indexOf('function Settings_ScrollConatiner(')) + 2;
assert.ok(start !== -1 && end > start, 'Settings_ScrollConatiner found');

//Rows like the Chat options dialog: plain options 36px, options with a summary 78px or 101px
const heights = [101, 78, 36, 78, 36, 101, 36, 78, 78, 78, 36, 36, 36, 36, 36, 36, 36, 36, 36, 101, 78, 36, 36, 36, 36, 36, 36];
const view = 940,
    padding = 8,
    outline = {outlineWidth: '4px', outlineOffset: '2.0625px'};

function sandbox() {
    const list = {style: {transform: ''}, parentNode: {clientHeight: view}},
        rows = {},
        keys = [];
    let y = padding;
    heights.forEach((h, i) => {
        const top = y;
        keys.push('opt' + i);
        rows['opt' + i + '_div'] = {offsetHeight: h, getBoundingClientRect: () => ({top: top - scrollY(list)})};
        y += h;
    });
    list.getBoundingClientRect = () => ({top: -scrollY(list)});
    const s = {
        Settings_DialogScrollCenter: 20,
        Settings_DialogValue: keys,
        Main_getElementById: id => (id === 'list' ? list : rows[id]),
        window: {getComputedStyle: () => outline}
    };
    vm.createContext(s);
    vm.runInContext(source.slice(start, end), s);
    return {s, list, rows, total: y + padding};
}

function scrollY(list) {
    const m = /translateY\(-([\d.]+)px\)/.exec(list.style.transform);
    return m ? Number(m[1]) : 0;
}

//The focused row and its outline (about 6px outside the row) must be inside 0..view
function visible(h, pos) {
    const top = h.rows['opt' + pos + '_div'].getBoundingClientRect().top;
    return top - 6 >= 0 && top + heights[pos] + 6 <= view;
}

{
    const h = sandbox();
    let allVisible = true,
        firstScroll = -1;
    for (let pos = 1; pos < heights.length; pos++) {
        h.s.Settings_ScrollConatiner('list', pos);
        if (!visible(h, pos)) allVisible = false;
        if (firstScroll < 0 && scrollY(h.list) > 0) firstScroll = pos;
    }
    check(allVisible, 'down: every option is fully in view when focused');
    check(firstScroll > 0 && firstScroll < 20, 'down: scrolling starts as soon as the focus reaches the bottom edge, not at a fixed row');
    check(Math.abs(scrollY(h.list) + view - (h.total - padding + 7)) <= 1, 'down: the last option ends at the bottom edge');

    let upVisible = true;
    for (let pos = heights.length - 2; pos >= 0; pos--) {
        h.s.Settings_ScrollConatiner('list', pos);
        if (!visible(h, pos)) upVisible = false;
    }
    check(upVisible, 'up: every option is fully in view when focused');
    check(visible(h, 0) && scrollY(h.list) <= padding, 'up: back at the top the first option and its outline are in view');
}
{
    const h = sandbox();
    h.s.Settings_ScrollConatiner('list', 3);
    check(h.list.style.transform === '', 'no scroll while the focused option is already in view');
    h.s.Settings_DialogScrollCenter = 0;
    h.s.Settings_ScrollConatiner('list', 26);
    check(h.list.style.transform === '', 'dialogs without a scroll area never scroll');
}
check(/Settings_DialogScrollY = 0;\s*Settings_DialogPos = 0;/.test(source), 'opening a dialog resets the scroll position');
const html = fs.readFileSync('app/index.html', 'utf8');
check(/\.settings_scroll_container > div \{\s*padding: 0\.3em 0;/.test(html), 'scroll list keeps room for the first and last outlines');

/* Settings_value is built when the script loads, before a language file fills the STR_ strings.
 * A value label taken from STR_ there is undefined and shows blank; labels go in through Settings_Content. */
const loadTime = {};
for (const name of new Set(source.match(/\bSTR_[A-Z_0-9]+\b/g))) loadTime[name] = undefined;
//The only helper from another file that Settings.js calls while it loads; it never produces the labels checked here
loadTime.Play_timeS = () => '';
vm.createContext(loadTime);
vm.runInContext(source, loadTime);
const blank = Object.keys(loadTime.Settings_value).filter(key => (loadTime.Settings_value[key].values || []).some(value => value === undefined));
check(Object.keys(loadTime.Settings_value).length > 100, 'Settings_value loaded');
check(blank.length === 0, 'no setting has a blank value label at load time: ' + blank.join(', '));
check(
    /Settings_Content\(\s*'menu_auto_hide',\s*\[STR_MENU_AUTO_HIDE_5S, STR_MENU_AUTO_HIDE_15S, STR_MENU_AUTO_HIDE_NEVER\]/.test(source),
    'Menu auto-hide passes its translated labels when the Settings screen is built'
);

/* Settings_SetDefaults turns the stored 1-based choice into a 0-based index, so readers of Settings_Obj_default
 * see 0 for the first option. The menu delay must follow the option order, read through the real accessor. */
check(/Settings_value\[key\]\.defaultValue -= 1;/.test(source), 'stored choices become 0-based indexes at startup');
vm.runInContext(/function PlayerUI_MenuHideDelay\(\) \{[\s\S]*?\n\}\n/.exec(fs.readFileSync('app/specific/PlayerUI.js', 'utf8'))[0], loadTime);
const delays = {'5s': 5000, '15s': 15000, never: 0};
loadTime.Settings_value.menu_auto_hide.values.forEach((option, index) => {
    loadTime.Settings_value.menu_auto_hide.defaultValue = index;
    check(loadTime.PlayerUI_MenuHideDelay() === delays[option], 'Menu auto-hide option ' + option + ' gives its own delay');
});

console.log(checks + ' settings dialog checks passed');
