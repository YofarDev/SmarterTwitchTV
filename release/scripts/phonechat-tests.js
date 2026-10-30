/*
 * Focused Node assertion harness for the "Chat on phone" feature.
 *
 * Covers the logic that could silently break or expose credentials:
 * channel/URL building, OAuth callback + token validation, IRC frame
 * dispatch, outbound message validation, emote normalization/collisions and
 * the bounded/safe rendering core. DOM-only behavior is exercised manually
 * in a browser (see docs/phone-chat-setup.md).
 *
 * Run from the repo root:  node release/scripts/phonechat-tests.js
 * After building, repeat app flows against the minified bundle with --built.
 *
 * Uses fixture/mock data only; it never talks to Twitch.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const useBuiltBundle = process.argv.indexOf('--built') !== -1;
let passed = 0;
let failed = 0;

function ok(condition, label) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.log('FAIL: ' + label);
    }
}

function eq(actual, expected, label) {
    const same = actual === expected;
    if (!same) console.log('FAIL: ' + label + '\n  expected: ' + JSON.stringify(expected) + '\n  actual:   ' + JSON.stringify(actual));
    same ? passed++ : failed++;
}

function deepEq(actual, expected, label) {
    const same = JSON.stringify(actual) === JSON.stringify(expected);
    if (!same) console.log('FAIL: ' + label + '\n  expected: ' + JSON.stringify(expected) + '\n  actual:   ' + JSON.stringify(actual));
    same ? passed++ : failed++;
}

/* ---------- sandbox ---------- */

function makeStorage() {
    const map = new Map();
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key),
        _map: map
    };
}

function loadSandbox(overrides) {
    const sandbox = {
        console: {log: () => {}, error: () => {}, warn: () => {}},
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
        clearTimeout: clearTimeout,
        Promise: Promise,
        Date: Date,
        Math: Math,
        JSON: JSON,
        parseInt: parseInt,
        isNaN: isNaN,
        sessionStorage: makeStorage(),
        localStorage: makeStorage(),
        crypto: require('crypto').webcrypto,
        Uint8Array: Uint8Array,
        fetch: () => Promise.reject(new Error('offline-stub')),
        location: {origin: 'https://yofardev.github.io', pathname: '/SmarterTwitchTV/release/phonechat.html', search: '', hash: '', assign: () => {}},
        history: {replaceState: () => {}},
        WebSocket: function () {
            this.readyState = 0;
            this.send = () => {};
            this.close = () => {};
        }
    };

    sandbox.window = sandbox;

    for (const key in overrides || {}) sandbox[key] = overrides[key];

    vm.createContext(sandbox);

    const phoneFiles = [
        'app/thirdparty/irc-message.js',
        'app/general/PhoneChatConfig.js',
        'app/PhoneChat/emotes.js',
        'app/PhoneChat/transport.js',
        'app/PhoneChat/auth.js',
        'app/PhoneChat/render.js'
    ];

    for (const file of phoneFiles) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
    }

    return sandbox;
}

/* ---------- 1. channel normalization and URL construction ---------- */

{
    const sandbox = loadSandbox();

    vm.runInContext(fs.readFileSync(path.join(root, 'app/specific/PhoneChat.js'), 'utf8'), sandbox, {filename: 'app/specific/PhoneChat.js'});

    const run = code => vm.runInContext(code, sandbox);

    eq(run('PhoneChat_NormalizeLogin("SomeName_1")'), 'somename_1', 'channel: mixed case normalized');
    eq(run('PhoneChat_NormalizeLogin("ok")'), null, 'channel: too short rejected');
    eq(run('PhoneChat_NormalizeLogin("bad name")'), null, 'channel: space rejected');
    eq(run('PhoneChat_NormalizeLogin("x".repeat(26))'), null, 'channel: too long rejected');
    eq(run('PhoneChat_NormalizeLogin("")'), null, 'channel: empty rejected');
    eq(run('PhoneChat_NormalizeLogin(null)'), null, 'channel: null rejected');
    eq(run('PhoneChat_NormalizeLogin("_channel-9")'), null, 'channel: dash rejected');

    const url = run('PhoneChat_BuildUrlFromLogin("xqcow")');
    eq(url, sandbox.PhoneChatConfig.pageUrl + '?channel=xqcow', 'channel: URL built from configured canonical page');
    ok(!/token|oauth|secret|password/i.test(url), 'channel: QR URL carries no credential fields');
    ok(url.indexOf('https://') === 0, 'channel: QR URL is HTTPS');

    //GetChannel via Play_data (data[6] is the login, data[1] is the display name)
    sandbox.Play_isOn = true;
    sandbox.Play_data = {data: ['x', 'Display Name', 0, 0, 0, 0, 'XqCoW_1']};
    eq(run('PhoneChat_GetChannel()'), 'xqcow_1', 'channel: GetChannel uses data[6] login');
    sandbox.Play_isOn = false;
    eq(run('PhoneChat_GetChannel()'), null, 'channel: GetChannel null when player off');
    sandbox.Play_isOn = true;
    sandbox.Play_data = {data: ['x', 'Name']};
    eq(run('PhoneChat_GetChannel()'), null, 'channel: GetChannel null when data too short');
}

/* TV native bridge: pairing link and heartbeat follow the primary live stream. */
{
    const updates = [];
    const sandbox = loadSandbox({
        Main_IsOn_OSInterface: true,
        Play_isOn: true,
        PlayVod_isOn: false,
        PlayClip_isOn: false,
        Play_MultiEnable: false,
        Play_data: {data: ['id', 'Display name', 0, 0, 0, 0, 'TwitchDev']},
        OSInterface_GetPhoneChatUrl: () => 'http://192.168.1.42:8978/chat/#pair=' + 'a'.repeat(64),
        OSInterface_SetPhoneChatChannel: channel => updates.push(channel),
        setInterval: () => 1
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'app/specific/PhoneChat.js'), 'utf8'), sandbox);
    const url = sandbox.PhoneChat_BuildUrl();
    ok(url.indexOf('http://192.168.1.42:8978/chat/#pair=') === 0, 'TV LAN: QR uses native address');
    ok(url.indexOf('channel=') === -1, 'TV LAN: QR is paired to TV, not a fixed stream');
    eq(updates[0], 'twitchdev', 'TV LAN: heartbeat publishes login, not display name');
    sandbox.Play_data.data[6] = 'NewChannel';
    sandbox.PhoneChat_PublishChannel();
    eq(updates[1], 'newchannel', 'TV LAN: heartbeat follows channel changes');
    sandbox.PlayVod_isOn = true;
    sandbox.PhoneChat_PublishChannel();
    eq(updates[2], null, 'TV LAN: VOD playback deactivates phone channel');
    sandbox.OSInterface_GetPhoneChatUrl = () => '';
    eq(sandbox.PhoneChat_BuildUrl(), null, 'TV LAN: missing native server never falls back silently');
}

/* TV remote shortcut: exercise actual player dispatch and QR dialog ownership. */
{
    let panelShowing = false;
    let sceneVisible = true;
    let endVisible = false;
    let multiDialogVisible = false;
    let previewVisible = false;
    let renders = 0;
    const shown = new Set();
    const listeners = new Set();
    const texts = {};
    const canvas = {width: 300, height: 300, getContext: () => ({clearRect: () => {}})};
    const sandbox = loadSandbox({
        Main_IsOn_OSInterface: false,
        Play_isOn: true,
        PlayVod_isOn: false,
        PlayClip_isOn: false,
        Play_MultiEnable: false,
        PlayExtra_PicturePicture: false,
        Play_data: {data: ['id', 'Display name', 0, 0, 0, 0, 'TwitchDev']},
        Play_PanelCounter: 2,
        Play_controls: {2: {visible: true}},
        Main_isScene2DocVisible: () => sceneVisible,
        Play_screeOn: () => {},
        Play_isEndDialogVisible: () => endVisible,
        Play_MultiDialogVisible: () => multiDialogVisible,
        UserLiveFeed_isPreviewShowing: () => previewVisible,
        Play_isPanelShowing: () => panelShowing,
        Play_clearHidePanel: () => {},
        Play_hidePanel: () => {
            panelShowing = false;
            sandbox.Play_PanelCounter = 0;
        },
        Play_ForceShowPannel: () => {
            panelShowing = true;
        },
        Play_IconsAddFocus: () => {},
        Play_ResetPanel: () => {},
        Main_removeEventListener: (type, fn) => listeners.delete(type + ':' + fn.name),
        Main_addEventListener: (type, fn) => listeners.add(type + ':' + fn.name),
        Main_PlayHandleKeyDown: () => listeners.add('keydown:Play_handleKeyDown'),
        Main_textContent: (id, text) => {
            texts[id] = text;
        },
        Main_getElementById: () => canvas,
        Main_ShowElement: id => shown.add(id),
        Main_HideElement: id => shown.delete(id),
        Main_isElementShowing: id => shown.has(id),
        Main_AddClass: () => {},
        Main_RemoveClass: () => {},
        qrcode: () => {},
        STR_PHONE_CHAT_OPEN: 'Chat on phone',
        STR_PHONE_CHAT_INSTRUCTION: 'Scan',
        STR_PHONE_CHAT_RESCAN: 'Rescan',
        STR_PHONE_CHAT_CLOSE: 'Close'
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'app/general/TVKeyValue.js'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, 'app/specific/PhoneChat.js'), 'utf8'), sandbox);
    const player = fs.readFileSync(path.join(root, 'app/specific/PlayEtc.js'), 'utf8');
    vm.runInContext(player.slice(player.indexOf('function Play_handleKeyDown(e)'), player.indexOf('\nvar Play_controls =')), sandbox);
    sandbox.PhoneChat_DrawQr = () => {
        renders++;
    };
    listeners.add('keydown:Play_handleKeyDown');
    const event = (keyCode, repeat = false) => ({keyCode, repeat, preventDefault: () => {}, stopPropagation: () => {}});
    sandbox.Play_handleKeyDown(event(sandbox.KEY_6));
    ok(shown.has('dialog_phone_chat'), 'TV shortcut: 6 opens QR without opening player panel');
    eq(renders, 1, 'TV shortcut: one key press generates one QR');
    ok(
        !listeners.has('keydown:Play_handleKeyDown') && listeners.has('keydown:PhoneChat_HandleKeyDown'),
        'TV shortcut: QR takes remote input ownership'
    );
    eq(texts.phone_chat_close, 'Close (6)', 'TV shortcut: Close advertises the remote shortcut');
    sandbox.PhoneChat_HandleKeyDown(event(sandbox.KEY_6, true));
    ok(shown.has('dialog_phone_chat'), 'TV shortcut: held 6 does not immediately close QR');
    sandbox.PhoneChat_HandleKeyDown(event(sandbox.KEY_6));
    ok(!shown.has('dialog_phone_chat'), 'TV shortcut: second press closes QR');
    ok(
        listeners.has('keydown:Play_handleKeyDown') && !listeners.has('keydown:PhoneChat_HandleKeyDown'),
        'TV shortcut: closing restores player input'
    );
    eq(panelShowing, false, 'TV shortcut: closing leaves previously hidden controls hidden');
    sandbox.Play_handleKeyDown(event(sandbox.KEY_6, true));
    eq(renders, 1, 'TV shortcut: key repeat after closing does not reopen QR');
    panelShowing = true;
    sandbox.Play_PanelCounter = 2;
    sandbox.Play_handleKeyDown(event(sandbox.KEY_NUMPAD_6));
    ok(shown.has('dialog_phone_chat'), 'TV shortcut: numpad 6 opens QR over player controls');
    sandbox.PhoneChat_HandleKeyDown(event(sandbox.KEY_NUMPAD_6));
    ok(panelShowing && sandbox.Play_PanelCounter === 2, 'TV shortcut: numpad 6 restores original control focus');
    sandbox.PlayExtra_PicturePicture = true;
    sandbox.Play_handleKeyDown(event(sandbox.KEY_6));
    ok(shown.has('dialog_phone_chat'), 'TV shortcut: picture-in-picture supports primary-channel QR');
    sandbox.PhoneChat_HandleKeyDown(event(sandbox.KEY_RETURN));
    ok(!shown.has('dialog_phone_chat'), 'TV shortcut: Back still closes QR');
    for (const flag of ['PlayVod_isOn', 'PlayClip_isOn', 'Play_MultiEnable']) {
        sandbox[flag] = true;
        sandbox.Play_handleKeyDown(event(sandbox.KEY_6));
        ok(!shown.has('dialog_phone_chat'), 'TV shortcut: excluded playback mode ' + flag);
        sandbox[flag] = false;
    }
    endVisible = true;
    sandbox.Play_handleKeyDown(event(sandbox.KEY_6));
    ok(!shown.has('dialog_phone_chat'), 'TV shortcut: does not interrupt playback-end dialog');
    endVisible = false;
    multiDialogVisible = true;
    sandbox.Play_handleKeyDown(event(sandbox.KEY_6));
    ok(!shown.has('dialog_phone_chat'), 'TV shortcut: does not interrupt multistream dialog');
    multiDialogVisible = false;
    previewVisible = true;
    sandbox.Play_handleKeyDown(event(sandbox.KEY_6));
    ok(!shown.has('dialog_phone_chat'), 'TV shortcut: does not interrupt preview feed');
    previewVisible = false;
    sceneVisible = false;
    sandbox.Play_handleKeyDown(event(sandbox.KEY_6));
    ok(!shown.has('dialog_phone_chat'), 'TV shortcut: ignored outside player scene');
    sceneVisible = true;
    sandbox.Play_isOn = false;
    sandbox.Play_handleKeyDown(event(sandbox.KEY_6));
    ok(!shown.has('dialog_phone_chat'), 'TV shortcut: ignored after player exit');
}

/* ---------- 1b. QR drawing (real vendored generator) ---------- */

{
    const sandbox = loadSandbox();

    vm.runInContext(fs.readFileSync(path.join(root, 'app/thirdparty/qrcode.js'), 'utf8'), sandbox, {filename: 'app/thirdparty/qrcode.js'});
    vm.runInContext(fs.readFileSync(path.join(root, 'app/specific/PhoneChat.js'), 'utf8'), sandbox, {filename: 'app/specific/PhoneChat.js'});

    const drawn = {fills: [], clearRect: 0};
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
            fillStyle: '',
            fillRect: (x, y, w, h) => drawn.fills.push([x, y, w, h]),
            clearRect: () => drawn.clearRect++
        })
    };

    sandbox.__canvas = canvas;
    sandbox.__url = sandbox.PhoneChat_BuildUrlFromLogin('xqcow');
    vm.runInContext('PhoneChat_DrawQr(__canvas, __url)', sandbox);

    const modules = vm.runInContext("(function(){ var q = qrcode(0, 'M'); q.addData(__url); q.make(); return q.getModuleCount(); })()", sandbox);

    ok(canvas.width > 0 && canvas.width % (modules + 8) === 0, 'qr: canvas covers modules plus 4-module quiet zone on each side');
    ok(canvas.width >= 200, 'qr: canvas large enough to scan');
    ok(drawn.fills.length > 100, 'qr: dark modules drawn');
    ok(
        drawn.fills.every(f => f[0] >= 0 && f[1] >= 0 && f[0] + f[2] <= canvas.width && f[1] + f[3] <= canvas.height),
        'qr: all cells inside the canvas'
    );
    ok(vm.runInContext('typeof PhoneChat_DrawQr', sandbox) === 'function', 'qr: generator runs locally (no remote QR service)');
}

/* ---------- 2. OAuth callback validation ---------- */

