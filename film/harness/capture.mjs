// Showcase-film capture harness: plays one scripted remote-control run of the real
// web app (app/index.html) in Chrome and logs what the edit needs.
//
//   node film/harness/capture.mjs --run <name> --out <dir> [--video <file.mp4>]
//        [--mode replay|record] [--shots]
//
// Chrome runs headless at exactly 1920x1080; the footage is Chrome's own
// compositor output (CDP screencast, ~60 fps), so no display is needed: a
// full-screen window on a macOS display lands in a hidden Space.
// --video writes the 60 fps CFR recording and <file>.recstart (epoch ms of its
// first frame) next to it: the pipeline's <cap>/<tag>.mp4.
//
// --mode record  loads live Twitch data and saves it to film/work/fixtures/<run>.har
// --mode replay  (default) serves every non-local request from that HAR, never the
//                network: a request missing from the HAR is aborted and counted.
// Output (app-showcase-film layout): <out>/wow/<run>/timeline.json, frames/NNNN.rgba
// (480×270 RGBA grabs every 250 ms), plus shots/ with --shots (a PNG per step).

import {createRequire} from 'module';
import {execFileSync} from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const require = createRequire(path.join(REPO, 'package.json'));
const {chromium} = require('playwright-core');

const W = 1920;
const H = 1080;
const PXR = 0.25;
const GRAB_MS = 250;

function arg(name, def) {
    const i = process.argv.indexOf('--' + name);
    if (i < 0) return def;
    const v = process.argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : v;
}

const RUN = arg('run');
const OUT = arg('out');
const MODE = arg('mode', 'replay');
const SHOTS = !!arg('shots', false);
const VIDEO = arg('video');
const HAR = path.join(REPO, 'film/work/fixtures', RUN + '.har');

// ---------------------------------------------------------------- run scripts
// A step: {k: key, t: ms to wait after, ev: event logged on the press, shot: name}
// or {wait: ms, ev}, or {type: text, every: ms} (logs typeStart/typeEnd).
const toBrowse = [
    {ev: 'boot', wait: 1500},
    {k: 'ArrowRight', t: 400},
    {k: 'Enter', t: 2500, ev: 'browse', shot: 'browse'}
];

