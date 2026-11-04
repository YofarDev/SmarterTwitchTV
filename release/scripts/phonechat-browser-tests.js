/* Browser regressions using production phone assets and mocked Twitch I/O.
 * Requires Playwright and Chrome. Run after maker.js:
 *   node release/scripts/phonechat-browser-tests.js          # generated bundle
 *   node release/scripts/phonechat-browser-tests.js --source # source page
 *   node release/scripts/phonechat-browser-tests.js --android # running Android emulator + Chrome
 * SPTV_PLAYWRIGHT_PATH can point to an existing Playwright installation.
 * SPTV_ANDROID_SERIAL can select a specific test device. No real OAuth or messages are sent.
 */
const http = require('http'),
    fs = require('fs'),
    path = require('path'),
    assert = require('assert/strict');
const {chromium, _android} = require(process.env.SPTV_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '../..');
const sourceMode = process.argv.includes('--source');
const androidMode = process.argv.includes('--android');
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let file;
    if (url.pathname === '/chat/') file = sourceMode ? 'app/PhoneChat/index.html' : 'release/phonechat-assets/phonechat/index.html';
    else if (url.pathname.startsWith('/chat/')) file = 'release/phonechat-assets/phonechat/' + path.basename(url.pathname);
    else if (/^\/app\/(PhoneChat\/[a-z.]+|thirdparty\/irc-message.js|general\/PhoneChatConfig.js)$/.test(url.pathname)) file = url.pathname.slice(1);
    else {
        res.writeHead(404);
        return res.end();
    }
    let content = fs.readFileSync(path.join(root, file), 'utf8');
    if (sourceMode && file.endsWith('index.html')) content = content.replace('<head>', '<head><base href="/app/PhoneChat/">');
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript');
    res.end(content);
});
(async () => {
    await new Promise(r => server.listen(8978, '127.0.0.1', r));
    let browser,
        device,
        context,
        devices = [];
    try {
        if (androidMode) {
            devices = await _android.devices();
            device = devices.find(d =>
                process.env.SPTV_ANDROID_SERIAL ? d.serial() === process.env.SPTV_ANDROID_SERIAL : d.serial().startsWith('emulator-')
            );
            if (!device) throw new Error('Start an Android emulator with Chrome or set SPTV_ANDROID_SERIAL.');
            context = await device.launchBrowser({args: ['--no-first-run'], hasTouch: true});
        } else {
            browser = await chromium.launch({channel: 'chrome', headless: true});
            context = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, deviceScaleFactor: 1});
        }
        await context.addInitScript(run => {
            if (localStorage.getItem('sptv_fixture_run') !== run) {
                localStorage.removeItem('sptv_phone_muted');
                localStorage.setItem('sptv_fixture_run', run);
            }
            const scopes = ['chat:read', 'chat:edit', 'user:read:emotes'];
            sessionStorage.setItem(
                'sptv_phone_chat_session',
                JSON.stringify({token: 'fixture-token', login: 'myuser', userId: 'u1', scopes, expiresAt: Date.now() + 3600000})
            );
            window.fixture = {sockets: []};
            window.fetch = async url => {
                url = String(url);
                let value = {},
                    status = 200;
                if (url === '/chat/state') value = {channel: 'twitchdev'};
                else if (url.includes('oauth2/validate'))
                    value = {client_id: '10b45vistuje4pezdfzwnymdlxs579', user_id: 'u1', login: 'myuser', scopes, expires_in: 3600};
                else if (url.includes('helix/users?')) value = {data: [{id: '141981764', login: 'twitchdev', display_name: 'TwitchDev'}]};
                else if (url.includes('helix/')) value = {data: [], pagination: {}};
                else status = 404;
                return new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
            };
            window.WebSocket = function () {
                this.readyState = 0;
                fixture.sockets.push(this);
                setTimeout(() => {
                    this.readyState = 1;
                    this.onopen();
                    this.onmessage({data: ':tmi.twitch.tv 001 myuser :Welcome\r\n'});
                }, 0);
            };
            window.WebSocket.prototype.send = function (data) {
                if (data.startsWith('JOIN ')) setTimeout(() => this.onmessage({data: ':myuser!myuser@host JOIN #twitchdev\r\n'}), 0);
            };
            window.WebSocket.prototype.close = function () {
                this.readyState = 3;
            };
            fixture.emit = (id, login, text, badges = 'vip/1') =>
                fixture.sockets
                    .at(-1)
                    .onmessage({
                        data:
                            '@id=' +
                            id +
                            ';user-id=' +
                            login +
                            ';badges=' +
                            badges +
                            ';display-name=' +
                            login +
                            ' :' +
                            login +
                            '!' +
                            login +
                            '@host PRIVMSG #twitchdev :' +
                            text +
                            '\r\n'
                    });
            fixture.raw = data => fixture.sockets.at(-1).onmessage({data: data + '\r\n'});
        }, String(Date.now()));
        const page = await context.newPage(),
            errors = [];
        page.on('pageerror', e => errors.push(e.message));
        const origin = androidMode ? 'http://10.0.2.2:8978' : 'http://127.0.0.1:8978';
        await page.goto(origin + '/chat/#pair=' + 'a'.repeat(64));
        await page.locator('#pc-connection.pc-ok').waitFor();
        assert.equal(await page.locator('#pc-muted-button').textContent(), 'Muted (0)');
        await page.locator('#pc-muted-button').tap();
        await page.getByText('No muted users.', {exact: false}).waitFor();
        await page.locator('#pc-muted-close').tap();
        await page.evaluate(() => {
            fixture.emit('s1', 'spammer', 'Repeated offer');
            fixture.emit('h1', 'human', 'Normal conversation');
            fixture.emit('s2', 'spammer', 'Repeated offer');
        });
        assert.equal(await page.locator('.pc-msg').count(), 2);
        assert.match(await page.locator('[data-id=s1]').textContent(), /\(x2\)/);
        await page.evaluate(() => fixture.raw('@target-msg-id=s2 :tmi.twitch.tv CLEARMSG #twitchdev :Repeated offer'));
        assert.equal(await page.locator('[data-id=s1]').textContent(), 'message deleted');
        await page.evaluate(() => fixture.emit('s3', 'spammer', 'New offer'));
        await page.locator('[data-id=s3] button.pc-user').tap();
        await page.locator('#pc-row-menu-mute').waitFor();
        assert.equal(await page.locator('#pc-row-menu-title').textContent(), 'Mute spammer');
        await page.locator('#pc-row-menu-mute').tap();
        assert.equal(await page.locator('[data-login=spammer]').count(), 0);
        await page.evaluate(() => fixture.emit('s4', 'spammer', 'Hidden offer'));
        assert.equal(await page.locator('[data-login=spammer]').count(), 0);
        await page.locator('#pc-chat-priority').tap();
        assert.equal(await page.locator('[data-login=spammer]').count(), 0);
        assert.equal(await page.locator('[data-id=h1]').isVisible(), true);
        await page.reload();
        await page.locator('#pc-connection.pc-ok').waitFor();
        assert.equal(await page.locator('#pc-muted-button').textContent(), 'Muted (1)');
        await page.evaluate(() => fixture.emit('s5', 'spammer', 'Still hidden'));
        assert.equal(await page.locator('[data-login=spammer]').count(), 0);
        await page.locator('#pc-muted-button').tap();
        await page.locator('[data-unmute=spammer]').tap();
        await page.locator('#pc-muted-close').tap();
        await page.evaluate(() => {
            fixture.emit('h2', 'human', 'Hold this message');
            fixture.emit('own', 'myuser', 'My message');
        });
        assert.equal(await page.locator('[data-id=own] button.pc-user').count(), 0);
        const cdp = await context.newCDPSession(page),
            bounds = await page.locator('[data-id=h2] .pc-text').boundingBox();
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: bounds.x + 10, y: bounds.y + 10}]});
        await page.locator('#pc-row-menu-mute').waitFor();
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        assert.equal(await page.locator('#pc-row-menu').isVisible(), true);
        await page.locator('#pc-row-menu-cancel').tap();
        // A scroll gesture must not open actions.
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: bounds.x + 10, y: bounds.y + 10}]});
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: bounds.x + 10, y: bounds.y + 65}]});
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        await page.waitForTimeout(550);
        assert.equal(await page.locator('#pc-row-menu').isVisible(), false);
        await page.setViewportSize(androidMode ? {width: 412, height: 811} : {width: 320, height: 568});
        await page.locator('[data-id=h2] button.pc-user').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#pc-row-menu').isVisible(), true);
        await page.screenshot({
            path: path.join(
                require('os').tmpdir(),
                'sptv-phone-' + (androidMode ? 'android' : 'chrome') + '-' + (sourceMode ? 'source' : 'built') + '.png'
            )
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
        console.log(
            JSON.stringify({
                platform: androidMode ? 'Android 14 Chrome' : 'Chrome mobile viewport',
                bundle: sourceMode ? 'source' : 'built',
                checks: 'tap/keyboard mute, persistence, unmute, priority tab, interleaved spam, deletion, long press and scrolling, narrow layout',
                errors
            })
        );
    } finally {
        if (context) await context.close();
        if (browser) await browser.close();
        for (const candidate of devices) await candidate.close();
        server.close();
    }
})().catch(e => {
    console.error(e.stack);
    server.close();
    process.exitCode = 1;
});