{
    const sandbox = loadSandbox();
    sandbox.PhoneChatConfig.clientId = 'test_client_id'; //Use a deterministic fixture instead of the owner's configuration.
    const Auth = sandbox.window ? sandbox.SPTVPhoneChat.Auth : null;
    const now = 1700000000000;
    const pending = JSON.stringify({state: 'abc123', channel: 'chan', redirect: 'https://x/phonechat.html', created: now});
    const expiredPending = JSON.stringify({
        state: 'abc123',
        channel: 'chan',
        redirect: 'https://x/phonechat.html',
        created: now - sandbox.PhoneChatConfig.pendingTimeoutMs - 1
    });
    const timeout = sandbox.PhoneChatConfig.pendingTimeoutMs;

    let result = Auth.evaluateCallback({access_token: 'tok', scope: 'chat:read', state: 'abc123'}, pending, now, timeout);
    ok(result.ok, 'oauth: success accepted');
    eq(result.channel, 'chan', 'oauth: channel recovered from verified pending record');
    eq(result.accessToken, 'tok', 'oauth: token extracted');
    deepEq(result.scope, ['chat:read'], 'oauth: scope split');
    eq(sandbox.sessionStorage.getItem(Auth.PendingKey), null, 'oauth: pending record consumed on success');

    result = Auth.evaluateCallback({error: 'access_denied', state: 'abc123'}, pending, now, timeout);
    eq(result.ok, false, 'oauth: denial rejected');
    eq(result.reason, 'denied', 'oauth: denial reason');
    eq(result.channel, 'chan', 'oauth: denial still recovers the channel for retry');

    result = Auth.evaluateCallback({access_token: 'tok'}, pending, now, timeout);
    eq(result.reason, 'missing_state', 'oauth: missing state rejected');

    result = Auth.evaluateCallback({access_token: 'tok', state: 'zzz'}, pending, now, timeout);
    eq(result.reason, 'state_mismatch', 'oauth: mismatched state rejected, token discarded');
    eq(result.ok, false, 'oauth: mismatch is not ok');

    result = Auth.evaluateCallback({access_token: 'tok', state: 'abc123'}, expiredPending, now, timeout);
    eq(result.reason, 'expired', 'oauth: expired pending record rejected');

    //Replay: pending already consumed (storage empty) -> second callback fails
    sandbox.sessionStorage.setItem(Auth.PendingKey, pending);
    result = Auth.evaluateCallback(
        {access_token: 'tok2', scope: 's', state: 'abc123'},
        sandbox.sessionStorage.getItem(Auth.PendingKey),
        now,
        timeout
    );
    ok(result.ok, 'oauth: first use works');
    result = Auth.evaluateCallback(
        {access_token: 'tok2', scope: 's', state: 'abc123'},
        sandbox.sessionStorage.getItem(Auth.PendingKey),
        now,
        timeout
    );
    eq(result.reason, 'expired', 'oauth: replayed pending state rejected');
    eq(sandbox.sessionStorage.getItem(Auth.PendingKey), null, 'oauth: failed callback discards pending record');

    //Token validation response evaluation
    const scopes = sandbox.PhoneChatConfig.scopes;
    let check = Auth.evaluateValidateResponse({client_id: 'wrong', user_id: '1', login: 'a', scopes: scopes}, scopes);
    eq(check.reason, 'client_mismatch', 'oauth: wrong client id rejected');
    check = Auth.evaluateValidateResponse({client_id: sandbox.PhoneChatConfig.clientId, user_id: '1', login: 'a', scopes: ['chat:read']}, scopes);
    eq(check.reason, 'missing_scopes', 'oauth: missing scopes rejected');
    check = Auth.evaluateValidateResponse(
        {client_id: sandbox.PhoneChatConfig.clientId, user_id: '1', login: 'a', scopes: scopes, expires_in: 100},
        scopes
    );
    ok(check.ok, 'oauth: valid validate response accepted');
    eq(check.expiresIn, 100, 'oauth: expiry captured');
    check = Auth.evaluateValidateResponse(null, scopes);
    eq(check.ok, false, 'oauth: garbage validate response rejected');

    //state generation is cryptographically random and non-empty
    const s1 = Auth.randomState(32);
    const s2 = Auth.randomState(32);
    ok(s1 && s2 && s1 !== s2 && s1.length === 64, 'oauth: crypto random state, 64 hex chars, unique');
}

/* ---------- 2b. IRC tag parsing (shared with TV chat and recent-messages history) ---------- */

{
    const sandbox = loadSandbox();
    const tags = line => vm.runInContext('parseIRC(' + JSON.stringify(line) + ').tags', sandbox);

    const parsed = tags('@badges=vip/1;emotes=25:0-4;color=;id=abc :nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :Kappa');
    eq(parsed.badges, 'vip/1', 'irc tags: key=value');
    eq(parsed.emotes, '25:0-4', 'irc tags: emote ranges kept');
    eq(parsed.color, true, 'irc tags: empty value is true');

    //recent-messages history can send value-less tags; they must not take their own name as value
    const bare = tags('@badges;emotes;color;id=abc :nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :hi');
    eq(bare.emotes, true, 'irc tags: value-less emotes is true, not "emotes"');
    eq(bare.badges, true, 'irc tags: value-less badges is true');
    eq(bare.id, 'abc', 'irc tags: valued tag after value-less ones');

    eq(tags('@reply-parent-msg-body=a=b :nick!n@n PRIVMSG #chan :x')['reply-parent-msg-body'], 'a=b', 'irc tags: value containing = kept whole');
}

/* ---------- 3. IRC frame dispatch ---------- */

{
    const sandbox = loadSandbox();
    const T = sandbox.SPTVPhoneChat.Transport;

    //Multiple CRLF lines per payload, malformed lines skipped
    const messages = T.parsePayload(
        'PING :tmi.twitch.tv\r\n@onlytags\r\n@badges=moderator/1;display-name=Nick\\sName;emotes=25:0-5 :nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :Kappa hello\r\n\r\n'
    );
    eq(messages.length, 2, 'irc: payload split into lines, malformed dropped, trailing empty dropped');
    eq(messages[0].command, 'PING', 'irc: PING parsed');
    const priv = messages[1];
    eq(priv.command, 'PRIVMSG', 'irc: PRIVMSG parsed');
    eq(priv.tags['display-name'], 'Nick Name', 'irc: tag \\s unescaped');
    eq(priv.params[1], 'Kappa hello', 'irc: message body not trimmed');

    //Tag escapes: \: -> ; and \\ -> backslash
    const esc = T.unescapeTags('a\\:b\\\\c\\s');
    eq(esc, 'a;b\\c ', 'irc: tag escape sequences');

    eq(T.parseLine('@onlytags'), null, 'irc: malformed tagged line rejected');
    eq(T.parseLine(''), null, 'irc: empty line rejected');

    //Transport state machine with a stub socket
    const events = [];
    let sockets = [];
    function FakeSocket() {
        this.readyState = 0;
        sockets.push(this);
        this.sent = [];
        this.send = data => this.sent.push(data);
        this.close = () => {};
    }
    const transport = T.create({
        url: 'wss://stub',
        token: 'sectoken',
        nick: 'nick',
        channel: 'chan',
        onEvent: e => events.push(e),
        WebSocketImpl: FakeSocket
    });

    transport.start();
    eq(sockets.length, 1, 'irc: one socket created');
    const gen1 = transport.generation;
    sockets[0].onopen();
    deepEq(sockets[0].sent, ['PASS oauth:sectoken', 'NICK nick', 'CAP REQ :twitch.tv/tags twitch.tv/commands'], 'irc: PASS/NICK/CAP on open');
    eq(transport.state, T.States.AUTHENTICATING, 'irc: authenticating state');
    sockets[0].readyState = 1;
    transport._handlePayload(':tmi.twitch.tv 001 nick :Welcome, GLHF!\r\n', sockets[0]);
    eq(transport.state, T.States.JOINING, 'irc: joining after 001');
    transport._handlePayload(':nick!nick@nick.tmi.twitch.tv JOIN #chan\r\n', sockets[0]);
    eq(transport.state, T.States.CONNECTED, 'irc: connected after JOIN');
    ok(
        events.some(e => e.type === 'joined'),
        'irc: joined event emitted'
    );

    //PING answered with matching PONG (parseIRC strips the trailing colon)
    transport._handlePayload('PING :tmi.twitch.tv\r\n', sockets[0]);
    eq(sockets[0].sent[sockets[0].sent.length - 1], 'PONG tmi.twitch.tv', 'irc: PING answered with PONG');

    //Send while connected
    let sendResult = transport.send('hello');
    ok(sendResult.ok, 'irc: send ok while joined');
    eq(sockets[0].sent[sockets[0].sent.length - 1], 'PRIVMSG #chan :hello', 'irc: PRIVMSG sent');

    //Stale generation: callbacks captured from the closed socket cannot overwrite state
    const staleOnMessage = sockets[0].onmessage;
    const staleOnClose = sockets[0].onclose;
    transport._scheduleReconnect();
    eq(transport.state, T.States.RECONNECTING, 'irc: reconnecting after drop');
    staleOnMessage({data: ':nick!nick@nick.tmi.twitch.tv JOIN #chan\r\n'});
    eq(transport.state, T.States.RECONNECTING, 'irc: stale socket callback ignored');
    staleOnClose();
    eq(transport.state, T.States.RECONNECTING, 'irc: stale close ignored');

    //Auth failure stops retries — Twitch's DOCUMENTED form is an untagged NOTICE
    transport._connect();
    const authSocket = sockets[sockets.length - 1];
    authSocket.readyState = 1;
    authSocket.onopen();
    transport._handlePayload(':tmi.twitch.tv NOTICE * :Login authentication failed\r\n', authSocket);
    eq(transport.state, T.States.ERROR, 'irc: untagged documented auth failure -> error state');
    ok(
        events.some(e => e.type === 'error' && e.kind === 'auth'),
        'irc: auth error event emitted'
    );
    transport._scheduleReconnect();
    eq(transport.state, T.States.ERROR, 'irc: no reconnect scheduled after auth failure');
    eq(transport.reconnectTimer, null, 'irc: no reconnect timer after auth failure');

    //stop() is clean and idempotent
    transport.stop();
    eq(transport.state, T.States.IDLE, 'irc: stop -> idle');
    transport.stop();
    eq(transport.state, T.States.IDLE, 'irc: stop idempotent');

    //The same TEXT as an ordinary room notice while CONNECTED is NOT an auth failure
    const roomEvents = [];
    const t3 = T.create({url: 'u', token: 't', nick: 'n', channel: 'c', onEvent: e => roomEvents.push(e), WebSocketImpl: FakeSocket});
    t3.start();
    const s3 = sockets[sockets.length - 1];
    s3.readyState = 1;
    s3.onopen();
    t3._handlePayload(':tmi.twitch.tv 001 n :Welcome, GLHF!\r\n', s3);
    t3._handlePayload(':n!n@n.tmi.twitch.tv JOIN #c\r\n', s3);
    eq(t3.state, T.States.CONNECTED, 'irc: room-notice transport connected');
    t3._handlePayload(':tmi.twitch.tv NOTICE #c :Login authentication failed\r\n', s3);
    eq(t3.state, T.States.CONNECTED, 'irc: same text as a room notice while connected is NOT auth failure');
    ok(
        roomEvents.some(e => e.type === 'notice' && /Login authentication failed/i.test(e.text)),
        'irc: room notice surfaced normally'
    );
    t3.stop();

    //Action message parsing (no emote offset corruption: body kept intact)
    transport.stop();
    const echo = [];
    const t2 = T.create({url: 'u', token: 't', nick: 'n', channel: 'c', onEvent: e => echo.push(e), WebSocketImpl: FakeSocket});
    t2.start();
    const s2 = sockets[sockets.length - 1];
    s2.readyState = 1;
    s2.onopen();
    t2._handlePayload(
        '@badges=;color=#FF0000;display-name=Act;emotes=25:7-11 :act!act@act.tmi.twitch.tv PRIVMSG #c :\x01ACTION waves Kappa\x01\r\n',
        s2
    );
    const actionMsg = echo.filter(e => e.type === 'message').pop().message;
    ok(actionMsg.action, 'irc: ACTION message detected');
    eq(actionMsg.text, 'waves Kappa', 'irc: ACTION marker stripped, offsets base preserved');
    t2.stop(); //stop the reconnect loop so the harness can exit
}

/* ---------- 4. outbound validation ---------- */

{
    const T = loadSandbox().SPTVPhoneChat.Transport;

    let check = T.validateOutgoing('hello world');
    ok(check.ok, 'send: plain text ok');
    eq(check.value, 'hello world', 'send: text unchanged');

    check = T.validateOutgoing('');
    eq(check.reason, 'empty', 'send: empty rejected');

    check = T.validateOutgoing('a\r\nb');
    ok(check.ok, 'send: multiline paste normalized');
    eq(check.value, 'a b', 'send: newlines become single spaces');

    check = T.validateOutgoing('bad\x01msg');
    eq(check.reason, 'control', 'send: control char rejected');

    check = T.validateOutgoing('bad\x00msg');
    eq(check.reason, 'control', 'send: NUL rejected (protocol injection)');

    check = T.validateOutgoing('bad\nmsg');
    ok(check.ok, 'send: bare LF is deliberately normalized (multiline paste)');
    eq(check.value, 'bad msg', 'send: bare LF became a space');

    check = T.validateOutgoing('x'.repeat(481));
    eq(check.reason, 'too_long', 'send: over limit rejected');

    check = T.validateOutgoing('x'.repeat(480));
    ok(check.ok, 'send: at limit ok');

    check = T.validateOutgoing(null);
    eq(check.reason, 'invalid', 'send: non-string rejected');
}

/* ---------- 5. emote fixtures ---------- */