const RUNS = {
    browse: [
        ...toBrowse,
        {wait: 1000, ev: 'glideStart'},
        {k: 'ArrowRight', t: 650, ev: 'focus'},
        {k: 'ArrowRight', t: 650, ev: 'focus'},
        {k: 'ArrowDown', t: 900, ev: 'focus', shot: 'down'},
        {k: 'ArrowRight', t: 650, ev: 'focus'},
        {k: 'ArrowUp', t: 900, ev: 'focus'},
        {k: 'ArrowLeft', t: 650, ev: 'focus'},
        {k: 'ArrowLeft', t: 900, ev: 'focus', shot: 'end'}
    ],
    nav: [
        ...toBrowse,
        {wait: 800},
        {k: 'ArrowLeft', t: 900, ev: 'railOpen', shot: 'rail'},
        {k: 'ArrowDown', t: 450, ev: 'railMove'},
        {k: 'ArrowDown', t: 450, ev: 'railMove'},
        {k: 'ArrowUp', t: 450, ev: 'railMove'},
        {k: 'ArrowUp', t: 600, ev: 'railMove'},
        {k: 'ArrowRight', t: 900, ev: 'railClose', shot: 'closed'},
        {k: 'ArrowUp', t: 700, ev: 'tabsFocus', shot: 'tabs'},
        {k: 'ArrowRight', t: 350, ev: 'tabMove'},
        {k: 'Enter', t: 1700, ev: 'tab', shot: 'frontpage'},
        {k: 'ArrowUp', t: 400, ev: 'tabsFocus'},
        {k: 'ArrowRight', t: 350, ev: 'tabMove'},
        {k: 'Enter', t: 1700, ev: 'tab', shot: 'categories'},
        {k: 'ArrowRight', t: 700, ev: 'focus'},
        {k: 'ArrowRight', t: 700, ev: 'focus'},
        {k: 'ArrowDown', t: 1000, ev: 'focus', shot: 'grid'}
    ],
    search: [
        ...toBrowse,
        {wait: 600},
        {k: 'ArrowLeft', t: 800, ev: 'railOpen'},
        {k: 'ArrowDown', t: 450, ev: 'railMove'},
        {k: 'Enter', t: 1300, ev: 'searchOpen', shot: 'search'},
        {type: 'minecraft', every: 140, t: 700, shot: 'typed'},
        {k: 'Enter', t: 500, ev: 'typeChoice'},
        {k: 'ArrowRight', t: 350, ev: 'typeMove'},
        {k: 'ArrowRight', t: 450, ev: 'typeMove'},
        {k: 'Enter', t: 2000, ev: 'results', shot: 'results'},
        {k: 'ArrowRight', t: 750, ev: 'focus'},
        {k: 'ArrowRight', t: 750, ev: 'focus'},
        {k: 'ArrowDown', t: 1000, ev: 'focus', shot: 'end'}
    ],
    theme: [
        ...toBrowse,
        {wait: 600},
        {k: 'ArrowLeft', t: 700, ev: 'railOpen'},
        {k: 'ArrowDown', t: 220},
        {k: 'ArrowDown', t: 220},
        {k: 'ArrowDown', t: 220},
        {k: 'ArrowDown', t: 300},
        {k: 'Enter', t: 1100, ev: 'settings', shot: 'settings'},
        {k: 'ArrowDown', t: 180},
        {k: 'ArrowDown', t: 180},
        {k: 'ArrowDown', t: 180},
        {k: 'ArrowDown', t: 180},
        {k: 'ArrowDown', t: 400},
        {k: 'Enter', t: 900, ev: 'uiOptions'},
        {k: 'Enter', t: 1200, ev: 'colorDialog', shot: 'color'},
        {k: 'ArrowRight', t: 600, ev: 'style'},
        {k: 'ArrowRight', t: 900, ev: 'styleWhite', shot: 'white'},
        {k: 'ArrowDown', t: 350},
        {k: 'Enter', t: 900, ev: 'themeApplied'},
        {k: 'Escape', t: 450},
        {k: 'Escape', t: 450},
        {k: 'Escape', t: 1200, ev: 'browseLight', shot: 'light'},
        {k: 'ArrowRight', t: 650, ev: 'focus'},
        {k: 'ArrowRight', t: 650, ev: 'focus'},
        {k: 'ArrowDown', t: 1000, ev: 'focus', shot: 'end'}
    ]
};

// ---------------------------------------------------------------- static server
const TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.json': 'application/json',
    '.ico': 'image/x-icon'
};

