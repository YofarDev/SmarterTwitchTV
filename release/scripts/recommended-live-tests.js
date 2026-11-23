/* Recommended live channels: production query/conversion/device id definitions and the feed row layout. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const UglifyJS = require('uglify-js');

const built = process.argv.includes('--built');
const names = [
    'ScreensObj_RecommendedEnabled',
    'ScreensObj_GqlDeviceId',
    'ScreensObj_RecommendedHeaders',
    'ScreensObj_RecommendedPost',
    'ScreensObj_RecommendedToStreams',
    'ScreensObj_CheckIsMature',
    'UserLiveFeedobj_loadRecommendedResult'
];
const vars = ['recommendedLiveQuery', 'ScreensObj_DeviceId'];
const files = built ? ['release/githubio/js/main_uncompressed.js'] : ['app/specific/ScreensObj.js', 'app/specific/UserLiveFeedobj.js'];

const found = new Map();
const layout = [];
for (const file of files)
    UglifyJS.parse(fs.readFileSync(file, 'utf8')).walk(
        new UglifyJS.TreeWalker(node => {
            if (node instanceof UglifyJS.AST_Defun && names.includes(node.name.name)) found.set(node.name.name, node.print_to_string());
            if (node instanceof UglifyJS.AST_Var) {
                node.definitions.forEach(def => {
                    if (vars.includes(def.name.name)) found.set(def.name.name, 'var ' + def.print_to_string() + ';');
                    if (/^UserLiveFeedobj_[A-Za-z]+Pos$/.test(def.name.name)) layout.push('var ' + def.print_to_string() + ';');
                });
            }
        })
    );
for (const name of names.concat(vars)) assert.ok(found.has(name), 'production definition missing: ' + name);

let checks = 0;
function check(ok, label) {
    assert.ok(ok, label);
    checks++;
}

function sandbox() {
    const storage = {};
    const s = {
        storage,
        effects: [],
        Settings_value: {recommended_live: {defaultValue: 1}, enable_mature: {defaultValue: 0}},
        AddUser_UserHasToken: () => true,
        Main_getItemString: (key, def) => (storage.hasOwnProperty(key) ? storage[key] : def),
        Main_setItem: (key, value) => (storage[key] = value),
        Main_OAuth_User_Headers: [
            ['Client-ID', 'client'],
            ['Authorization', 'OAuth token']
        ],
        UserLiveFeed_itemsCount: [],
        UserLiveFeedobj_loadDataError: pos => s.effects.push('error:' + pos),
        UserLiveFeedobj_loadDataBaseLiveSuccessEnd: (response, total, pos) => s.effects.push({pos, response})
    };
    vm.createContext(s);
    vm.runInContext(layout.join('\n') + '\n' + [...found.values()].join('\n'), s);
    return s;
}

/* Conversion: featuredStreams shape, filtering and malformed input */
{
    const s = sandbox();
    const fixture = JSON.parse(fs.readFileSync('jsonreferences/json_recommended_live_ref.json', 'utf8'));
    const items = s.ScreensObj_RecommendedToStreams(fixture);
    check(items.length === fixture.data.recommendedStreams.edges.length, 'every fixture stream is kept');
    check(
        items.every(item => item.stream && item.stream.broadcaster && item.stream.broadcaster.id),
        'items use the {stream} shape of featuredStreams'
    );

    const mature = {data: {recommendedStreams: {edges: [{node: {isMature: true, broadcaster: {id: '1'}}}, {node: {isMature: false, broadcaster: {id: '2'}}}]}}};
    check(s.ScreensObj_RecommendedToStreams(mature).length === 1, 'mature streams dropped while mature content is off');
    s.Settings_value.enable_mature.defaultValue = 1;
    check(s.ScreensObj_RecommendedToStreams(mature).length === 2, 'mature streams kept while mature content is on');

    const broken = [null, {}, {data: null}, {data: {recommendedStreams: null}}, {errors: [{message: 'service error'}]}];
    check(
        broken.every(obj => s.ScreensObj_RecommendedToStreams(obj).length === 0),
        'error or empty responses give no items'
    );
    check(
        s.ScreensObj_RecommendedToStreams({data: {recommendedStreams: {edges: [null, {node: null}, {node: {broadcaster: null}}]}}}).length === 0,
        'nodes without a broadcaster are skipped'
    );
}