{
    const E = loadSandbox().SPTVPhoneChat.Emotes;

    //BTTV: channel + shared emotes
    const bttv = E.normalizeBttv([{id: 'b1', code: 'bttvCode'}, {id: 'b2'}, null], 'channel');
    eq(bttv.length, 1, 'bttv: invalid entries skipped');
    eq(bttv[0].url, 'https://cdn.betterttv.net/emote/b1/3x', 'bttv: cdn url');
    eq(bttv[0].scope, 'channel', 'bttv: scope set');
    deepEq(E.normalizeBttv(null, 'channel'), [], 'bttv: null payload -> empty (failure isolation)');

    //FFZ: protocol-relative urls normalized to https
    const ffz = E.normalizeFfz(
        {sets: {s1: {emoticons: [{id: 5, name: 'ffzCode', urls: {1: '//cdn.frankerfacez.com/a/1.png', 2: '//cdn.frankerfacez.com/a/2.png'}}]}}},
        'global'
    );
    eq(ffz.length, 1, 'ffz: emote normalized');
    ok(ffz[0].url.indexOf('https://cdn.frankerfacez.com/') === 0, 'ffz: protocol-relative url upgraded to https');
    deepEq(E.normalizeFfz({}, 'global'), [], 'ffz: missing sets -> empty');

    //FFZ global: default_sets decides which sets load; the public response
    //also contains non-default sets that must NOT become global emotes
    const ffzGlobal = E.normalizeFfz(
        {
            default_sets: [3],
            sets: {
                3: {emoticons: [{id: 10, name: 'defaultOne', urls: {2: '//cdn.frankerfacez.com/d/2.png'}}]},
                999: {emoticons: [{id: 11, name: 'notDefault', urls: {2: '//cdn.frankerfacez.com/n/2.png'}}]}
            }
        },
        'global'
    );
    eq(ffzGlobal.length, 1, 'ffz: non-default global sets skipped');
    eq(ffzGlobal[0].code, 'defaultOne', 'ffz: only default_sets load globally');
    const ffzChannel = E.normalizeFfz(
        {sets: {999: {emoticons: [{id: 11, name: 'roomOne', urls: {2: '//cdn.frankerfacez.com/n/2.png'}}]}}},
        'channel'
    );
    eq(ffzChannel.length, 1, 'ffz: room (channel) response uses its sets as-is');

    //7TV: channel with no emote set -> empty; zero-width flag; alias kept
    deepEq(E.normalizeSevenTv({}, 'channel'), [], '7tv: no emote set -> empty');
    const seven = E.normalizeSevenTv(
        {
            emote_set: {
                emotes: [
                    {
                        id: '71',
                        name: 'sevenCode',
                        data: {
                            name: 'originalName',
                            flags: 0,
                            host: {
                                url: '//cdn.7tv.app/emote/71',
                                files: [
                                    {name: '1x.webp', format: 'WEBP'},
                                    {name: '2x.webp', format: 'WEBP'},
                                    {name: '4x.avif', format: 'AVIF'}
                                ]
                            }
                        }
                    },
                    {
                        id: '72',
                        name: 'overlay',
                        data: {name: 'overlay', flags: 256, host: {url: '//cdn.7tv.app/emote/72', files: [{name: '1x.webp', format: 'WEBP'}]}}
                    }
                ]
            }
        },
        'channel'
    );
    eq(seven.length, 2, '7tv: webp files used, avif skipped');
    ok(seven[0].url.indexOf('https://cdn.7tv.app/emote/71/') === 0, '7tv: host url https normalized');
    eq(seven[0].zeroWidth, false, '7tv: zero-width flag off');
    eq(seven[1].zeroWidth, true, '7tv: zero-width flag 256 detected');
    eq(seven[0].alias, 'originalName', '7tv: alias preserved');

    //7TV flags are a BITMASK: combined flags (256+1) are still zero-width
    const sevenBits = E.normalizeSevenTv(
        {
            emotes: [
                {
                    id: '73',
                    name: 'combined',
                    data: {name: 'combined', flags: 257, host: {url: '//cdn.7tv.app/emote/73', files: [{name: '2x.webp', format: 'WEBP'}]}}
                }
            ]
        },
        'global'
    );
    eq(sevenBits[0].zeroWidth, true, '7tv: combined flags 257 still zero-width (bitmask)');

    //7TV static preference (reduced motion): PNG leads over animated WEBP
    const sevenStatic = E.normalizeSevenTv(
        {
            emotes: [
                {
                    id: '74',
                    name: 'animated1',
                    data: {
                        name: 'animated1',
                        flags: 0,
                        host: {
                            url: '//cdn.7tv.app/emote/74',
                            files: [
                                {name: '1x.webp', format: 'WEBP'},
                                {name: '1x.png', format: 'PNG'},
                                {name: '2x.png', format: 'PNG'}
                            ]
                        }
                    }
                }
            ]
        },
        'global',
        true
    );
    eq(sevenStatic[0].url, 'https://cdn.7tv.app/emote/74/2x.png', '7tv: reduced motion prefers the static PNG at the largest scale');

    //Twitch helix emotes
    const twitch = E.normalizeTwitch(
        [
            {
                id: '9',
                name: 'Kappa',
                images: {
                    url_1x: 'https://static-cdn.jtvnw.net/emoticons/v2/9/default/light/1.0',
                    url_2x: 'https://static-cdn.jtvnw.net/emoticons/v2/9/default/light/2.0',
                    url_4x: 'https://static-cdn.jtvnw.net/emoticons/v2/9/default/light/3.0'
                }
            }
        ],
        'global'
    );
    eq(twitch.length, 1, 'twitch: normalized');
    ok(twitch[0].url.indexOf('/dark/') > -1, 'twitch: dark theme url selected');

    //Collisions: resolution is deterministic by the ORDER the caller passes
    //(never by fetch arrival order). main.js owns the policy order:
    //channel lists before global lists, then 7TV > BTTV > FFZ within a scope.
    const bttvCh = [
        {provider: 'bttv', id: 'b', code: 'Same', scope: 'channel', url: 'https://cdn.betterttv.net/emote/b/3x', srcset: '', zeroWidth: false}
    ];
    const bttvGl = [{provider: 'bttv', id: 'bg', code: 'Same', scope: 'global', url: 'u', srcset: '', zeroWidth: false}];
    const ffzGl = [{provider: 'ffz', id: 'f', code: 'Same', scope: 'global', url: 'u', srcset: '', zeroWidth: false}];
    const sevenGl = [{provider: 'seven_tv', id: 's', code: 'Same', scope: 'global', url: 'u', srcset: '', zeroWidth: false}];

    const policyOrder = E.buildResolver([bttvCh, sevenGl, bttvGl, ffzGl]);
    eq(policyOrder.resolve('Same').id, 'b', 'collision: channel beats everything (policy order)');
    const globalOrder = E.buildResolver([sevenGl, bttvGl, ffzGl]);
    eq(globalOrder.resolve('Same').id, 's', 'collision: 7TV > BTTV > FFZ within scope (policy order)');
    const wrongCallOrder = E.buildResolver([ffzGl, sevenGl, bttvGl]);
    eq(wrongCallOrder.resolve('Same').id, 'f', 'collision: resolver is strictly order-based, first list wins');

    //Zero-width (overlay) emotes RESOLVE: the renderer attaches them to a
    //preceding base emote; they must not stay literal text
    const zero = E.buildResolver([[{provider: 'seven_tv', id: 'z', code: 'Zero', scope: 'channel', url: 'u', srcset: '', zeroWidth: true}]]);
    eq(zero.resolve('Zero').id, 'z', 'collision: zero-width emote resolvable for overlay rendering');
    eq(zero.resolve('Zero').zeroWidth, true, 'collision: zero-width flag preserved');
    //...but a zero-width never displaces a normal emote that claimed the code first
    const zeroAndNormal = E.buildResolver([
        [{provider: 'bttv', id: 'n', code: 'Dup', scope: 'global', url: 'u', srcset: '', zeroWidth: false}],
        [{provider: 'seven_tv', id: 'z', code: 'Dup', scope: 'global', url: 'u', srcset: '', zeroWidth: true}]
    ]);
    eq(zeroAndNormal.resolve('Dup').id, 'n', 'collision: zero-width does not displace a claimed code');

    //Get User Emotes: EXACTLY the documented response shape — top-level
    //template, per-emote format/scale/theme_mode ARRAYS, decimal scale URLs
    //(HEAD-verified: '/static/dark/2' is 404, '/static/dark/2.0' is 200)
    const userTemplate = 'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}';
    const userEmotes = E.normalizeTwitchUserEmotes(
        [
            {
                emote_set_id: '',
                emote_type: 'hypetrain',
                id: '304420818',
                name: 'HypeLol',
                scale: ['1.0', '2.0', '3.0'],
                theme_mode: ['light', 'dark'],
                format: ['static'],
                owner_id: '477339272'
            },
            {id: 'anim1', name: 'Party', scale: ['1', '2'], theme_mode: ['light', 'dark'], format: ['static', 'animated']},
            {id: 'one', name: 'OneScale', scale: ['1'], theme_mode: ['light'], format: ['static']},
            {format: ['static']}, //no id/name: skipped
            null
        ],
        userTemplate,
        'global'
    );
    eq(userEmotes.length, 3, 'twitch user emotes: documented entries normalized, invalid skipped');
    eq(userEmotes[0].code, 'HypeLol', 'twitch user emotes: code from name');
    eq(
        userEmotes[0].url,
        'https://static-cdn.jtvnw.net/emoticons/v2/304420818/static/dark/3.0',
        'twitch user emotes: documented decimal scales select the largest image'
    );
    eq(
        userEmotes[0].srcset,
        'https://static-cdn.jtvnw.net/emoticons/v2/304420818/static/dark/1.0 1.0x,https://static-cdn.jtvnw.net/emoticons/v2/304420818/static/dark/2.0 2.0x,https://static-cdn.jtvnw.net/emoticons/v2/304420818/static/dark/3.0 3.0x',
        'twitch user emotes: full srcset with decimal scale urls'
    );
    ok(userEmotes[1].url.indexOf('/animated/dark/2.0') > -1, 'twitch user emotes: animated picked when available and motion allowed');
    ok(
        E.normalizeTwitchUserEmotes(
            [{id: 'anim1', name: 'Party', scale: ['1', '2'], theme_mode: ['light', 'dark'], format: ['static', 'animated']}],
            userTemplate,
            'global',
            true
        )[0].url.indexOf('/static/dark/2.0') > -1,
        'twitch user emotes: reduced motion prefers the static format'
    );
    eq(
        userEmotes[2].url,
        'https://static-cdn.jtvnw.net/emoticons/v2/one/static/light/1.0',
        'twitch user emotes: restricted scale/theme variants respected'
    );
    deepEq(E.normalizeTwitchUserEmotes([{id: 'x', name: 'Y'}], null, 'global'), [], 'twitch user emotes: no template -> empty');
    deepEq(
        E.normalizeTwitchUserEmotes([{id: 'x', name: 'Y'}], 'https://evil.example.com/{{id}}/static/dark/2.0', 'global'),
        [],
        'twitch user emotes: template off the CDN allowlist rejected'
    );

    //Unsafe image urls rejected
    eq(E.isSafeImageUrl('http://cdn.betterttv.net/x/3x'), null, 'safety: http url rejected');
    eq(E.isSafeImageUrl('https://evil.example.com/x.png'), null, 'safety: unknown host rejected');
    eq(E.isSafeImageUrl('javascript:alert(1)'), null, 'safety: js url rejected');
    ok(E.isSafeImageUrl('//cdn.7tv.app/emote/x/2x.webp'), 'safety: protocol-relative 7tv accepted as https');
}

/* ---------- 5b/6. rendering core: ranges, unicode, bounded history, inert text ---------- */

{
    const R = loadSandbox().SPTVPhoneChat.Render;

    //Unicode: emoji are one code point; Twitch ranges are code point based
    //text: 'Kappa'(0-4) ' '(5) '🎉'(6) ' '(7) 'Kappa'(8-12)
    const segments = R.buildSegments('Kappa 🎉 Kappa', '25:0-4,8-12', null);
    const emoteSegs = segments.filter(s => s.type === 'emote');
    eq(emoteSegs.length, 2, 'render: both twitch occurrences rendered');
    eq(
        segments
            .filter(s => s.type === 'text')
            .map(s => s.text)
            .join('|'),
        ' 🎉 ',
        'render: unicode text preserved between emotes'
    );

    //Out-of-range emote is dropped defensively
    const badRange = R.buildSegments('hi', '25:0-99', null);
    ok(
        badRange.every(s => s.type === 'text'),
        'render: out-of-range emote ignored'
    );

    //Third-party tokens: whole tokens, case sensitive, words/urls untouched
    const resolver = {
        resolve: code => (code === 'bttvCode' ? {provider: 'bttv', id: 'b', code: 'bttvCode', url: 'u', srcset: '', zeroWidth: false} : null),
        resolveTwitchId: () => null
    };
    const mixed = R.tokenizeText('visit bttvCode.com and bttvCode now', resolver);
    const emoteCount = mixed.filter(s => s.type === 'emote').length;
    eq(emoteCount, 1, 'render: only the exact whole token becomes an emote');
    ok(
        mixed.some(s => s.type === 'text' && s.text === 'bttvCode.com'),
        'render: urls not partially replaced'
    );

    //Zero-width overlays: base + overlay (space separated) attaches to the base
    const overlayResolver = {
        resolve: code => {
            if (code === 'baseEmote') return {provider: 'seven_tv', id: 'base', code: 'baseEmote', url: 'u1', srcset: '', zeroWidth: false};
            if (code === 'ov1') return {provider: 'seven_tv', id: 'o1', code: 'ov1', url: 'u2', srcset: '', zeroWidth: true};
            if (code === 'ov2') return {provider: 'seven_tv', id: 'o2', code: 'ov2', url: 'u3', srcset: '', zeroWidth: true};
            return null;
        },
        resolveTwitchId: () => null
    };

    const chained = R.buildSegments('baseEmote ov1', null, overlayResolver);
    const chainedBase = chained.filter(s => s.type === 'emote')[0];
    eq(chained.filter(s => s.type === 'emote').length, 1, 'render: attached overlay leaves one emote segment');
    eq(chainedBase.overlays.length, 1, 'render: overlay attached to its base');
    eq(chainedBase.overlays[0].id, 'o1', 'render: overlay record carried on the base segment');

    //Stacked overlays: base ov1 ov2 both attach to the same base
    const stacked = R.buildSegments('baseEmote ov1 ov2', null, overlayResolver);
    const stackedBase = stacked.filter(s => s.type === 'emote')[0];
    eq(stackedBase.overlays.length, 2, 'render: stacked overlays both attach to the base');

    //Orphan overlay (no preceding base): stays standalone, rendered inline
    const orphan = R.buildSegments('hello ov1', null, overlayResolver);
    const orphanEmotes = orphan.filter(s => s.type === 'emote');
    eq(orphanEmotes.length, 1, 'render: orphan overlay kept as its own segment');
    ok(!orphanEmotes[0].overlays, 'render: orphan overlay has no attachment');

    //Words between base and overlay block the attachment
    const blocked = R.buildSegments('baseEmote text ov1', null, overlayResolver);
    const blockedEmotes = blocked.filter(s => s.type === 'emote');
    eq(blockedEmotes.length, 2, 'render: non-whitespace between blocks attachment');
    ok(!blockedEmotes[0].overlays, 'render: base keeps no overlay when text intervenes');

    //HTML/script-like text is inert: it stays a plain text segment, never an html segment
    const evil = R.buildSegments('<img src=x onerror=alert(1)> & <script>', null, null);
    ok(
        evil.every(s => s.type === 'text'),
        'render: hostile input stays text'
    );
    eq(evil.map(s => s.text).join(''), '<img src=x onerror=alert(1)> & <script>', 'render: hostile text preserved verbatim');

    //Colors
    ok(R.isValidUserColor('#ff0000'), 'render: valid 6-digit color');
    ok(R.isValidUserColor('#f00'), 'render: valid 3-digit color');
    ok(!R.isValidUserColor('red; background: url(x)'), 'render: css injection rejected');
    ok(!R.isValidUserColor('#ff00'), 'render: malformed color rejected');

    //Bounded history + dedup + tombstones
    const store = R.createStore(3);
    for (let i = 0; i < 5; i++) store.append({id: 'id' + i});
    eq(store.messages.length, 3, 'render: history bounded');
    eq(store.messages[0].id, 'id2', 'render: oldest pruned');
    const dup = store.append({id: 'id4'});
    ok(dup.duplicate && !dup.appended, 'render: duplicate id not appended');
    ok(store.has('id4'), 'render: tracked id present');

    //A DELETED id stays seen: Twitch redelivers messages, so a replay of a
    //removed message must be suppressed, never restored
    store.markDeleted('id4');
    ok(store.has('id4'), 'render: deleted id still counts as seen');
    const replayDeleted = store.append({id: 'id4'});
    ok(replayDeleted.duplicate && !replayDeleted.appended, 'render: replayed deleted message suppressed');

    //A deletion can arrive BEFORE its message (order not guaranteed)
    store.markDeleted('future1');
    const outOfOrder = store.append({id: 'future1'});
    ok(outOfOrder.duplicate && !outOfOrder.appended, 'render: out-of-order deletion suppresses the later delivery');

    //Repeated deletion stays a no-op
    store.markDeleted('id4');
    ok(store.has('id4') && store.append({id: 'id4'}).duplicate, 'render: repeated deletion idempotent');

    //The id index is bounded too: append far past twice the limit and the
    //oldest ids must leave the index (they used to leak forever)
    const bigStore = R.createStore(3);
    for (let i = 0; i < 1000; i++) bigStore.append({id: 'msg' + i});
    eq(bigStore.messages.length, 3, 'render: rows still bounded after 1000 messages');
    ok(bigStore.has('msg999'), 'render: newest id still tracked');
    ok(!bigStore.has('msg0'), 'render: oldest id evicted from the dedup index');
    ok(!bigStore.has('msg500'), 'render: mid-age id evicted from the dedup index');
    //tombstones expire through the same bounded window
    bigStore.markDeleted('msg998');
    ok(bigStore.has('msg998'), 'render: tombstone recorded as seen');
    for (let i = 1000; i < 1010; i++) bigStore.append({id: 'msg' + i});
    ok(!bigStore.has('msg998'), 'render: tombstones expire with the tracking window');
    //an id that left the window can be re-tracked without corrupting state
    const readd = bigStore.append({id: 'msg0'});
    ok(readd.appended && !readd.duplicate, 'render: evicted id re-appends cleanly when it returns');
}

/* ---------- app sandbox: mock DOM + main.js boot flows ---------- */