function serve() {
    return new Promise(resolve => {
        const srv = http.createServer((q, r) => {
            const p = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
            if (!p.startsWith(REPO)) {
                r.writeHead(403);
                r.end();
                return;
            }
            fs.readFile(p, (e, d) => {
                if (e) {
                    r.writeHead(404);
                    r.end();
                    return;
                }
                r.writeHead(200, {'content-type': TYPES[path.extname(p)] || 'application/octet-stream'});
                r.end(d);
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
    if (!RUN || !RUNS[RUN] || !OUT) {
        console.error('usage: capture.mjs --run <' + Object.keys(RUNS).join('|') + '> --out <dir>');
        process.exit(2);
    }
    if (MODE === 'replay' && !fs.existsSync(HAR)) {
        console.error('Error: no fixture ' + HAR + ' (run once with --mode record)');
        process.exit(2);
    }
    const runDir = path.join(OUT, 'wow', RUN);
    fs.rmSync(runDir, {recursive: true, force: true});
    fs.mkdirSync(path.join(runDir, 'frames'), {recursive: true});
    if (SHOTS) fs.mkdirSync(path.join(runDir, 'shots'), {recursive: true});
    if (MODE === 'record') fs.mkdirSync(path.dirname(HAR), {recursive: true});

    const srv = await serve();
    const origin = 'http://127.0.0.1:' + srv.address().port;
    const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--window-size=' + W + ',' + H, '--hide-scrollbars']});
    const context = await browser.newContext({
        locale: 'en-US',
        timezoneId: 'Europe/Paris',
        viewport: {width: W, height: H},
        recordHar: MODE === 'record' ? {path: HAR, content: 'embed', urlFilter: /^https?:\/\/(?!127\.0\.0\.1)/} : undefined
    });
    const external = /^(https?|wss?):\/\/(?!127\.0\.0\.1)/;
    const misses = [];
    if (MODE === 'replay') {
        await context.routeFromHAR(HAR, {url: external, notFound: 'abort'});
        // Thumbnail URLs carry a time-based cache-bust query (?<minutes>), so a re-render
        // later in the run asks for a URL the HAR never saw: serve images by path.
        const byPath = new Map();
        for (const e of JSON.parse(fs.readFileSync(HAR, 'utf8')).log.entries) {
            const c = e.response && e.response.content;
            if (e.request.method === 'GET' && e.response.status === 200 && c && c.text && /^image\//.test(c.mimeType || '')) {
                byPath.set(e.request.url.split('?')[0], {body: Buffer.from(c.text, c.encoding === 'base64' ? 'base64' : 'utf8'), type: c.mimeType});
            }
        }
        await context.route(/static-cdn\.jtvnw\.net\/.*\?/, route => {
            const hit = byPath.get(route.request().url().split('?')[0]);
            if (hit) route.fulfill({status: 200, body: hit.body, contentType: hit.type});
            else route.fallback();
        });
        // websockets (chat) never leave the machine either
        await context.routeWebSocket(/.*/, ws => ws.close());
    }
    const page = await context.newPage();
    page.on('requestfailed', q => {
        if (external.test(q.url())) misses.push(q.url().slice(0, 160));
    });
    page.on('pageerror', e => console.log('PAGEERROR ' + String(e).slice(0, 200)));

    // the footage: every compositor frame, timestamped (epoch s), from before boot
    const cdp = await context.newCDPSession(page);
    const vdir = VIDEO ? VIDEO.replace(/\.mp4$/, '') + '.frames' : null;
    if (vdir) {
        fs.rmSync(vdir, {recursive: true, force: true});
        fs.mkdirSync(vdir, {recursive: true});
    }
    const shots = []; // [epoch ms, file]
    const writes = [];
    let latest = null; // {ms: epoch ms, data: Buffer}
    cdp.on('Page.screencastFrame', f => {
        cdp.send('Page.screencastFrameAck', {sessionId: f.sessionId}).catch(() => {});
        const data = Buffer.from(f.data, 'base64');
        const ms = f.metadata.timestamp * 1000;
        latest = {ms: ms, data: data};
        if (vdir) {
            const file = path.join(vdir, String(shots.length).padStart(6, '0') + '.jpg');
            shots.push([ms, file]);
            writes.push(fs.promises.writeFile(file, data));
        }
    });
    await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: W, maxHeight: H});
    const firstEpoch = Date.now();
    await page.goto(origin + '/app/index.html');
    await page.waitForFunction(() => document.readyState === 'complete');
    const vp = await page.evaluate(() => [innerWidth, innerHeight]);
    console.log('FILM ready run=' + RUN + ' mode=' + MODE + ' viewport=' + vp.join('x'));
    await sleep(300);

    const t0 = Date.now();
    const now = () => Date.now() - t0;
    const events = [];
    const frames = [];
    const pngs = [];
    let grabbing = true;

    // sparse grabs for the pipeline's sync: the latest screencast frame every 250 ms
    const grabLoop = (async () => {
        let next = 0;
        let last = null;
        while (grabbing) {
            const wait = next - now();
            if (wait > 0) await sleep(wait);
            if (!grabbing) break;
            if (latest) {
                // a fresh frame at its own time; an unchanged screen at the grab's time
                frames.push({i: frames.length, ms: latest !== last ? Math.round(latest.ms - t0) : now()});
                pngs.push(latest.data);
                last = latest;
            }
            next += GRAB_MS;
            if (next < now()) next = now();
        }
    })();

    const ev = (type, extra) => events.push(Object.assign({ms: now(), type: type}, extra || {}));
    let shotN = 0;
    const shot = async name => {
        if (SHOTS && name) await page.screenshot({path: path.join(runDir, 'shots', String(++shotN).padStart(2, '0') + '_' + name + '.png')});
    };

    ev('runStart');
    for (const s of RUNS[RUN]) {
        if (s.type !== undefined) {
            ev('typeStart', {text: s.type});
            for (const ch of s.type) {
                await page.keyboard.press(ch);
                ev('key', {key: ch});
                await sleep(s.every);
            }
            ev('typeEnd');
            await sleep(s.t || 0);
        } else if (s.k) {
            await page.keyboard.press(s.k);
            ev('key', {key: s.k});
            if (s.ev) ev(s.ev);
            await sleep(s.t || 500);
        } else {
            if (s.ev) ev(s.ev);
            await sleep(s.wait || 0);
        }
        await shot(s.shot);
    }
    ev('settle');
    await sleep(2500);
    ev('end');
    grabbing = false;
    await grabLoop;
    const endEpoch = Date.now();
    await cdp.send('Page.stopScreencast');
    await Promise.all(writes);

    const tl = {
        app: 'smarter-purple-tv',
        run: RUN,
        mode: MODE,
        size: [Math.round(W * PXR), Math.round(H * PXR)],
        frames: frames,
        samples: [],
        events: events,
        audio: [],
        network: {misses: misses.length, missed: misses.slice(0, 50)},
        clockStartEpochMs: t0
    };
    await context.close(); // flushes the HAR in record mode
    await browser.close();
    srv.close();

    if (vdir && shots.length) {
        // variable-rate frames → 60 fps CFR, each frame held until the next one
        const list = shots.map((sh, i) => {
            // the screencast sends nothing while the screen is still: hold the last frame to the run's end
            const next = i + 1 < shots.length ? shots[i + 1][0] : Math.max(endEpoch, sh[0] + 1000 / 60);
            return "file '" + sh[1] + "'\nduration " + ((next - sh[0]) / 1000).toFixed(6);
        });
        list.push("file '" + shots[shots.length - 1][1] + "'");
        const listFile = path.join(vdir, 'list.txt');
        fs.writeFileSync(listFile, list.join('\n') + '\n');
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-fps_mode', 'cfr', '-r', '60',
            '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', '-pix_fmt', 'yuv420p', VIDEO], {stdio: 'inherit'});
        fs.writeFileSync(VIDEO.replace(/\.mp4$/, '') + '.recstart', Math.round(shots[0][0]) + '\n');
        const dts = shots.slice(1).map((sh, i) => sh[0] - shots[i][0]).sort((x, y) => x - y);
        console.log('VIDEO ' + VIDEO + ' frames=' + shots.length + ' fps=' + ((shots.length - 1) / ((shots[shots.length - 1][0] - shots[0][0]) / 1000)).toFixed(1) +
            ' medianDt=' + dts[dts.length >> 1].toFixed(1) + ' p99Dt=' + dts[Math.floor(dts.length * 0.99)].toFixed(1) + ' clockSkewMs=' + Math.round(shots[0][0] - firstEpoch));
        fs.rmSync(vdir, {recursive: true, force: true});
    }

    // grabs → raw RGBA (what sync.py reads)
    const pngDir = path.join(runDir, 'png');
    fs.mkdirSync(pngDir, {recursive: true});
    pngs.forEach((b, i) => fs.writeFileSync(path.join(pngDir, String(i).padStart(4, '0') + '.jpg'), b));
    const size = Math.round(W * PXR) + 'x' + Math.round(H * PXR);
    execFileSync('uv', ['run', '--with', 'pillow', 'python', '-I', path.join(HERE, 'png2rgba.py'), pngDir, path.join(runDir, 'frames'), size], {
        stdio: 'inherit'
    });
    fs.rmSync(pngDir, {recursive: true, force: true});
    fs.writeFileSync(path.join(runDir, 'timeline.json'), JSON.stringify(tl, null, 1));

    console.log('WOW_DIR ' + runDir);
    console.log('LIVENESS frames=' + frames.length + ' events=' + events.length);
    if (misses.length) {
        console.log('NETWORK ' + misses.length + ' request(s) missing from the fixture (aborted):');
        misses.slice(0, 10).forEach(u => console.log('  ' + u));
    }
    console.log('All tests passed');
}

main().catch(e => {
    console.log('EXCEPTION ' + (e && e.stack ? e.stack : e));
    process.exit(1);
});