/* Request: named operation, fresh recRequestID, device id header kept per install */
{
    const s = sandbox();
    const post = JSON.parse(s.ScreensObj_RecommendedPost());
    check(post.operationName === 'RecommendedStreams' && post.query.indexOf('query RecommendedStreams{') === 0, 'named operation, user data needs it');
    check(post.query.indexOf('%r') === -1 && /recRequestID:"\d+"/.test(post.query), 'recRequestID filled');

    const headers = s.ScreensObj_RecommendedHeaders();
    const device = headers.filter(h => h[0] === 'X-Device-Id');
    check(device.length === 1 && /^[0-9a-f]{32}$/.test(device[0][1]), 'X-Device-Id header with 32 hex chars');
    check(headers.some(h => h[1] === 'OAuth token') && s.Main_OAuth_User_Headers.length === 2, 'user headers kept, not mutated');
    check(s.storage.gql_device_id === device[0][1], 'device id stored');

    const again = sandbox();
    again.storage.gql_device_id = device[0][1];
    check(again.ScreensObj_GqlDeviceId() === device[0][1], 'stored device id reused');

    const invalid = sandbox();
    invalid.storage.gql_device_id = 'not-an-id';
    check(/^[0-9a-f]{32}$/.test(invalid.ScreensObj_GqlDeviceId()) && invalid.storage.gql_device_id !== 'not-an-id', 'invalid stored id replaced');
}

/* Enabled only signed in with the setting on */
{
    const s = sandbox();
    check(s.ScreensObj_RecommendedEnabled(), 'enabled signed in with the setting on');
    s.Settings_value.recommended_live.defaultValue = 0;
    check(!s.ScreensObj_RecommendedEnabled(), 'disabled by the setting');
    s.Settings_value.recommended_live.defaultValue = 1;
    s.AddUser_UserHasToken = () => false;
    check(!s.ScreensObj_RecommendedEnabled(), 'disabled signed out');
}

/* Feed row result handler */
{
    const s = sandbox();
    const pos = s.UserLiveFeedobj_UserRecommendedPos;
    const fixture = fs.readFileSync('jsonreferences/json_recommended_live_ref.json', 'utf8');
    s.UserLiveFeedobj_loadRecommendedResult({status: 200, responseText: fixture});
    check(s.effects.length === 1 && s.effects[0].pos === pos && s.effects[0].response.length === 3, 'row built from the response');
    s.effects.length = 0;
    s.UserLiveFeedobj_loadRecommendedResult({status: 401, responseText: ''});
    s.UserLiveFeedobj_loadRecommendedResult({status: 200, responseText: 'not JSON'});
    check(s.effects.join() === 'error:' + pos + ',error:' + pos, 'HTTP and parse failures show the row error');
}

/* Row layout: Recommended right after Following, every live row below the VOD boundary, one label slot per row */
{
    const s = sandbox();
    check(s.UserLiveFeedobj_UserRecommendedPos === s.UserLiveFeedobj_UserLivePos + 1, 'Recommended is next to Following');
    const live = ['AGamesPos', 'GamesPos', 'FeaturedPos', 'CurrentGamePos', 'LivePos', 'UserLivePos', 'UserRecommendedPos', 'UserHistoryPos', 'UserGamesPos', 'UserAGamesPos'];
    check(
        live.every(name => s['UserLiveFeedobj_' + name] < s.UserLiveFeedobj_UserVodPos),
        'live rows stay below UserVodPos (rows from it on are treated as VOD)'
    );
    const all = live.concat(['UserVodPos', 'UserVodHistoryPos']).map(name => s['UserLiveFeedobj_' + name]);
    check(new Set(all).size === all.length && Math.max.apply(null, all) === all.length - 1, 'row indices are unique and contiguous');

    //Label slots as used by the Show* functions: games pair and user games pair share a slot
    const slots = [
        s.UserLiveFeedobj_AGamesPos,
        s.UserLiveFeedobj_FeaturedPos - 1,
        s.UserLiveFeedobj_CurrentGamePos - 1,
        s.UserLiveFeedobj_LivePos - 1,
        s.UserLiveFeedobj_UserLivePos - 1,
        s.UserLiveFeedobj_UserRecommendedPos - 1,
        s.UserLiveFeedobj_UserHistoryPos - 1,
        s.UserLiveFeedobj_UserGamesPos - 1,
        s.UserLiveFeedobj_UserVodPos - 2,
        s.UserLiveFeedobj_UserVodHistoryPos - 2
    ];
    check(slots.join() === '0,1,2,3,4,5,6,7,8,9', 'label slots run 0-9 in row order');
    const html = fs.readFileSync('app/index.html', 'utf8');
    check(slots.every(slot => html.indexOf('id="feed_end_' + slot + '"') !== -1), 'every label slot exists in index.html');
    check(html.indexOf('id="user_recommended_scroll"') !== -1 && html.indexOf('id="stream_table_user_recommended"') !== -1, 'row and screen holders exist');
}

console.log(checks + ' recommended live checks passed' + (built ? ' (generated definitions)' : ''));