/*
 * The mock DOM is intentionally tiny: main.js only needs elements with
 * textContent/children/attributes, [attr="value"] queries, listeners and a
 * few input properties. Ids are created on demand so wire() can attach to
 * anything it looks up.
 */
function makeDom() {
    const ids = new Map();

    class El {
        constructor(tag) {
            this.tagName = String(tag || 'div').toUpperCase();
            this.children = [];
            this.parentNode = null;
            this.attrs = {};
            this._text = '';
            this.hidden = false;
            this.className = '';
            this.style = {};
            this.disabled = false;
            this.value = '';
            this.scrollTop = 0;
            this.scrollHeight = 1000;
            this.clientHeight = 500;
            this.listeners = {};
        }
        get textContent() {
            return this._text + this.children.map(c => c.textContent).join('');
        }
        set textContent(v) {
            this._text = String(v);
            this.children = [];
        }
        get childElementCount() {
            return this.children.length;
        }
        get firstChild() {
            return this.children[0] || null;
        }
        appendChild(node) {
            if (node.tagName === '#FRAGMENT') {
                node.children.slice().forEach(child => this.appendChild(child));
                node.children = [];
                return node;
            }
            if (node.parentNode) node.parentNode.removeChild(node);
            node.parentNode = this;
            this.children.push(node);
            return node;
        }
        insertBefore(node, before) {
            if (node.parentNode) node.parentNode.removeChild(node);
            node.parentNode = this;
            this.children.splice(this.children.indexOf(before), 0, node);
            return node;
        }
        removeChild(node) {
            const i = this.children.indexOf(node);
            if (i > -1) {
                this.children.splice(i, 1);
                node.parentNode = null;
            }
            return node;
        }
        replaceChild(add, old) {
            const i = this.children.indexOf(old);
            if (i > -1) {
                this.children[i] = add;
                add.parentNode = this;
                old.parentNode = null;
            }
            return old;
        }
        setAttribute(k, v) {
            this.attrs[k] = String(v);
        }
        getAttribute(k) {
            return k in this.attrs ? this.attrs[k] : null;
        }
        addEventListener(type, fn) {
            (this.listeners[type] = this.listeners[type] || []).push(fn);
        }
        focus() {
            this.focused = true;
        }
        setSelectionRange() {}
        _queryAll(sel) {
            const m = /^\[([a-zA-Z-]+)="(.*)"\]$/.exec(sel);
            const out = [];
            if (!m) return out;
            const walk = node => {
                node.children.forEach(child => {
                    if (child.attrs && child.attrs[m[1]] === m[2]) out.push(child);
                    walk(child);
                });
            };
            walk(this);
            return out;
        }
        querySelector(sel) {
            return this._queryAll(sel)[0] || null;
        }
        querySelectorAll(sel) {
            return this._queryAll(sel);
        }
    }

    //Elements the page ships with the hidden attribute (see app/PhoneChat/index.html)
    const hiddenByDefault = {
        'pc-device-login': true,
        'pc-account-button': true,
        'pc-banner': true,
        'pc-banner-action': true,
        'pc-jump-latest': true,
        'pc-picker': true,
        'pc-emote-button': true,
        'pc-send': true,
        'pc-muted-button': true,
        'pc-row-menu': true,
        'pc-muted-panel': true
    };

    const doc = {
        readyState: 'complete',
        hidden: false,
        createElement: tag => new El(tag),
        createTextNode: text => {
            const node = new El('#TEXT');
            node._text = String(text);
            return node;
        },
        createDocumentFragment: () => new El('#FRAGMENT'),
        getElementById: id => {
            if (!ids.has(id)) {
                const el = new El('div');
                el.hidden = !!hiddenByDefault[id];
                ids.set(id, el);
            }
            return ids.get(id);
        },
        addEventListener() {}
    };

    return {doc: doc, El: El, ids: ids};
}

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 25));

/*
 * Boot the FULL app (all phone files including main.js) in a sandbox with a
 * mock DOM. config overrides are applied between the config file and the rest
 * of the bundle; overrides are applied before anything loads. main.js
 * self-boots on load (readyState 'complete'), mirroring the real page.
 */
function loadAppSandbox(setup) {
    const dom = makeDom();
    const fetchCalls = [];
    const replaceStateCalls = [];
    const wsInstances = [];
    const timerQueue = [];
    const windowListeners = {};

    const sandbox = {
        console: {log: () => {}, error: () => {}, warn: () => {}},
        //CONTROLLABLE timers: nothing fires on its own (the 15s join timeout
        //must not race the handshake); tests fire pending timers explicitly
        setTimeout: (fn, ms) => {
            const timer = {fn: fn, ms: ms || 0, cleared: false};
            timerQueue.push(timer);
            return timer;
        },
        clearTimeout: timer => {
            if (timer && typeof timer === 'object') timer.cleared = true;
        },
        setInterval: () => 1, //never fires: the periodic revalidation must not pin the harness
        clearInterval: () => {},
        Promise: Promise,
        Date: Date,
        Math: Math,
        JSON: JSON,
        parseInt: parseInt,
        isNaN: isNaN,
        sessionStorage: makeStorage(),
        localStorage: makeStorage(),
        crypto: require('crypto').webcrypto,
        Uint8Array: Uint8Array,
        fetch: () => Promise.reject(new Error('no fetch router')),
        location: {origin: 'https://yofardev.github.io', pathname: '/SmarterTwitchTV/release/phonechat.html', search: '', hash: '', assign: () => {}},
        history: {replaceState: (...args) => replaceStateCalls.push(args)},
        AbortController: class {
            constructor() {
                this.signal = {};
            }
            abort() {}
        },
        document: dom.doc,
        addEventListener: (type, listener) => {
            (windowListeners[type] = windowListeners[type] || []).push(listener);
        },
        removeEventListener: (type, listener) => {
            windowListeners[type] = (windowListeners[type] || []).filter(candidate => candidate !== listener);
        },
        WebSocket: function (url) {
            this.url = url;
            this.readyState = 0;
            this.sent = [];
            wsInstances.push(this);
            this.send = data => this.sent.push(data);
            this.close = () => {
                this.readyState = 3;
            };
        }
    };

    sandbox.window = sandbox;

    if (setup) setup(sandbox);

    //Record and route every fetch BEFORE any app file loads: main.js
    //self-boots during load, so the router must already be in place
    sandbox.fetch = (url, options) => {
        fetchCalls.push({url: String(url), options: options});
        if (sandbox.__fetchRouter) return sandbox.__fetchRouter(String(url), options);
        return Promise.reject(new Error('no fetch router'));
    };

    vm.createContext(sandbox);

    const preFiles = useBuiltBundle ? [] : ['app/thirdparty/irc-message.js', 'app/general/PhoneChatConfig.js'];
    for (const file of preFiles) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
    }

    function applyConfigOverrides() {
        if (sandbox.__configOverrides) {
            for (const key in sandbox.__configOverrides) sandbox.PhoneChatConfig[key] = sandbox.__configOverrides[key];
        }
    }

    const postFiles = [
        'app/PhoneChat/emotes.js',
        'app/PhoneChat/transport.js',
        'app/PhoneChat/auth.js',
        'app/PhoneChat/render.js',
        'app/PhoneChat/local.js',
        'app/PhoneChat/device.js',
        'app/PhoneChat/main.js'
    ];
    if (useBuiltBundle) {
        //The built bundle includes configuration. Delay boot until after it
        //loads so tests can inject their public client ID before DOM ready.
        let boot;
        dom.doc.readyState = 'loading';
        dom.doc.addEventListener = (type, listener) => {
            if (type === 'DOMContentLoaded') boot = listener;
        };
        const file = 'release/githubio/js/PhoneChat.js';
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
        applyConfigOverrides();
        dom.doc.readyState = 'interactive';
        boot();
    } else {
        applyConfigOverrides();
        for (const file of postFiles) {
            vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
        }
    }

    return {
        sandbox: sandbox,
        dom: dom,
        ids: dom.ids,
        fetchCalls: fetchCalls,
        replaceStateCalls: replaceStateCalls,
        ws: wsInstances,
        dispatchWindow: type => {
            for (const listener of (windowListeners[type] || []).slice()) listener({type: type});
        },
        //Run every still-pending timer callback once (cleared timers are skipped).
        //Simulates elapsed time without waiting: moderation expiry, backoffs etc.
        fireTimers: ms => {
            const pending = timerQueue.splice(0, timerQueue.length);
            for (const timer of pending) {
                if (timer.cleared) continue;
                if (ms === undefined || timer.ms === ms) timer.fn();
                else timerQueue.push(timer);
            }
        },
        Auth: () => sandbox.SPTVPhoneChat.Auth,
        App: () => sandbox.SPTVPhoneChat.App
    };
}

const jsonResponse = (status, json) =>
    Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        json: () => Promise.resolve(json)
    });

const validateOk = {
    client_id: 'test_client_id',
    user_id: 'u1',
    login: 'myuser',
    scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
    expires_in: 5400
};

const helixUsers = {
    data: [{id: '141981764', login: 'twitchdev', display_name: 'TwitchDev'}]
};

const userEmotesPage = {
    data: [
        {
            emote_set_id: '',
            emote_type: 'hypetrain',
            id: '304420818',
            name: 'HypeLol',
            owner_id: '477339272',
            scale: ['1.0', '2.0', '3.0'],
            theme_mode: ['light', 'dark'],
            format: ['static']
        }
    ],
    template: 'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}',
    pagination: {}
};

//A router covering every request a successful boot+join makes
function fullSuccessRouter(url, options) {
    if (url.indexOf('id.twitch.tv/oauth2/validate') > -1) return jsonResponse(200, validateOk);
    if (url.indexOf('helix/users?login=') > -1) return jsonResponse(200, helixUsers);
    if (url.indexOf('helix/chat/emotes/user') > -1) return jsonResponse(200, userEmotesPage);
    if (url.indexOf('helix/chat/badges') > -1) return jsonResponse(200, {data: []});
    return jsonResponse(404, null); //third-party providers: normal "not enabled"
}

const asyncSections = [];

asyncSections.push(async () => {
    /* ---------- 7. full OAuth return boot: fragment callback, no ?channel ---------- */
    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '';
        sandbox.location.hash = '#access_token=tok123&scope=chat%3Aread+chat%3Aedit+user%3Aread%3Aemotes&state=abc123';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_pending',
            JSON.stringify({
                state: 'abc123',
                channel: 'TwitchDev',
                redirect: 'https://yofardev.github.io/SmarterTwitchTV/release/phonechat.html',
                created: Date.now()
            })
        );
    });

    await flushAsync();

    const ids = app.ids;

    //The registered callback has NO channel: the pending record supplied it
    eq(ids.get('pc-channel-name').textContent, 'TwitchDev', 'boot: channel recovered from the pending record and shown');

    //Address bar scrubbed to a clean channel URL (no fragment/token)
    ok(app.replaceStateCalls.length > 0, 'boot: callback URL scrubbed');
    const cleanUrl = app.replaceStateCalls[app.replaceStateCalls.length - 1][2];
    ok(cleanUrl.indexOf('access_token') === -1 && cleanUrl.indexOf('#') === -1, 'boot: clean URL carries no token fragment');
    eq(cleanUrl, 'https://yofardev.github.io/SmarterTwitchTV/release/phonechat.html?channel=twitchdev', 'boot: clean ?channel= URL restored');

    //Pending consumed exactly once
    eq(app.sandbox.sessionStorage.getItem('sptv_phone_chat_pending'), null, 'boot: pending state consumed');

    //Validation: GET with the OAuth token (never POST — Twitch 404s POST)
    const validateCalls = app.fetchCalls.filter(c => c.url.indexOf('id.twitch.tv/oauth2/validate') > -1);
    eq(validateCalls.length, 1, 'boot: token validated once');
    eq(validateCalls[0].options.method, 'GET', 'boot: validate uses GET');
    eq(validateCalls[0].options.headers.Authorization, 'OAuth tok123', 'boot: token sent in the Authorization header');

    //Session persisted (same-tab reload support)
    const savedSession = JSON.parse(app.sandbox.sessionStorage.getItem('sptv_phone_chat_session'));
    eq(savedSession.login, 'myuser', 'boot: validated identity stored');
    eq(savedSession.userId, 'u1', 'boot: validated user id stored');

    //Chat startup: helix lookup, emotes, then IRC connect
    ok(
        app.fetchCalls.some(c => c.url.indexOf('helix/users?login=twitchdev') > -1),
        'boot: channel resolved through Helix'
    );
    ok(
        app.fetchCalls.some(c => c.url.indexOf('helix/chat/emotes/user?user_id=u1&broadcaster_id=141981764') > -1),
        'boot: user emotes requested with broadcaster context'
    );
    ok(app.ws.length === 1, 'boot: exactly one IRC socket created');

    //Drive the IRC handshake to joined
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    ok(
        socket.sent.some(line => line.indexOf('PASS oauth:tok123') === 0),
        'boot: IRC authenticated with the validated token'
    );
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n'});
    socket.onmessage({data: ':myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});

    eq(ids.get('pc-connection').textContent, 'Connected myuser', 'boot: connected as the validated user');
    eq(ids.get('pc-input').disabled, false, 'boot: composer enabled after join');
    eq(ids.get('pc-send').hidden, false, 'boot: send button visible after join');

    //A received message renders (and dedups by id)
    socket.onmessage({
        data: '@id=abc-1;badges=;color=#FF0000;display-name=SomeUser;emotes=;login=someuser :someuser!someuser@someuser.tmi.twitch.tv PRIVMSG #twitchdev :hello phone\r\n'
    });
    ok(ids.get('pc-messages').textContent.indexOf('SomeUser') > -1, 'boot: received message rendered');

    //Picker hidden-state honors the [hidden] CSS contract (element flag asserted
    //plus the generated rule in the browser check in docs/phone-chat-setup.md)
    eq(ids.get('pc-picker').hidden, true, 'boot: picker hidden at rest');

    //Disconnect clears everything for the next login
    app.App().disconnect();
    eq(app.sandbox.sessionStorage.getItem('sptv_phone_chat_session'), null, 'boot: disconnect clears the session');
    eq(ids.get('pc-account-button').textContent, 'Connect', 'boot: disconnect returns to Connect');
});

asyncSections.push(async () => {
    /* ---------- 7b. denial, tampered state, replay, unavailable storage ---------- */

    //Denial arrives in the QUERY string, with no channel: banner + retry + recovered channel
    const denied = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = () => jsonResponse(200, validateOk);
        sandbox.location.search = '?error=access_denied&error_description=the+user+denied+your+request&state=abc123';
        sandbox.location.hash = '';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_pending',
            JSON.stringify({
                state: 'abc123',
                channel: 'twitchdev',
                redirect: 'https://yofardev.github.io/SmarterTwitchTV/release/phonechat.html',
                created: Date.now()
            })
        );
    });
    await flushAsync();
    eq(denied.ids.get('pc-banner-text').textContent, 'Twitch authorization was denied.', 'denial: actionable denial message');
    eq(denied.ids.get('pc-banner-action').textContent, 'Try again', 'denial: retry action offered');
    eq(denied.ids.get('pc-channel-name').textContent, 'twitchdev', 'denial: channel still recovered for retry');
    const deniedUrl = denied.replaceStateCalls[denied.replaceStateCalls.length - 1][2];
    eq(deniedUrl, 'https://yofardev.github.io/SmarterTwitchTV/release/phonechat.html?channel=twitchdev', 'denial: clean channel URL restored');
    eq(denied.fetchCalls.length, 0, 'denial: no network request made');

    //Tampered state: token discarded, generic auth error
    const tampered = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = () => jsonResponse(200, validateOk);
        sandbox.location.search = '';
        sandbox.location.hash = '#access_token=evil&state=not-ours';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_pending',
            JSON.stringify({
                state: 'abc123',
                channel: 'twitchdev',
                redirect: 'https://yofardev.github.io/SmarterTwitchTV/release/phonechat.html',
                created: Date.now()
            })
        );
    });
    await flushAsync();
    eq(tampered.ids.get('pc-banner-text').textContent, 'Sign-in could not be verified. Please connect again.', 'tamper: auth error shown');
    eq(tampered.fetchCalls.length, 0, 'tamper: mismatched state never validates the token');

    //Replay: the same callback again finds the pending record already consumed
    const replay = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = () => jsonResponse(200, validateOk);
        sandbox.location.search = '';
        sandbox.location.hash = '#access_token=tok123&state=abc123';
        //no pending record: a previous callback consumed it
    });
    await flushAsync();
    eq(
        replay.ids.get('pc-banner-text').textContent,
        'This link is missing a valid channel. Scan the QR code shown on the TV again.',
        'replay: no pending -> rescan guidance'
    );

    //Storage unavailable: visible failure, URL still scrubbed
    const noStorage = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = () => jsonResponse(200, validateOk);
        sandbox.location.search = '';
        sandbox.location.hash = '#access_token=tok123&state=abc123';
        const thrower = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
            removeItem: () => {
                throw new Error('blocked');
            }
        };
        sandbox.sessionStorage = thrower;
    });
    await flushAsync();
    eq(
        noStorage.ids.get('pc-banner-text').textContent,
        'This browser is blocking page storage, so signing in cannot work here.',
        'storage: visible failure instead of a loop'
    );
    ok(noStorage.replaceStateCalls.length > 0, 'storage: callback data still scrubbed from the URL');
});

