/* Animated VOD thumbnail fixture: the animated preview request and its answer, against production
 * definitions only. The request stub delivers answers the way the Android bridge does: the
 * checkResult argument is a Java long, so a string arrives as 0. Run after a full build for --built mode. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');

const wanted = /^(ScreensObj_getVodAnimatedUrl|ScreensObj_getVodAnimatedUrlResult|ScreensObj_getVodAnimatedUrlPost|Screens_ObjNotNull)$/;
const sources = built ? ['release/githubio/js/main_uncompressed.js'] : ['app/specific/Screens.js', 'app/specific/ScreensObj.js'];
const definitions = [];
const found = new Set();
for (const file of sources) {
    UglifyJS.parse(fs.readFileSync(file, 'utf8')).walk(
        new UglifyJS.TreeWalker(node => {
            if (node instanceof UglifyJS.AST_Defun && wanted.test(node.name.name)) {
                definitions.push(node.print_to_string());
                found.add(node.name.name);
            } else if (node instanceof UglifyJS.AST_VarDef && wanted.test(node.name.name)) {
                definitions.push('var ' + node.print_to_string() + ';');
                found.add(node.name.name);
            }
        })
    );
}
for (const name of wanted.source.replace(/[\^$()]/g, '').split('|'))
    if (!found.has(name)) throw new Error(name + ' not found' + (built ? '; rebuild first' : ''));

let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}

const KEY = 9;
const pending = [];
const animated = [];
const divs = {};
const s = {
    PlayClip_BaseUrl: 'https://gql.example/gql',
    Play_base_backup_headers_Array: [],
    noop_fun: () => {},
    Main_getElementById: id => divs[id] || (divs[id] = {style: {}}),
    ScreensObj_AnimateThumbId: screen => animated.push(screen.posY + '_' + screen.posX),
    // OSInterface_BaseXmlHttpGet sends !checkResult ? 0 : checkResult into a Java long, and
    // deliverBase writes that long back as the last callback argument
    FullxmlHttpGet: (url, headers, success, error, key, checkResult, method, post) => {
        const sent = !checkResult ? 0 : checkResult;
        const asLong = typeof sent === 'number' ? Math.trunc(sent) : 0;
        pending.push({success, key, checkResult: asLong, post});
    },
    ScreenObj: {}
};
vm.createContext(s);
vm.runInContext(definitions.join('\n'), s);

const vodCell = id => {
    const cell = [];
    cell[7] = id;
    cell[8] = '';
    return cell;
};
s.ScreenObj[KEY] = {
    screen: KEY,
    posY: 0,
    posX: 0,
    ids: ['', '', '', '', '', 'thumb_'],
    DataObj: {'0_0': vodCell('2924251354'), '0_1': vodCell('2924000001')}
};
const screen = s.ScreenObj[KEY];
const answer = url => ({status: 200, responseText: JSON.stringify({data: {video: {animatedPreviewURL: url}}})});
const deliver = url => {
    const r = pending.shift();
    r.success(answer(url), r.key, r.checkResult);
};

//Focused VOD: the answer applies and the animation starts
s.ScreensObj_getVodAnimatedUrl(screen);
check(pending.length === 1 && JSON.parse(pending[0].post).query.indexOf('2924251354') !== -1, 'request asks for the focused VOD');
check(pending[0].checkResult !== 0, 'the request tag survives the Android bridge (a Java long)');
deliver('https://cdn.example/a-strip.jpg');
check(screen.DataObj['0_0'][8] === 'https://cdn.example/a-strip.jpg', 'answer for the focused VOD is stored');
check(divs['thumb_0_0'] && divs['thumb_0_0'].style.cssText.indexOf('a-strip.jpg') !== -1, 'the focused card gets the animated image');
check(animated.join('|') === '0_0', 'the animation starts on the focused card');

//Focus moves before the answer: nothing is stored or animated
animated.length = 0;
screen.DataObj['0_0'][8] = '';
s.ScreensObj_getVodAnimatedUrl(screen);
screen.posX = 1;
deliver('https://cdn.example/late.jpg');
check(!screen.DataObj['0_0'][8] && !screen.DataObj['0_1'][8], 'late answer: stored on no card');
check(animated.length === 0, 'late answer: no animation on the newly focused card');

//Focus leaves and comes back before the answer: the card is still the one asked for
screen.posX = 0;
s.ScreensObj_getVodAnimatedUrl(screen);
screen.posX = 1;
screen.posX = 0;
deliver('https://cdn.example/back.jpg');
check(screen.DataObj['0_0'][8] === 'https://cdn.example/back.jpg' && animated.join('|') === '0_0', 'focus back on the same VOD: the answer applies');

//The grid reloads before the answer and the same cell now holds another VOD: ignored
animated.length = 0;
screen.DataObj['0_0'][8] = '';
s.ScreensObj_getVodAnimatedUrl(screen);
screen.DataObj['0_0'] = vodCell('2924999999');
deliver('https://cdn.example/old.jpg');
check(!screen.DataObj['0_0'][8] && animated.length === 0, 'reloaded grid: the old VOD answer is not stored on the new one');

//An error answer does nothing
s.ScreensObj_getVodAnimatedUrl(screen);
const r = pending.shift();
r.success({status: 500, responseText: ''}, r.key, r.checkResult);
check(!screen.DataObj['0_0'][8] && animated.length === 0, 'error answer: nothing changes');

console.log(checks + ' animated VOD thumbnail checks passed');