asyncSections.push(async () => {
    /* ---------- 7c. ordinary link states + saved session reload ---------- */

    //Ordinary link without a channel
    const noChannel = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '';
    });
    await flushAsync();
    eq(
        noChannel.ids.get('pc-banner-text').textContent,
        'This link is missing a valid channel. Scan the QR code shown on the TV again.',
        'link: no channel guidance'
    );
    eq(noChannel.ids.get('pc-connection').textContent, 'No channel', 'link: connection line reflects the failure');

    //Missing owner configuration: visible state, Connect leads nowhere
    const noConfig = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: ''};
        sandbox.location.search = '?channel=twitchdev';
    });
    await flushAsync();
    eq(
        noConfig.ids.get('pc-banner-text').textContent,
        'The app owner has not configured a Twitch client ID yet, so chat connection is unavailable.',
        'config: missing client ID is a visible state'
    );

    //Saved session reload with an EXPIRED token (validate answers 401)
    const expired = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = (url, options, realFetch) => {
            if (url.indexOf('id.twitch.tv/oauth2/validate') > -1) return jsonResponse(401, {status: 401, message: 'invalid access token'});
            return fullSuccessRouter(url, options, realFetch);
        };
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({token: 'oldtoken', login: 'myuser', userId: 'u1', scopes: ['chat:read'], expiresAt: 1})
        );
    });
    await flushAsync();
    eq(expired.ids.get('pc-banner-text').textContent, 'Your Twitch session is no longer valid.', 'reload: expired token cleared with guidance');
    eq(expired.sandbox.sessionStorage.getItem('sptv_phone_chat_session'), null, 'reload: invalid session removed from storage');
    ok(expired.ws.length === 0, 'reload: no IRC connection with an invalid session');

    //Network failure during revalidation keeps the saved session and still connects
    const offline = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = (url, options) => {
            if (url.indexOf('id.twitch.tv/oauth2/validate') > -1) return Promise.reject(new Error('offline'));
            return fullSuccessRouter(url, options);
        };
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({
                token: 'goodtoken',
                login: 'myuser',
                userId: 'u1',
                scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
                expiresAt: Date.now() + 3600000
            })
        );
    });
    await flushAsync();
    eq(offline.sandbox.sessionStorage.getItem('sptv_phone_chat_session') !== null, true, 'offline: network failure keeps the saved session');
    ok(offline.ws.length === 1, 'offline: chat still starts with the kept session');
});

asyncSections.push(async () => {
    /* ---------- 7d. moderation: timeout lifecycle across join + expiry ---------- */

    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({
                token: 'goodtoken',
                login: 'myuser',
                userId: 'u1',
                scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
                expiresAt: Date.now() + 3600000
            })
        );
    });
    await flushAsync();

    const ids = app.ids;
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n'});
    socket.onmessage({data: ':myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});
    eq(ids.get('pc-input').disabled, false, 'moderation: composer enabled after join');

    //An own message and a local echo are in the feed
    socket.onmessage({
        data: '@id=m1;user-id=u1;login=myuser;display-name=myuser :myuser!myuser@myuser.tmi.twitch.tv PRIVMSG #twitchdev :old own message\r\n'
    });
    ids.get('pc-input').value = 'echo text';
    app.App().trySend();
    const feed = () => ids.get('pc-messages').textContent;
    ok(feed().indexOf('old own message') > -1, 'moderation: own message rendered');
    ok(feed().indexOf('myuser: echo text') > -1, 'moderation: local echo rendered with the account name');
    ok(feed().indexOf('submitted') > -1, 'moderation: echo marked submitted (never "sent")');
    ok(
        socket.sent.some(line => line === 'PRIVMSG #twitchdev :echo text'),
        'moderation: echo submitted to the socket'
    );
    const echoRow = ids.get('pc-messages').querySelector('[data-echo="echo-1"]');
    eq(echoRow.getAttribute('data-user-id'), 'u1', 'moderation: local echo carries the account user id');

    //Self timeout (60s): own rows + echo removed, composer disabled
    socket.onmessage({data: '@target-user-id=u1;ban-duration=60 :tmi.twitch.tv CLEARCHAT #twitchdev :myuser\r\n'});
    eq(ids.get('pc-banner-text').textContent, 'You are timed out in this channel. Sending resumes automatically.', 'moderation: timeout banner');
    eq(ids.get('pc-input').disabled, true, 'moderation: composer disabled by timeout');
    ok(feed().indexOf('old own message') === -1, 'moderation: own rows removed on self CLEARCHAT');
    ok(feed().indexOf('echo text') === -1, 'moderation: local echo removed on self CLEARCHAT');

    //Replace the actual socket through lifecycle handlers, rather than
    //injecting a second JOIN on the already-connected socket.
    app.dispatchWindow('offline');
    eq(socket.readyState, 3, 'moderation: offline closes the old socket');
    app.dispatchWindow('online');
    eq(app.ws.length, 2, 'moderation: online creates a replacement socket');
    const resumed = app.ws[1];
    resumed.readyState = 1;
    resumed.onopen();
    resumed.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n'});
    resumed.onmessage({data: ':myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});
    eq(ids.get('pc-input').disabled, true, 'moderation: reconnect join does not lift the timeout');
    eq(ids.get('pc-banner').hidden, false, 'moderation: timeout explanation visible after reconnect');
    eq(
        ids.get('pc-banner-text').textContent,
        'You are timed out in this channel. Sending resumes automatically.',
        'moderation: timeout banner survives rejoin'
    );
    eq(ids.get('pc-connection').textContent, 'Timed out', 'moderation: reconnect retains timed-out connection status');

    //Expiry (fire the controllable timer): sending returns while connected
    app.fireTimers();
    eq(ids.get('pc-input').disabled, false, 'moderation: composer re-enabled after timeout expiry');
    eq(ids.get('pc-banner').hidden, true, 'moderation: banner cleared after expiry');
    eq(ids.get('pc-connection').textContent, 'Connected myuser', 'moderation: connection restored after expiry');
});

asyncSections.push(async () => {
    /* ---------- 7e. moderation: a newer permanent ban beats an older timeout ---------- */

    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({
                token: 'goodtoken',
                login: 'myuser',
                userId: 'u1',
                scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
                expiresAt: Date.now() + 3600000
            })
        );
    });
    await flushAsync();

    const ids = app.ids;
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n'});
    socket.onmessage({data: ':myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});

    //Timeout first, then a permanent ban before the timeout expires
    socket.onmessage({data: '@target-user-id=u1;ban-duration=5 :tmi.twitch.tv CLEARCHAT #twitchdev :myuser\r\n'});
    eq(ids.get('pc-input').disabled, true, 'ban: composer disabled by timeout');
    socket.onmessage({data: '@target-user-id=u1 :tmi.twitch.tv CLEARCHAT #twitchdev :myuser\r\n'});
    eq(ids.get('pc-banner-text').textContent, 'You are banned in this channel.', 'ban: permanent ban banner');

    //Fire every pending timer: the canceled timeout timer must not re-enable
    app.fireTimers();
    eq(ids.get('pc-input').disabled, true, 'ban: old timeout timer cannot lift a newer ban');
    eq(ids.get('pc-banner-text').textContent, 'You are banned in this channel.', 'ban: banner stays after old timers fire');

    //A send attempt while blocked is rejected client-side
    ids.get('pc-input').value = 'should not send';
    app.App().trySend();
    ok(!socket.sent.some(line => line === 'PRIVMSG #twitchdev :should not send'), 'ban: blocked send never reaches the socket');
});

asyncSections.push(async () => {
    /* ---------- 7f. deletion replay + slow-mode notices ---------- */

    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({
                token: 'goodtoken',
                login: 'myuser',
                userId: 'u1',
                scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
                expiresAt: Date.now() + 3600000
            })
        );
    });
    await flushAsync();

    const ids = app.ids;
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n'});
    socket.onmessage({data: ':myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});

    //PRIVMSG -> CLEARMSG -> replayed PRIVMSG: the original text stays gone
    const privmsg =
        '@id=m1;user-id=other1;login=someone;display-name=Someone :someone!someone@someone.tmi.twitch.tv PRIVMSG #twitchdev :will be deleted\r\n';
    socket.onmessage({data: privmsg});
    ok(ids.get('pc-messages').textContent.indexOf('will be deleted') > -1, 'replay: message rendered first');
    socket.onmessage({data: '@login=someone;target-msg-id=m1 :tmi.twitch.tv CLEARMSG #twitchdev :will be deleted\r\n'});
    ok(ids.get('pc-messages').textContent.indexOf('message deleted') > -1, 'replay: row tombstoned');
    socket.onmessage({data: privmsg});
    ok(ids.get('pc-messages').textContent.indexOf('will be deleted') === -1, 'replay: redelivered deleted message NOT restored');
    eq(ids.get('pc-messages').querySelectorAll('[data-id="m1"]').length, 1, 'replay: no duplicate row appended');

    //CLEARMSG before its PRIVMSG (order not guaranteed)
    socket.onmessage({data: '@login=someone;target-msg-id=m2 :tmi.twitch.tv CLEARMSG #twitchdev :x\r\n'});
    socket.onmessage({
        data: '@id=m2;user-id=other1;login=someone;display-name=Someone :someone!someone@someone.tmi.twitch.tv PRIVMSG #twitchdev :late arrival\r\n'
    });
    ok(ids.get('pc-messages').textContent.indexOf('late arrival') === -1, 'replay: out-of-order deletion suppresses the late message');

    //Slow mode 5 -> 10 -> 10 -> 5 -> 0: exactly the three genuine changes
    socket.onmessage({data: '@slow=5 :tmi.twitch.tv ROOMSTATE #twitchdev\r\n'}); //initial baseline
    socket.onmessage({data: '@slow=10 :tmi.twitch.tv ROOMSTATE #twitchdev\r\n'});
    socket.onmessage({data: '@slow=10 :tmi.twitch.tv ROOMSTATE #twitchdev\r\n'});
    socket.onmessage({data: '@slow=5 :tmi.twitch.tv ROOMSTATE #twitchdev\r\n'});
    socket.onmessage({data: '@slow=0 :tmi.twitch.tv ROOMSTATE #twitchdev\r\n'});
    const feedText = ids.get('pc-messages').textContent;
    const slowNotices = (feedText.match(/Slow mode/g) || []).length;
    eq(slowNotices, 3, 'slow mode: only the three genuine changes announced');
    ok(feedText.indexOf('one message every 10 s.') > -1, 'slow mode: 10s change announced');
    ok(feedText.indexOf('one message every 5 s.') > -1, 'slow mode: change back to the initial 5s announced');
    ok(feedText.indexOf('Slow mode is off.') > -1, 'slow mode: off change announced');
});

asyncSections.push(async () => {
    /* ---------- 7g. feed/store lifetime across real socket replacement ---------- */
    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({token: 'goodtoken', login: 'myuser', userId: 'u1', scopes: validateOk.scopes, expiresAt: Date.now() + 3600000})
        );
    });
    await flushAsync();

    const ids = app.ids;
    const feed = ids.get('pc-messages');
    function join(socket) {
        socket.readyState = 1;
        socket.onopen();
        socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n'});
        socket.onmessage({data: ':myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});
    }
    const ordinary = '@id=kept;user-id=u2;display-name=Other :other!other@other.tmi.twitch.tv PRIVMSG #twitchdev :keep this row\r\n';
    const deleted = '@id=removed;user-id=u2;display-name=Other :other!other@other.tmi.twitch.tv PRIVMSG #twitchdev :removed text\r\n';
    const late = '@id=late;user-id=u2;display-name=Other :other!other@other.tmi.twitch.tv PRIVMSG #twitchdev :late deleted text\r\n';
    const socket = app.ws[0];
    join(socket);
    socket.onmessage({data: ordinary + deleted});
    socket.onmessage({data: '@target-msg-id=removed :tmi.twitch.tv CLEARMSG #twitchdev :removed text\r\n'});
    socket.onmessage({data: '@target-msg-id=late :tmi.twitch.tv CLEARMSG #twitchdev :late deleted text\r\n'});
    ids.get('pc-input').value = 'own echo';
    app.App().trySend();

    for (const [stop, resume] of [
        ['offline', 'online'],
        ['pagehide', 'pageshow']
    ]) {
        const previous = app.ws[app.ws.length - 1];
        const count = app.ws.length;
        app.dispatchWindow(stop);
        eq(previous.readyState, 3, 'history: ' + stop + ' closes the socket');
        eq(ids.get('pc-input').disabled, true, 'history: ' + stop + ' disables the composer');
        app.dispatchWindow(resume);
        eq(app.ws.length, count + 1, 'history: ' + resume + ' creates a new socket');
        const replacement = app.ws[app.ws.length - 1];
        join(replacement);
        replacement.onmessage({data: ordinary + deleted + late});
        eq(feed.querySelectorAll('[data-id="kept"]').length, 1, 'history: ordinary IDs dedup after ' + resume);
        eq(feed.querySelectorAll('[data-id="removed"]').length, 1, 'history: deleted row not duplicated after ' + resume);
        ok(feed.textContent.indexOf('removed text') === -1, 'history: deletion retained after ' + resume);
        ok(feed.textContent.indexOf('late deleted text') === -1, 'history: out-of-order tombstone retained after ' + resume);
        eq(ids.get('pc-input').disabled, false, 'history: unrestricted resume enables sending');
        eq(ids.get('pc-banner').hidden, true, 'history: unrestricted resume dismisses connection banner');
        eq(ids.get('pc-connection').textContent, 'Connected myuser', 'history: unrestricted resume status');
    }

    //Keep the matching echo bookkeeping with the displayed feed too.
    const replacement = app.ws[app.ws.length - 1];
    replacement.onmessage({data: '@id=own;user-id=u1;display-name=myuser :myuser!myuser@myuser.tmi.twitch.tv PRIVMSG #twitchdev :own echo\r\n'});
    eq(feed.querySelectorAll('[data-echo="echo-1"]').length, 0, 'history: echo matched after reconnect');
    eq(feed.querySelectorAll('[data-id="own"]').length, 1, 'history: server echo rendered once');
    app.App().disconnect();
    eq(feed.childElementCount, 0, 'history: explicit disconnect clears the feed');
});

asyncSections.push(async () => {
    /* ---------- 7h. permanent ban and expiry while offline, actual lifecycle ---------- */
    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({token: 'goodtoken', login: 'myuser', userId: 'u1', scopes: validateOk.scopes, expiresAt: Date.now() + 3600000})
        );
    });
    await flushAsync();
    const ids = app.ids;
    function join(socket) {
        socket.readyState = 1;
        socket.onopen();
        socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n'});
        socket.onmessage({data: ':myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});
    }
    join(app.ws[0]);
    app.ws[0].onmessage({data: '@target-user-id=u1;ban-duration=60 :tmi.twitch.tv CLEARCHAT #twitchdev :myuser\r\n'});
    app.dispatchWindow('offline');
    app.fireTimers(60000);
    eq(ids.get('pc-input').disabled, true, 'expiry offline: no send until connected');
    app.dispatchWindow('online');
    join(app.ws[1]);
    eq(ids.get('pc-input').disabled, false, 'expiry offline: expired timeout stays lifted after join');
    eq(ids.get('pc-banner').hidden, true, 'expiry offline: timeout banner gone after join');
    eq(ids.get('pc-connection').textContent, 'Connected myuser', 'expiry offline: connected status after join');

    app.ws[1].onmessage({data: '@target-user-id=u1 :tmi.twitch.tv CLEARCHAT #twitchdev :myuser\r\n'});
    app.dispatchWindow('pagehide');
    app.dispatchWindow('pageshow');
    eq(app.ws.length, 3, 'ban resume: creates replacement socket');
    join(app.ws[2]);
    eq(ids.get('pc-input').disabled, true, 'ban resume: sending stays blocked');
    eq(ids.get('pc-banner').hidden, false, 'ban resume: explanation is visible');
    eq(ids.get('pc-banner-text').textContent, 'You are banned in this channel.', 'ban resume: correct explanation');
    eq(ids.get('pc-connection').textContent, 'Banned in this channel', 'ban resume: correct connection status');
    app.App().disconnect();
});

asyncSections.push(async () => {
    /* ---------- 7i. consecutive duplicate messages collapse into one counted row ---------- */
    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        //Shiftable clock so the merge window can be crossed without waiting
        const RealDate = Date;
        let skewMs = 0;
        sandbox.Date = class extends RealDate {
            static now() {
                return RealDate.now() + skewMs;
            }
        };
        sandbox.__skewClock = ms => {
            skewMs = ms;
        };
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({token: 'goodtoken', login: 'myuser', userId: 'u1', scopes: validateOk.scopes, expiresAt: RealDate.now() + 3600000})
        );
    });
    await flushAsync();

    const ids = app.ids;
    const feed = ids.get('pc-messages');
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n'});
    socket.onmessage({data: ':myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});

    const spamMsg = (id, text) => ({
        data:
            '@id=' +
            id +
            ';user-id=other1;badges=;color=#FF0000;display-name=Spammer;emotes=;login=spammer :spammer!spammer@spammer.tmi.twitch.tv PRIVMSG #twitchdev :' +
            text +
            '\r\n'
    });

    socket.onmessage(spamMsg('s1', 'https://spam.link'));
    socket.onmessage(spamMsg('s2', 'https://spam.link'));
    socket.onmessage(spamMsg('s3', 'https://spam.link'));
    eq(feed.childElementCount, 1, 'spam: three identical messages render one row');
    ok(feed.textContent.indexOf('https://spam.link (x3)') > -1, 'spam: counter shows x3');

    //A different message in between breaks the streak
    socket.onmessage(spamMsg('s4', 'different'));
    socket.onmessage(spamMsg('s5', 'https://spam.link'));
    eq(feed.childElementCount, 3, 'spam: repeat after a break is its own row');
    eq(feed.querySelectorAll('[data-id="s5"]').length, 1, 'spam: broken-streak repeat fully rendered');
    ok(feed.textContent.indexOf('(x4)') === -1, 'spam: counter does not grow across the break');

    //Crossing the window also breaks the streak
    app.sandbox.__skewClock(30000);
    socket.onmessage(spamMsg('s6', 'https://spam.link'));
    app.sandbox.__skewClock(0);
    eq(feed.childElementCount, 4, 'spam: repeat after the window is its own row');

    //A cleared row cannot absorb further repeats
    socket.onmessage({data: '@target-user-id=other1 :tmi.twitch.tv CLEARCHAT #twitchdev :spammer\r\n'});
    eq(feed.childElementCount, 0, 'spam: CLEARCHAT removes the collapsed rows');
    socket.onmessage(spamMsg('s7', 'https://spam.link'));
    eq(feed.childElementCount, 1, 'spam: post-timeout message is a fresh row');
    ok(feed.textContent.indexOf('(x') === -1, 'spam: fresh row has no counter');

    app.App().disconnect();
    eq(feed.childElementCount, 0, 'spam: disconnect clears the feed');
});

/* ---------- Local pairing, channel following, and device login ---------- */
asyncSections.push(async () => {
    let channel = 'twitchdev',
        failState = false;
    const pairing = 'a'.repeat(64);
    const app = loadAppSandbox(s => {
        s.__configOverrides = {clientId: 'test_client_id'};
        s.location = {origin: 'http://192.168.1.42:8978', pathname: '/chat/', hash: '#pair=' + pairing, search: ''};
        s.sessionStorage.setItem('sptv_phone_chat_session', JSON.stringify({token: 'phone-only-token', login: 'myuser', userId: 'u1'}));
        s.__fetchRouter = (url, options) => {
            if (url === '/chat/state') return failState ? Promise.reject(new Error('TV offline')) : jsonResponse(200, {channel});
            return fullSuccessRouter(url, options);
        };
    });
    await flushAsync();
    ok(
        app.fetchCalls.some(call => call.url.indexOf('users?login=twitchdev') > 0),
        'LAN: channel comes from paired TV state'
    );
    eq(app.ws.length, 1, 'LAN: saved phone login starts chat');
    ok(
        app.replaceStateCalls.some(call => call[2] === 'http://192.168.1.42:8978/chat/'),
        'LAN: pairing fragment removed'
    );
    const lan = app.fetchCalls.find(call => call.url === '/chat/state');
    eq(lan.options.headers['X-SPTV-Pairing'], pairing, 'LAN: only pairing capability sent to TV');
    ok(!lan.options.headers.Authorization, 'LAN: no Twitch token sent to TV');
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome\r\n:myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});
    socket.onmessage({data: '@id=old;user-id=u2;display-name=Other :other!other@other.tmi.twitch.tv PRIVMSG #twitchdev :old channel row\r\n'});
    ok(app.ids.get('pc-messages').children.length > 0, 'LAN: first channel has messages');
    channel = 'anotherchannel';
    app.fireTimers(2000);
    await flushAsync();
    ok(
        app.fetchCalls.some(call => call.url.indexOf('users?login=anotherchannel') > 0),
        'LAN: follows TV stream change'
    );
    eq(socket.readyState, 3, 'LAN: old socket closed before joining new channel');
    eq(app.ids.get('pc-messages').children.length, 0, 'LAN: old channel history cleared');
    eq(
        JSON.parse(app.sandbox.sessionStorage.getItem('sptv_phone_chat_session')).token,
        'phone-only-token',
        'LAN: channel change preserves phone account'
    );
    eq(app.ws.length, 2, 'LAN: joins the new channel');
    channel = '';
    app.fireTimers(2000);
    await flushAsync();
    eq(app.ids.get('pc-channel-name').textContent, 'SPTV Chat', 'LAN: playback exit clears channel');
    eq(app.ids.get('pc-input').disabled, true, 'LAN: sending disabled while TV has no live stream');
    ok(app.ids.get('pc-banner-text').textContent.indexOf('Waiting') === 0, 'LAN: TV waiting state explained');
    channel = 'twitchdev';
    app.fireTimers(2000);
    await flushAsync();
    eq(app.ws.length, 3, 'LAN: next live stream starts without rescanning or signing in');
    failState = true;
    app.fireTimers(2000);
    await flushAsync();
    eq(app.ids.get('pc-input').disabled, true, 'LAN: TV disconnect blocks sending');
    eq(app.ws[2].readyState, 3, 'LAN: TV disconnect stops stale channel socket');
    failState = false;
    app.fireTimers(3000);
    await flushAsync();
    eq(app.ws.length, 4, 'LAN: TV reconnection restores chat');
    app.App().disconnect();
    app.sandbox.SPTVPhoneChat.Local.stop();
});

asyncSections.push(async () => {
    const app = loadAppSandbox(s => {
        s.__configOverrides = {clientId: 'test_client_id'};
        s.location = {origin: 'http://10.0.0.20:8978', pathname: '/chat/', hash: '#pair=' + 'b'.repeat(64), search: ''};
        s.__fetchRouter = () => jsonResponse(403, {});
    });
    await flushAsync();
    eq(app.ws.length, 0, 'LAN: revoked pairing never starts chat');
    ok(app.ids.get('pc-banner-text').textContent.indexOf('pairing has expired') > 0, 'LAN: revoked pairing requests rescan');
    const calls = app.fetchCalls.length;
    app.fireTimers(3000);
    await flushAsync();
    eq(app.fetchCalls.length, calls, 'LAN: revoked pairing stops retries');
});

asyncSections.push(async () => {
    let polls = 0,
        channel = 'twitchdev';
    const app = loadAppSandbox(s => {
        s.__configOverrides = {clientId: 'test_client_id'};
        s.location = {origin: 'http://192.168.1.42:8978', pathname: '/chat/', hash: '#pair=' + 'c'.repeat(64), search: ''};
        s.open = () => null; // popup blocked: the explicit Open Twitch link must still work
        s.__fetchRouter = (url, options) => {
            if (url === '/chat/state') return jsonResponse(200, {channel});
            if (url.indexOf('/oauth2/device') > 0)
                return jsonResponse(200, {
                    device_code: 'private-device-code',
                    user_code: 'ABCDEFGH',
                    expires_in: 1800,
                    interval: 5,
                    verification_uri: 'https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH'
                });
            if (url.indexOf('/oauth2/token') > 0)
                return ++polls === 1
                    ? jsonResponse(400, {message: 'authorization_pending'})
                    : jsonResponse(200, {access_token: 'phone-device-token'});
            return fullSuccessRouter(url, options);
        };
    });
    await flushAsync();
    app.App().startLogin();
    await flushAsync();
    eq(app.ids.get('pc-device-login').hidden, false, 'device: sign-in controls visible');
    eq(app.ids.get('pc-device-code').textContent, 'ABCDEFGH', 'device: user code shown');
    ok(app.ids.get('pc-device-link').href.indexOf('https://www.twitch.tv/activate?') === 0, 'device: explicit link works without popup');
    eq(app.sandbox.sessionStorage.getItem('sptv_phone_chat_session'), null, 'device: code alone is not an authenticated session');
    app.fireTimers(5000);
    await flushAsync();
    eq(polls, 1, 'device: polls at Twitch requested interval');
    channel = 'anotherchannel';
    app.fireTimers(2000);
    await flushAsync();
    app.fireTimers(5000);
    await flushAsync();
    eq(JSON.parse(app.sandbox.sessionStorage.getItem('sptv_phone_chat_session')).token, 'phone-device-token', 'device: token validated before use');
    ok(
        app.fetchCalls.some(call => call.url.indexOf('users?login=anotherchannel') > 0),
        'device: TV change during sign-in retained'
    );
    eq(app.ws.length, 1, 'device: joins only current channel after sign-in');
    eq(app.ids.get('pc-device-login').hidden, true, 'device: sign-in controls hidden after success');
    ok(
        app.fetchCalls.filter(call => call.url === '/chat/state').every(call => !call.options.headers.Authorization),
        'device: phone credentials never cross LAN'
    );
    const request = app.fetchCalls.find(call => call.url.indexOf('/oauth2/token') > 0);
    ok(request.options.body.indexOf('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code') > -1, 'device: correct grant requested');
    ok(request.options.body.indexOf('client_secret') === -1, 'device: no client secret embedded');
    app.App().disconnect();
    app.sandbox.SPTVPhoneChat.Local.stop();
});

asyncSections.push(async () => {
    let resolveToken,
        polls = 0;
    const app = loadAppSandbox(s => {
        s.__configOverrides = {clientId: 'test_client_id'};
        s.location = {origin: 'http://127.0.0.1:8978', pathname: '/chat/', hash: '#pair=' + 'd'.repeat(64), search: ''};
        s.__fetchRouter = (url, options) => {
            if (url === '/chat/state') return jsonResponse(200, {channel: 'twitchdev'});
            if (url.indexOf('/oauth2/device') > 0)
                return jsonResponse(200, {
                    device_code: 'private-code',
                    user_code: 'CODE',
                    expires_in: 1800,
                    interval: 5,
                    verification_uri: 'https://www.twitch.tv/activate?device-code=CODE'
                });
            if (url.indexOf('/oauth2/token') > 0) {
                polls++;
                return new Promise(resolve => {
                    resolveToken = resolve;
                });
            }
            return fullSuccessRouter(url, options);
        };
    });
    await flushAsync();
    app.App().startLogin();
    await flushAsync();
    app.fireTimers(5000);
    await flushAsync();
    eq(polls, 1, 'device cancel: token request in flight');
    app.App().disconnect();
    resolveToken(await jsonResponse(200, {access_token: 'late-token'}));
    await flushAsync();
    eq(app.sandbox.sessionStorage.getItem('sptv_phone_chat_session'), null, 'device cancel: late token discarded');
    eq(app.ws.length, 0, 'device cancel: late token cannot connect');
    eq(app.ids.get('pc-device-login').hidden, true, 'device cancel: controls cleared');
    app.sandbox.SPTVPhoneChat.Local.stop();
});

asyncSections.push(async () => {
    const app = loadAppSandbox(s => {
        s.__configOverrides = {clientId: 'test_client_id'};
        s.location = {origin: 'http://172.16.0.20:8978', pathname: '/chat/', hash: '#pair=' + 'e'.repeat(64), search: ''};
        s.__fetchRouter = url =>
            url === '/chat/state'
                ? jsonResponse(200, {channel: 'twitchdev'})
                : jsonResponse(200, {
                      device_code: 'code',
                      user_code: 'code',
                      expires_in: 1800,
                      verification_uri: 'https://www.twitch.tv.evil.example/activate'
                  });
    });
    await flushAsync();
    app.App().startLogin();
    await flushAsync();
    eq(app.ids.get('pc-device-login').hidden, true, 'device: untrusted activation URL rejected');
    eq(app.ws.length, 0, 'device: malformed authorization cannot start chat');
    app.sandbox.SPTVPhoneChat.Local.stop();
});

asyncSections.push(async () => {
    let authorizeUrl;
    const location = {};
    Object.defineProperty(location, 'href', {
        get: () => {
            throw new Error('Cross-origin location cannot be read');
        },
        set: value => {
            authorizeUrl = value;
        }
    });
    const app = loadAppSandbox(s => {
        s.__configOverrides = {clientId: 'test_client_id'};
        s.location = {origin: 'http://127.0.0.1:8978', pathname: '/chat/', hash: '#pair=' + 'f'.repeat(64), search: ''};
        s.open = () => ({location, close: () => {}, opener: null});
        s.__fetchRouter = url => {
            if (url === '/chat/state') return jsonResponse(200, {channel: 'twitchdev'});
            if (url.indexOf('/oauth2/device') > 0)
                return jsonResponse(200, {
                    device_code: 'code',
                    user_code: 'CODE',
                    expires_in: 1800,
                    interval: 5,
                    verification_uri: 'https://www.twitch.tv/activate?device-code=CODE'
                });
            return jsonResponse(400, {message: 'access_denied'});
        };
    });
    await flushAsync();
    app.App().startLogin();
    await flushAsync();
    app.fireTimers(5000);
    await flushAsync();
    ok(authorizeUrl.indexOf('https://www.twitch.tv/activate') === 0, 'device popup: navigates to Twitch');
    eq(
        app.ids.get('pc-banner-text').textContent,
        'Twitch authorization was denied.',
        'device popup: denial surfaced without reading cross-origin window'
    );
    app.sandbox.SPTVPhoneChat.Local.stop();
});

asyncSections.push(async () => {
    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({
                token: 'goodtoken',
                login: 'myuser',
                userId: 'u1',
                scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
                expiresAt: Date.now() + 3600000
            })
        );
    });
    await flushAsync();
    const ids = app.ids;
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome\r\n:myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});
    const feed = ids.get('pc-messages');
    const click = id => ids.get(id).listeners.click[0]();
    const receive = (id, badges, login = 'human') => {
        socket.onmessage({
            data:
                '@id=' +
                id +
                ';user-id=' +
                login +
                ';badges=' +
                badges +
                ';display-name=Nightbot :' +
                login +
                '!' +
                login +
                '@host PRIVMSG #twitchdev :' +
                id +
                '\r\n'
        });
        return feed.querySelector('[data-id="' + id + '"]');
    };
    click('pc-chat-priority');
    eq(ids.get('pc-chat-empty').hidden, false, 'filter: empty view explains missing qualifying messages');
    const partner = receive('partner', 'subscriber/12,partner/1');
    eq(partner.hidden, false, 'filter: Partner visible without badge artwork');
    ok(partner.className.indexOf('pc-partner') !== -1, 'filter: Partner gets purple background class');
    app.fireTimers(16); // Flush coalesced live row maintenance.
    eq(ids.get('pc-chat-empty').hidden, true, 'filter: qualifying message hides empty state');
    const vip = receive('vip', 'vip/1');
    const mod = receive('mod', 'moderator/1');
    eq(vip.hidden, false, 'filter: VIP visible');
    eq(mod.hidden, false, 'filter: human moderator visible despite bot-like display name');
    ok(vip.className.indexOf('pc-partner') === -1, 'filter: VIP does not receive Partner background');
    const ordinary = receive('ordinary', 'subscriber/12');
    eq(ordinary.hidden, true, 'filter: ordinary subscriber hidden');
    eq(receive('spoof', 'notpartner/1,notvip/1').hidden, true, 'filter: badge substrings do not qualify');
    eq(receive('zero', 'moderator/0,vip/0').hidden, true, 'filter: inactive role values do not qualify');
    eq(receive('legacy', 'verified/1').hidden, false, 'filter: legacy verified badge supported');
    ['Nightbot', 'StreamElements', 'Wizebot', 'Wisebot', 'Moobot', 'Fossabot'].forEach((login, index) => {
        eq(receive('bot' + index, 'partner/1,vip/1,moderator/1', login).hidden, true, 'filter: excludes exact bot login ' + login);
    });
    eq(receive('humanbotname', 'moderator/1', 'nightbot_fan').hidden, false, 'filter: human login containing bot name retained');
    click('pc-chat-all');
    eq(ordinary.hidden, false, 'filter: switch restores previous ordinary messages');
    eq(feed.querySelector('[data-id="bot0"]').hidden, false, 'filter: bots remain readable in All chat');
    ok(partner.className.indexOf('pc-partner') !== -1, 'filter: Partner styling remains in All chat');
    click('pc-chat-priority');
    feed.scrollTop = 0;
    feed.listeners.scroll[0]();
    ids.get('pc-jump-latest').hidden = true;
    receive('silent', '', 'viewer');
    eq(ids.get('pc-jump-latest').hidden, true, 'filter: hidden incoming traffic does not prompt jump to latest');
    receive('visible', 'vip/1');
    app.fireTimers(16); // Flush coalesced live row maintenance.
    eq(ids.get('pc-jump-latest').hidden, false, 'filter: visible incoming traffic prompts while reading older rows');
    socket.onmessage({data: '@target-msg-id=partner :tmi.twitch.tv CLEARMSG #twitchdev :partner\r\n'});
    eq(partner.textContent, 'message deleted', 'filter: deletion removes Partner text');
    ok(partner.className.indexOf('pc-partner') !== -1, 'filter: deletion retains Partner styling');
    click('pc-chat-all');
    click('pc-chat-priority');
    eq(partner.hidden, false, 'filter: deleted qualifying row retains classification after switches');
    socket.onmessage({data: '@badges=partner/1,moderator/1 :tmi.twitch.tv USERSTATE #twitchdev\r\n'});
    ids.get('pc-input').value = 'own moderator message';
    app.App().trySend();
    const own = feed.querySelector('[data-echo="echo-1"]');
    eq(own.hidden, false, 'filter: own submitted message uses Twitch USERSTATE roles');
    ok(own.className.indexOf('pc-partner') !== -1, 'filter: own Partner message also receives background');
    socket.onmessage({data: '@target-user-id=human :tmi.twitch.tv CLEARCHAT #twitchdev :human\r\n'});
    eq(feed.querySelector('[data-id="vip"]'), null, 'filter: timeout removes qualifying rows');
    eq(feed.querySelector('[data-id="ordinary"]'), null, 'filter: timeout also removes hidden rows');
    socket.onmessage({data: ':tmi.twitch.tv CLEARCHAT #twitchdev\r\n'});
    app.fireTimers(16); // Flush coalesced live row maintenance.
    eq(ids.get('pc-chat-empty').hidden, false, 'filter: room clear restores empty state');
    ids.get('pc-chat-tabs').listeners.keydown[0]({key: 'ArrowLeft', preventDefault() {}});
    eq(ids.get('pc-chat-all').getAttribute('aria-selected'), 'true', 'filter: keyboard switches active tab');
    eq(ids.get('pc-chat-priority').getAttribute('tabindex'), '-1', 'filter: inactive tab outside tab sequence');
    eq(feed.getAttribute('aria-labelledby'), 'pc-chat-all', 'filter: panel follows selected accessible label');
    for (let i = 0; i < 350; i++) receive('bounded' + i, i % 2 ? 'vip/1' : '');
    app.fireTimers(16); // Flush coalesced live row maintenance.
    ok(feed.children.filter(row => row.getAttribute('data-priority') !== 'true').length <= 320, 'filter: ordinary history remains bounded');
    eq(feed.children.filter(row => row.getAttribute('data-priority') === 'true').length, 175, 'filter: all qualifying recent messages retained');
    for (let i = 0; i < 350; i++) receive('ordinaryburst' + i, '');
    eq(
        feed.children.filter(row => row.getAttribute('data-priority') === 'true').length,
        175,
        'history: ordinary burst cannot evict qualifying history'
    );
    for (const row of feed.children) row.setAttribute('data-time', String(Date.now() - 21 * 60 * 1000));
    receive('prunetrigger', '');
    app.fireTimers(16); // Flush coalesced live row maintenance.
    eq(feed.children.filter(row => row.getAttribute('data-priority') === 'true').length, 0, 'history: qualifying rows expire after twenty minutes');
    const frames = [];
    app.sandbox.requestAnimationFrame = fn => {frames.push(fn); return frames.length;};
    app.sandbox.cancelAnimationFrame = () => {};
    app.sandbox.document.hidden = true;
    receive('hidden-frame-fallback', 'vip/1');
    eq(frames.length, 0, 'frames: hidden page uses timer fallback');
    app.fireTimers(16);
    app.sandbox.document.hidden = false;
    click('pc-chat-all');
    receive('frame-reading', 'vip/1');
    eq(frames.length, 1, 'frames: live maintenance uses one frame');
    feed.scrollTop = 0;
    feed.listeners.scroll[0]();
    frames.shift()();
    eq(feed.scrollTop, 0, 'frames: scroll intent rechecked after user scrolls up');
    eq(ids.get('pc-jump-latest').hidden, false, 'frames: unread prompt follows current intent');
    click('pc-chat-all');
    const height = 2000;
    Object.defineProperty(feed, 'scrollHeight', {configurable: true, get: () => height});
    // Simulate the queued scroll event from the previous automatic scroll after content grew.
    feed.listeners.scroll[0]();
    receive('frame-follow', 'vip/1');
    frames.shift()();
    eq(feed.scrollTop, 2000, 'frames: queued automatic scroll event preserves following');
    receive('frame-canceled', 'vip/1');
    eq(frames.length, 1, 'frames: flush pending before disconnect');
    click('pc-chat-priority');
    app.App().disconnect();
    let reads = 0;
    Object.defineProperty(feed, 'scrollHeight', {configurable: true, get: () => {reads++; return height;}});
    frames.shift()();
    eq(reads, 0, 'frames: canceled callback cannot maintain the next session');
    eq(ids.get('pc-chat-empty').hidden, false, 'filter: disconnect clears feed and updates empty state');
});

asyncSections.push(async () => {
    const remembered = makeStorage();
    remembered.setItem(
        'sptv_phone_chat_session',
        JSON.stringify({
            token: 'expired',
            refreshToken: 'refresh-old',
            login: 'myuser',
            userId: 'u1',
            scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
            expiresAt: Date.now() - 1000
        })
    );
    const setup = sandbox => {
        sandbox.localStorage = remembered;
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.location.search = '?channel=twitchdev';
        sandbox.__fetchRouter = (url, options) => {
            if (url.indexOf('/oauth2/token') > -1)
                return jsonResponse(200, {access_token: 'renewed', refresh_token: 'refresh-new', expires_in: 3600});
            return fullSuccessRouter(url, options);
        };
    };
    const app = loadAppSandbox(setup);
    await flushAsync();
    const refresh = app.fetchCalls.filter(c => c.url.indexOf('/oauth2/token') > -1);
    eq(refresh.length, 1, 'remembered login: expired credential refreshes once');
    ok(refresh[0].options.body.indexOf('refresh_token=refresh-old') !== -1, 'remembered login: uses stored refresh token');
    ok(refresh[0].options.body.indexOf('client_secret') === -1, 'remembered login: public device refresh has no client secret');
    const saved = JSON.parse(remembered.getItem('sptv_phone_chat_session'));
    eq(saved.token, 'renewed', 'remembered login: persists new access token');
    eq(saved.refreshToken, 'refresh-new', 'remembered login: rotates single-use refresh token');
    eq(app.ws.length, 1, 'remembered login: chat starts without interactive sign-in');
    const reopened = loadAppSandbox(setup);
    await flushAsync();
    eq(reopened.ws.length, 1, 'remembered login: fresh browser tab restores session');
    eq(reopened.fetchCalls.filter(c => c.url.indexOf('/oauth2/token') > -1).length, 0, 'remembered login: valid saved token needs no refresh');
    reopened.App().disconnect();
    eq(remembered.getItem('sptv_phone_chat_session'), null, 'remembered login: explicit disconnect clears persistent credentials');
    eq(reopened.sandbox.sessionStorage.getItem('sptv_phone_chat_session'), null, 'remembered login: disconnect also clears legacy session');
    remembered.setItem(
        'sptv_phone_chat_session',
        JSON.stringify({token: 'expired', refreshToken: 'keep-refresh', login: 'myuser', userId: 'u1', expiresAt: 1})
    );
    const offline = loadAppSandbox(sandbox => {
        setup(sandbox);
        sandbox.__fetchRouter = () => Promise.reject(new Error('offline'));
    });
    await flushAsync();
    eq(
        JSON.parse(remembered.getItem('sptv_phone_chat_session')).refreshToken,
        'keep-refresh',
        'remembered login: network failure preserves refresh credential'
    );
    eq(remembered.getItem('sptv_phone_refresh_lock'), null, 'remembered login: failed refresh releases cross-tab lock');
});

asyncSections.push(async () => {
    let events = [
        {
            seq: 1,
            time: Date.now() - 10 * 60 * 1000,
            type: 'message',
            message: {id: 'archive1', login: 'vipuser', badges: 'vip/1', text: 'before locking', tags: {'user-id': 'vip-id'}}
        }
    ];
    const app = loadAppSandbox(s => {
        s.__configOverrides = {clientId: 'test_client_id'};
        s.location = {origin: 'http://192.168.1.42:8978', pathname: '/chat/', hash: '#pair=' + 'a'.repeat(64), search: ''};
        s.__fetchRouter = (url, options) =>
            url === '/chat/state' ? jsonResponse(200, {channel: 'twitchdev', history: {now: Date.now(), events}}) : fullSuccessRouter(url, options);
    });
    await flushAsync();
    const feed = app.ids.get('pc-messages');
    ok(feed.textContent.includes('before locking'), 'TV history: restored qualifying messages without phone login');
    app.sandbox.document.hidden = true;
    app.dispatchWindow('pagehide');
    events = events.concat({
        seq: 2,
        time: Date.now(),
        type: 'message',
        message: {id: 'archive2', login: 'moduser', badges: 'moderator/1', text: 'while phone locked', tags: {'user-id': 'mod-id'}}
    });
    app.sandbox.document.hidden = false;
    app.dispatchWindow('pageshow');
    await flushAsync();
    ok(feed.textContent.includes('while phone locked'), 'TV history: resumes missed messages after phone returns');
    eq(feed.querySelectorAll('[data-id="archive1"]').length, 1, 'TV history: repeated snapshots cannot duplicate rows');
    events = events.concat({seq: 3, time: Date.now(), type: 'delete', id: 'archive1'});
    app.fireTimers(2000);
    await flushAsync();
    eq(feed.querySelector('[data-id="archive1"]').textContent, 'message deleted', 'TV history: missed deletion applied');
    events = events.concat({seq: 4, time: Date.now() + 1, type: 'clear', userId: 'mod-id'});
    app.fireTimers(2000);
    await flushAsync();
    eq(feed.querySelector('[data-id="archive2"]'), null, 'TV history: missed targeted clear applied');
    ok(
        app.fetchCalls.filter(c => c.url === '/chat/state').some(c => c.options.headers['X-SPTV-History-After'] === '3'),
        'TV history: poll carries cursor'
    );
    app.sandbox.SPTVPhoneChat.Local.stop();
});


asyncSections.push(async () => {
    let events = [], channel = 'fixture';
    const now = Date.now();
    const app = loadAppSandbox(s => {
        s.__configOverrides = {clientId: 'test_client_id'};
        s.location = {origin: 'http://192.168.1.42:8978', pathname: '/chat/', hash: '#pair=' + 'b'.repeat(64), search: ''};
        s.__fetchRouter = (url, options) => url === '/chat/state'
            ? jsonResponse(200, {channel, history: {now, events}}) : fullSuccessRouter(url, options);
    });
    await flushAsync();
    const feed = app.ids.get('pc-messages');
    let scrollReads = 0;
    Object.defineProperty(feed, 'scrollHeight', {get: () => {scrollReads++; return 1000;}});
    const event = (seq, time, id) => ({seq, time, type: 'message', message: {id, login: 'human', badges: 'vip/1', text: id, tags: {'user-id': 'u'}}});
    events = [event(1, now - 500, 'newer'), event(2, now - 1000, 'older'), event(3, now - 500, 'equal')];
    for (let i = 0; i < 1000; i++) events.push(event(i + 4, now + i, 'replay' + i));
    events.push({seq: 1004, time: now + 1000, type: 'delete', id: 'replay0'});
    app.fireTimers(2000);
    await flushAsync();
    eq(scrollReads, 1, 'batch: 1004 replay events read scroll height once');
    eq(feed.children.slice(0, 3).map(row => row.getAttribute('data-id')).join(','), 'older,newer,equal', 'batch: stable out-of-order and equal timestamps');
    eq(feed.querySelector('[data-id="replay0"]').textContent, 'message deleted', 'batch: moderation sees earlier rows immediately');
    eq(feed.children.length, 1003, 'batch: priority rows have no ordinary-history cap');
    channel = 'replacement'; events = [];
    app.fireTimers(2000); await flushAsync();
    eq(feed.children.length, 0, 'batch: channel reset clears replay rows');
    app.sandbox.SPTVPhoneChat.Local.stop();
});

asyncSections.push(async () => {
    /* ---------- 7m. muted users: long-press mute, persistence, unmute ---------- */

    const storage = makeStorage();
    const savedSession = () =>
        JSON.stringify({
            token: 'goodtoken',
            login: 'myuser',
            userId: 'u1',
            scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
            expiresAt: Date.now() + 3600000
        });
    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.sessionStorage.setItem('sptv_phone_chat_session', savedSession());
        sandbox.localStorage = storage; //shared with the "next visit" sandbox below
    });
    await flushAsync();
    const ids = app.ids;
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n:myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});

    const feed = ids.get('pc-messages');
    const click = id => ids.get(id).listeners.click[0]();
    const contextmenu = row => ids.get('pc-messages').listeners.contextmenu[0]({target: row, preventDefault() {}});
    const receive = (id, login) => {
        socket.onmessage({
            data:
                '@id=' +
                id +
                ';user-id=' +
                login +
                ';badges=vip/1;display-name=' +
                login +
                ' :' +
                login +
                '!' +
                login +
                '@host PRIVMSG #twitchdev :message ' +
                id +
                '\r\n'
        });
        return feed.querySelector('[data-id="' + id + '"]');
    };

    eq(ids.get('pc-muted-button').hidden, true, 'mute: header button hidden while the list is empty');

    //A channel bot with a VIP badge reaches the feed with its author recorded
    socket.onmessage({
        data: '@id=m1;user-id=soundalerts;badges=vip/1;display-name=SoundAlerts :soundalerts!soundalerts@host PRIVMSG #twitchdev :buy follows\r\n'
    });
    const botRow = feed.querySelector('[data-id="m1"]');
    ok(botRow !== null, 'mute: bot message renders before muting');
    eq(botRow.getAttribute('data-login'), 'soundalerts', 'mute: row carries the author login');
    eq(botRow.getAttribute('data-name'), 'SoundAlerts', 'mute: row carries the author display name');

    //Own rows never open the action sheet
    ok(receive('own1', 'myuser') !== null, 'mute: own message rendered');
    contextmenu(feed.querySelector('[data-id="own1"]'));
    eq(ids.get('pc-row-menu').hidden, true, 'mute: long-press on own message opens nothing');

    //Long-press the bot: the sheet offers Mute with the display name
    contextmenu(botRow);
    eq(ids.get('pc-row-menu').hidden, false, 'mute: long-press opens the action sheet');
    eq(ids.get('pc-row-menu-title').textContent, 'Mute SoundAlerts', 'mute: sheet names the author');
    eq(ids.get('pc-row-menu-mute').textContent, 'Mute', 'mute: sheet offers mute');

    //Cancel keeps everything visible
    click('pc-row-menu-cancel');
    eq(ids.get('pc-row-menu').hidden, true, 'mute: cancel closes the sheet');
    ok(feed.querySelector('[data-id="m1"]') !== null, 'mute: cancel leaves the message');

    //Muting removes existing rows, flips the header button and saves the list
    contextmenu(botRow);
    click('pc-row-menu-mute');
    eq(feed.querySelector('[data-id="m1"]'), null, 'mute: muting removes existing rows');
    eq(ids.get('pc-muted-button').hidden, false, 'mute: header button appears');
    eq(ids.get('pc-muted-button').textContent, 'Muted (1)', 'mute: header button counts entries');
    deepEq(JSON.parse(storage.getItem('sptv_phone_muted') || '[]'), ['soundalerts'], 'mute: list saved to storage');

    //New messages from the muted user are dropped; other users still render
    eq(receive('m2', 'soundalerts'), null, 'mute: new muted messages are not rendered');
    ok(receive('human1', 'somehuman') !== null, 'mute: other users still render');

    //The muted panel lists the user and unmuting restores visibility
    click('pc-muted-button');
    eq(ids.get('pc-muted-panel').hidden, false, 'mute: panel opens from the header button');
    const unmuteButton = ids.get('pc-muted-list').children[0].children[1];
    eq(unmuteButton.getAttribute('data-unmute'), 'soundalerts', 'mute: panel lists the muted login');
    ids.get('pc-muted-list').listeners.click[0]({target: unmuteButton});
    eq(ids.get('pc-muted-button').hidden, true, 'mute: unmute empties the header button again');
    deepEq(JSON.parse(storage.getItem('sptv_phone_muted') || '[]'), [], 'mute: unmute saved to storage');
    click('pc-muted-close');
    eq(ids.get('pc-muted-panel').hidden, true, 'mute: close button hides the panel');

    //Ids dropped while muted stay deduplicated: no resurrection after unmute
    socket.onmessage({
        data: '@id=m2;user-id=soundalerts;badges=vip/1;display-name=SoundAlerts :soundalerts!soundalerts@host PRIVMSG #twitchdev :message m2\r\n'
    });
    eq(feed.querySelector('[data-id="m2"]'), null, 'mute: replayed dropped id stays dropped after unmute');
    ok(receive('m3', 'soundalerts') !== null, 'mute: fresh messages render again after unmute');

    //Mute again, then prove the list survives a full page reload
    contextmenu(feed.querySelector('[data-id="m3"]'));
    click('pc-row-menu-mute');
    eq(ids.get('pc-muted-button').textContent, 'Muted (1)', 'mute: re-mute recorded');

    const revisit = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.localStorage = storage;
        sandbox.sessionStorage.setItem('sptv_phone_chat_session', savedSession());
    });
    await flushAsync();
    const socket2 = revisit.ws[0];
    socket2.readyState = 1;
    socket2.onopen();
    socket2.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n:myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});
    eq(revisit.ids.get('pc-muted-button').textContent, 'Muted (1)', 'mute: list restored on the next visit');
    socket2.onmessage({
        data: '@id=fresh1;user-id=soundalerts;badges=vip/1;display-name=SoundAlerts :soundalerts!soundalerts@host PRIVMSG #twitchdev :message fresh\r\n'
    });
    eq(revisit.ids.get('pc-messages').querySelector('[data-id="fresh1"]'), null, 'mute: muted user hidden on the next visit');
});

asyncSections.push(async () => {
    /* ---------- 7n. muted users: a corrupt stored list cannot break boot ---------- */

    const broken = makeStorage();
    broken.setItem('sptv_phone_muted', '{not json');
    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.localStorage = broken;
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({
                token: 'goodtoken',
                login: 'myuser',
                userId: 'u1',
                scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
                expiresAt: Date.now() + 3600000
            })
        );
    });
    await flushAsync();
    eq(app.ids.get('pc-muted-button').hidden, true, 'mute: corrupt stored list ignored at boot');
});

asyncSections.push(async () => {
    /* ---------- 7o. muted users: touch long-press (iOS never fires contextmenu) ---------- */

    const app = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
        sandbox.localStorage = makeStorage();
        sandbox.sessionStorage.setItem(
            'sptv_phone_chat_session',
            JSON.stringify({
                token: 'goodtoken',
                login: 'myuser',
                userId: 'u1',
                scopes: ['chat:read', 'chat:edit', 'user:read:emotes'],
                expiresAt: Date.now() + 3600000
            })
        );
    });
    await flushAsync();
    const ids = app.ids;
    const socket = app.ws[0];
    socket.readyState = 1;
    socket.onopen();
    socket.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome, GLHF!\r\n:myuser!myuser@myuser.tmi.twitch.tv JOIN #twitchdev\r\n'});

    const feed = ids.get('pc-messages');
    const sheetHidden = () => ids.get('pc-row-menu').hidden;
    const click = id => ids.get(id).listeners.click[0]();
    const fire = (type, event) => {
        for (const listener of feed.listeners[type] || []) listener(event);
    };
    //A touch event as the handlers read it: the pressed element plus the finger positions
    const touch = (target, x, y, fingers) => ({
        target: target,
        touches: Array.from({length: fingers === undefined ? 1 : fingers}, () => ({clientX: x, clientY: y})),
        prevented: false,
        preventDefault() {
            this.prevented = true;
        }
    });
    const receive = (id, login) => {
        socket.onmessage({
            data:
                '@id=' +
                id +
                ';user-id=' +
                login +
                ';badges=vip/1;display-name=' +
                login +
                ' :' +
                login +
                '!' +
                login +
                '@host PRIVMSG #twitchdev :message ' +
                id +
                '\r\n'
        });
        return feed.querySelector('[data-id="' + id + '"]');
    };

    ok(feed.listeners.touchstart && feed.listeners.touchend, 'touch: the feed listens for touches');

    //iPhone: no contextmenu ever arrives, so holding a finger still must open the sheet by itself
    const botRow = receive('m1', 'soundalerts');
    fire('touchstart', touch(botRow, 100, 200));
    eq(sheetHidden(), true, 'touch: a fresh press does not open the sheet yet');
    app.fireTimers(500);
    eq(sheetHidden(), false, 'touch: holding for the long-press delay opens the sheet');
    eq(ids.get('pc-row-menu-title').textContent, 'Mute soundalerts', 'touch: the sheet names the pressed author');

    //Android fires contextmenu for the very same press: the native menu stays suppressed and nothing re-opens
    const native = {
        target: botRow,
        prevented: false,
        preventDefault() {
            this.prevented = true;
        }
    };
    fire('contextmenu', native);
    eq(native.prevented, true, 'touch: contextmenu for the same press is still suppressed');
    eq(sheetHidden(), false, 'touch: contextmenu for the same press leaves the sheet open');

    //Lifting the finger must not deliver a click to the backdrop, which would close the sheet
    const release = touch(botRow, 100, 200, 0);
    fire('touchend', release);
    eq(release.prevented, true, 'touch: the release that ends a long-press is cancelled');
    eq(sheetHidden(), false, 'touch: the sheet survives the release');
    click('pc-row-menu-mute');
    eq(feed.querySelector('[data-id="m1"]'), null, 'touch: muting from the sheet removes the messages');
    eq(ids.get('pc-muted-button').textContent, 'Muted (1)', 'touch: the muted list updates');

    const humanRow = receive('h1', 'somehuman');

    //A quick tap releases before the delay: no sheet, and the tap keeps its click
    fire('touchstart', touch(humanRow, 100, 200));
    const tap = touch(humanRow, 100, 200, 0);
    fire('touchend', tap);
    app.fireTimers(500);
    eq(sheetHidden(), true, 'touch: a quick tap never opens the sheet');
    eq(tap.prevented, false, 'touch: a quick tap keeps its click');

    //A finger that scrolls the feed is not a press
    fire('touchstart', touch(humanRow, 100, 200));
    fire('touchmove', touch(humanRow, 100, 260));
    app.fireTimers(500);
    eq(sheetHidden(), true, 'touch: scrolling cancels the long-press');
    fire('touchend', touch(humanRow, 100, 260, 0));

    //Jitter inside the slop still counts as holding still
    fire('touchstart', touch(humanRow, 100, 200));
    fire('touchmove', touch(humanRow, 104, 196));
    app.fireTimers(500);
    eq(sheetHidden(), false, 'touch: jitter inside the slop keeps the press alive');
    eq(ids.get('pc-row-menu-title').textContent, 'Mute somehuman', 'touch: the sheet names the second author');
    fire('touchend', touch(humanRow, 104, 196, 0));
    click('pc-row-menu-cancel');
    eq(sheetHidden(), true, 'touch: cancel closes the sheet');

    //Two fingers are a pinch or a scroll, never a press
    fire('touchstart', touch(humanRow, 100, 200, 2));
    app.fireTimers(500);
    eq(sheetHidden(), true, 'touch: a two-finger press is ignored');

    //The system taking the gesture away drops the pending press
    fire('touchstart', touch(humanRow, 100, 200));
    fire('touchcancel', {});
    app.fireTimers(500);
    eq(sheetHidden(), true, 'touch: touchcancel drops the pending press');

    //Own messages have no action from a touch either
    const ownRow = receive('own1', 'myuser');
    fire('touchstart', touch(ownRow, 100, 200));
    app.fireTimers(500);
    eq(sheetHidden(), true, 'touch: own messages open nothing');
    const ownRelease = touch(ownRow, 100, 200, 0);
    fire('touchend', ownRelease);
    eq(ownRelease.prevented, false, 'touch: releasing an own message keeps its click');

    //Android can fire its native contextmenu before the timer: it takes the press over, the timer
    //must not re-open a sheet the user already dismissed, and the release still swallows its click
    fire('touchstart', touch(humanRow, 100, 200));
    fire('contextmenu', {target: humanRow, preventDefault() {}});
    eq(sheetHidden(), false, 'touch: contextmenu during a press opens the sheet');
    click('pc-row-menu-cancel');
    app.fireTimers(500);
    eq(sheetHidden(), true, 'touch: the timer taken over by contextmenu does not re-open the sheet');
    const nativeRelease = touch(humanRow, 100, 200, 0);
    fire('touchend', nativeRelease);
    eq(nativeRelease.prevented, true, 'touch: the release after a native long-press is cancelled too');
});

asyncSections.push(async () => {
    /* ---------- 7p. on-screen keyboard: the app follows the visual viewport ---------- */

    //Stubbed visualViewport: the keyboard shrinks it while the layout viewport stays put
    //(iOS behaviour; Android with interactive-widget=resizes-content shrinks both the same way)
    const vv = {
        height: 844,
        offsetTop: 0,
        listeners: {},
        addEventListener(type, fn) {
            (this.listeners[type] = this.listeners[type] || []).push(fn);
        }
    };
    const fireVv = type => {
        for (const listener of (vv.listeners[type] || []).slice()) listener({type: type});
    };

    const app = loadAppSandbox(sandbox => {
        sandbox.visualViewport = vv;
        sandbox.innerHeight = 844;
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
    });

    await flushAsync();

    const ids = app.ids;
    const appEl = ids.get('pc-app');
    const box = ids.get('pc-messages');
    //The app's own scroll handler decides whether the reader is at the tail
    const scrolled = () => box.listeners.scroll.forEach(listener => listener());

    ok(vv.listeners.resize && vv.listeners.resize.length === 1, 'viewport: one resize listener registered');
    ok(vv.listeners.scroll && vv.listeners.scroll.length === 1, 'viewport: one scroll listener registered');
    eq(appEl.style.height, '844px', 'viewport: boot pins the app to the visible height');

    //Keyboard opens while the reader is at the tail: pin the app, keep the newest message in view
    box.scrollTop = box.scrollHeight - box.clientHeight;
    scrolled();
    vv.height = 500;
    fireVv('resize');
    eq(appEl.style.height, '500px', 'keyboard open: app shrinks to the visual viewport so the composer stays visible');
    eq(appEl.style.transform, 'translateY(0px)', 'keyboard open: no offset while the visual viewport sits at the top');
    eq(box.scrollTop, box.scrollHeight, 'keyboard open at the tail: the newest message is kept in view');
    eq(ids.get('pc-jump-latest').hidden, true, 'keyboard open at the tail: no jump button');

    //iOS scrolls the visual viewport under the keyboard: compensate the offset
    vv.offsetTop = 32;
    fireVv('scroll');
    eq(appEl.style.transform, 'translateY(32px)', 'keyboard open: visual viewport offset compensated');

    //Keyboard closed: back to the full height, offset cleared
    vv.height = 844;
    vv.offsetTop = 0;
    fireVv('resize');
    eq(appEl.style.height, '844px', 'keyboard closed: app back to the full height');
    eq(appEl.style.transform, 'translateY(0px)', 'keyboard closed: offset cleared');

    //Keyboard opens while the reader scrolled up: never yank them back to the tail
    box.scrollTop = 100;
    scrolled();
    vv.height = 500;
    fireVv('resize');
    eq(box.scrollTop, 100, 'keyboard open while reading: the scroll position is left alone');
    eq(appEl.style.height, '500px', 'keyboard open while reading: the app still follows the visible height');

    //A small change (URL bar collapse) is not a keyboard: no forced scroll either
    vv.height = 844;
    fireVv('resize');
    box.scrollTop = box.scrollHeight - box.clientHeight;
    scrolled();
    vv.height = 790;
    fireVv('resize');
    eq(box.scrollTop, box.scrollHeight - box.clientHeight, 'url bar: a small viewport change does not force a scroll');
    eq(appEl.style.height, '790px', 'url bar: the app still follows the visible height');

    //No visualViewport (old WebViews): boot must not touch the app element at all, CSS handles it
    const legacy = loadAppSandbox(sandbox => {
        sandbox.__configOverrides = {clientId: 'test_client_id'};
        sandbox.__fetchRouter = fullSuccessRouter;
        sandbox.location.search = '?channel=twitchdev';
    });
    await flushAsync();
    eq(legacy.ids.has('pc-app'), false, 'no visualViewport: the app element is left to the stylesheet');
});

(async () => {
    for (const section of asyncSections) {
        try {
            await section();
        } catch (e) {
            failed++;
            console.log('FAIL: async section threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
        }
    }

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
})();
