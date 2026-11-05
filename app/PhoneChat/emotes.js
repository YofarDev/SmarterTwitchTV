/*
 * SPTV phone chat - emote providers (Twitch, BTTV, FFZ, 7TV).
 *
 * Part of the standalone phone page bundle (app/PhoneChat/), NOT the TV app.
 * ES5 only. Depends on: PhoneChatConfig (app/general/PhoneChatConfig.js).
 *
 * Normalization contract for every emote record:
 *   { provider, id, code, scope ('global'|'channel'), url, srcset, zeroWidth }
 * Emote identity is (provider + id); code is just a name and may collide.
 *
 * Deterministic collision policy (used for BOTH rendering and picker
 * insertion): Twitch ranges tagged on an incoming message always win; for
 * third-party codes, channel scope beats global scope, then within a scope
 * the precedence is 7TV > BTTV > FFZ. This order is applied by
 * buildResolver(), never by asynchronous response arrival order.
 */

var SPTVPhoneChat = {
    version: '1.0.0'
};

SPTVPhoneChat.Emotes = (function () {
    //Only HTTPS images from the providers' known CDN hosts are allowed
    var SafeHosts = ['static-cdn.jtvnw.net', 'cdn.betterttv.net', 'cdn.frankerfacez.com', 'cdn.7tv.app'];

    var BttvBase = 'https://cdn.betterttv.net/emote/';

    function isSafeImageUrl(url) {
        if (typeof url !== 'string' || !url) return null;

        var candidate = url.indexOf('//') === 0 ? 'https:' + url : url;

        if (candidate.indexOf('https://') !== 0) return null;

        var rest = candidate.slice('https://'.length);
        var slash = rest.indexOf('/');
        var host = slash > -1 ? rest.slice(0, slash).toLowerCase() : '';
        var path = slash > -1 ? rest.slice(slash) : '';

        if (SafeHosts.indexOf(host) === -1) return null;
        if (!path || path.indexOf('//') > -1) return null;

        return candidate;
    }

    function srcsetJoin(entries) {
        var out = '',
            i,
            len = entries.length;

        for (i = 0; i < len; i++) {
            if (i) out += ',';
            out += entries[i][0] + ' ' + entries[i][1];
        }

        return out;
    }

    /*
     * Helix emote objects (chat/emotes/global, chat/emotes/user, chat/emotes?broadcaster_id):
     * { id, name, format: [...], scale: [...], theme_mode: [...],
     *   images: { url_1x, url_2x, url_4x } }
     */
    function normalizeTwitch(list, scope) {
        var out = [],
            i,
            len = list && list.length ? list.length : 0,
            emote,
            url,
            entries;

        for (i = 0; i < len; i++) {
            emote = list[i];

            if (!emote || !emote.id || !emote.name || typeof emote.name !== 'string') continue;

            url = emote.images && emote.images.url_4x ? emote.images.url_4x : null;
            if (url) url = url.replace('http://', 'https://').replace('/light/', '/dark/');
            url = isSafeImageUrl(url);

            if (!url) continue;

            entries = [];
            if (emote.images && emote.images.url_1x)
                entries.push([emote.images.url_1x.replace('http://', 'https://').replace('/light/', '/dark/'), '1x']);
            if (emote.images && emote.images.url_2x)
                entries.push([emote.images.url_2x.replace('http://', 'https://').replace('/light/', '/dark/'), '2x']);
            entries.push([url, '4x']);

            out.push({
                provider: 'twitch',
                id: emote.id,
                code: emote.name,
                scope: scope,
                url: url,
                srcset: srcsetJoin(entries),
                zeroWidth: false
            });
        }

        return out;
    }

    /*
     * Get User Emotes (chat/emotes/user): entries carry NO per-emote images.
     * The response has a TOP-LEVEL template, e.g.
     *   https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}
     * Variant values are documented as: format 'static'|'animated',
     * theme_mode 'light'|'dark', scale '1.0'|'2.0'|'3.0' (DECIMAL strings in
     * the URL, '/2' is a 404). Each emote lists its own format/scale/
     * theme_mode arrays; only those variants may be substituted. Reduced
     * motion prefers the static format when the emote provides one.
     */
    function twitchTemplateUrl(template, id, format, theme, scale) {
        return isSafeImageUrl(
            template
                .replace(/\{\{id\}\}/g, encodeURIComponent(id))
                .replace(/\{\{format\}\}/g, format)
                .replace(/\{\{theme_mode\}\}/g, theme)
                .replace(/\{\{scale\}\}/g, scale)
        );
    }

    //Accept legacy bare scales too; the documented response uses decimals.
    function twitchScaleUrlValue(scale) {
        var value = String(scale);
        return value.indexOf('.') > -1 ? value : value + '.0';
    }

    function normalizeTwitchUserEmotes(list, template, scope, preferStatic) {
        var out = [],
            i,
            len = list && list.length ? list.length : 0,
            emote,
            formats,
            format,
            themes,
            theme,
            scales,
            entries,
            url,
            bestScale,
            scaleNum,
            k,
            scaled;

        if (!template || typeof template !== 'string' || template.indexOf('{{id}}') === -1) return out;

        for (i = 0; i < len; i++) {
            emote = list[i];

            if (!emote || !emote.id || !emote.name || typeof emote.name !== 'string') continue;

            formats = emote.format && emote.format.length ? emote.format : ['static'];
            if (preferStatic && formats.indexOf('static') > -1) format = 'static';
            else if (formats.indexOf('animated') > -1) format = 'animated';
            else format = formats[0];

            themes = emote.theme_mode && emote.theme_mode.length ? emote.theme_mode : ['dark'];
            theme = themes.indexOf('dark') > -1 ? 'dark' : themes[0];

            scales = emote.scale && emote.scale.length ? emote.scale : ['1', '2'];

            entries = [];
            url = null;
            bestScale = -1;

            for (k = 0; k < scales.length; k++) {
                scaled = twitchTemplateUrl(template, emote.id, format, theme, twitchScaleUrlValue(scales[k]));
                if (!scaled) continue;

                entries.push([scaled, scales[k] + 'x']);

                scaleNum = parseFloat(scales[k]);
                if (scaleNum > bestScale) {
                    bestScale = scaleNum;
                    url = scaled;
                }
            }

            if (!url) continue;

            out.push({
                provider: 'twitch',
                id: emote.id,
                code: emote.name,
                scope: scope,
                url: url,
                srcset: srcsetJoin(entries),
                zeroWidth: false
            });
        }

        return out;
    }

    //BTTV channel response carries channelEmotes and sharedEmotes; global is a flat array
    function normalizeBttv(list, scope) {
        var out = [],
            i,
            len = list && list.length ? list.length : 0,
            emote,
            url,
            entries;

        for (i = 0; i < len; i++) {
            emote = list[i];

            if (!emote || !emote.id || !emote.code || typeof emote.code !== 'string') continue;

            url = isSafeImageUrl(BttvBase + emote.id + '/3x');
            if (!url) continue;

            entries = [
                [BttvBase + emote.id + '/1x', '1x'],
                [BttvBase + emote.id + '/2x', '2x'],
                [url, '3x']
            ];

            out.push({
                provider: 'bttv',
                id: emote.id,
                code: emote.code,
                scope: scope,
                url: url,
                srcset: srcsetJoin(entries),
                zeroWidth: false
            });
        }

        return out;
    }

    /*
     * FFZ: global response is { default_sets: [...], sets: { key: { emoticons: [...] } } },
     * channel (room) response is { room: {...}, sets: {...} }. The GLOBAL response
     * also lists non-default sets, which must NOT be loaded as global emotes:
     * only default_sets are. Emoticon urls may be protocol-relative; image
     * sizes are keys '1', '2', '4'.
     */
    function normalizeFfz(data, scope) {
        var out = [],
            sets = data && data.sets ? data.sets : null,
            defaultOnly = null,
            keys,
            key,
            emoticons,
            i,
            len,
            j,
            lenJ,
            emoticon,
            url,
            entries;

        if (!sets) return out;

        if (scope === 'global' && data.default_sets && data.default_sets.length) {
            defaultOnly = {};
            for (i = 0, len = data.default_sets.length; i < len; i++) defaultOnly['' + data.default_sets[i]] = true;
        }

        keys = Object.keys(sets);

        for (i = 0, len = keys.length; i < len; i++) {
            key = keys[i];
            if (defaultOnly && !defaultOnly[key]) continue;

            emoticons = sets[key] && sets[key].emoticons;
            if (!emoticons || !emoticons.length) continue;

            for (j = 0, lenJ = emoticons.length; j < lenJ; j++) {
                emoticon = emoticons[j];

                if (!emoticon || !emoticon.id || !emoticon.name || typeof emoticon.name !== 'string') continue;
                if (!emoticon.urls || typeof emoticon.urls !== 'object') continue;

                url = isSafeImageUrl(emoticon.urls['4'] || emoticon.urls['2'] || emoticon.urls['1']);
                if (!url) continue;

                entries = [];
                if (emoticon.urls['1'])
                    entries.push([emoticon.urls['1'].indexOf('//') === 0 ? 'https:' + emoticon.urls['1'] : emoticon.urls['1'], '1x']);
                if (emoticon.urls['2'])
                    entries.push([emoticon.urls['2'].indexOf('//') === 0 ? 'https:' + emoticon.urls['2'] : emoticon.urls['2'], '2x']);

                out.push({
                    provider: 'ffz',
                    id: '' + emoticon.id,
                    code: emoticon.name,
                    scope: scope,
                    url: url,
                    srcset: srcsetJoin(entries),
                    zeroWidth: false
                });
            }
        }

        return out;
    }

    /*
     * 7TV: global response is { emotes: [...] }, channel response is
     * { emote_set: { emotes: [...] } } (may be missing). Emote:
     * { id, name, data: { name, flags, host: { url, files: [{ name, format }] } } }
     * host.url is protocol-relative; file names look like '1x.webp'.
     * Zero-width is flag BIT 256 (flags is a bitmask: combined flags like 257
     * are also zero-width). Same constant the TV app verifies in ChatLive.js.
     */
    var SevenTvZeroWidthFlag = 256;

    function sevenTvEmoteList(data, scope) {
        if (scope === 'global') return data && data.emotes ? data.emotes : [];
        if (data && data.emote_set && data.emote_set.emotes) return data.emote_set.emotes;
        return [];
    }

    function normalizeSevenTv(data, scope, preferStatic) {
        var out = [],
            list = sevenTvEmoteList(data, scope),
            //WEBP may be animated; PNG is always static, so it leads when the
            //user prefers reduced motion. Deterministic: never arrival order.
            formatOrder = preferStatic ? ['PNG', 'WEBP', 'AVIF', 'GIF'] : ['WEBP', 'AVIF', 'GIF', 'PNG'],
            i,
            len = list.length,
            item,
            info,
            file,
            hostUrl,
            fileUrl,
            entries,
            url,
            k,
            lenK,
            f,
            lenF,
            bestScale,
            bestUrl,
            scaleNum;

        for (i = 0; i < len; i++) {
            item = list[i];
            info = item && item.data;

            if (!info || !info.name || !info.host || !info.host.url || !info.host.files) continue;

            hostUrl = info.host.url;
            if (hostUrl.indexOf('//') === 0) hostUrl = 'https:' + hostUrl;

            entries = [];
            url = null;

            //srcset gets every safe file; the primary url comes from the
            //preferred format at its largest available scale
            for (f = 0, lenF = formatOrder.length; f < lenF; f++) {
                bestScale = -1;
                bestUrl = null;

                for (k = 0, lenK = info.host.files.length; k < lenK; k++) {
                    file = info.host.files[k];
                    if (!file || !file.name || file.format !== formatOrder[f]) continue;

                    fileUrl = isSafeImageUrl(hostUrl + '/' + file.name);
                    if (!fileUrl) continue;

                    entries.push([fileUrl, file.name.split('.')[0]]);

                    scaleNum = parseInt(file.name.split('.')[0], 10);
                    if (!isNaN(scaleNum) && scaleNum > bestScale) {
                        bestScale = scaleNum;
                        bestUrl = fileUrl;
                    }
                }

                if (bestUrl && !url) url = bestUrl;
                if (url) break; //a preferred-format url was found
            }

            if (!url) continue;

            out.push({
                provider: 'seven_tv',
                id: item.id,
                code: item.name,
                scope: scope,
                url: url,
                srcset: srcsetJoin(entries),
                zeroWidth: ((info.flags || 0) & SevenTvZeroWidthFlag) !== 0,
                alias: item.data.name && item.data.name !== item.name ? item.data.name : null
            });
        }

        return out;
    }

    /*
     * Build the code -> emote resolver from precedence-ordered record lists.
     * First occurrence of a code wins, so callers pass lists already ordered:
     * channel sets before global sets, and 7TV before BTTV before FFZ within
     * a scope. Zero-width (overlay) records resolve too, the renderer decides
     * whether an overlay attaches to a preceding emote, but they never
     * DISPLACE a normal emote that claimed the code first.
     */
    function buildResolver(lists) {
        var byCode = {},
            byTwitchId = {},
            all = [],
            i,
            len,
            j,
            lenJ,
            record;

        for (i = 0, len = lists.length; i < len; i++) {
            for (j = 0, lenJ = lists[i] ? lists[i].length : 0; j < lenJ; j++) {
                record = lists[i][j];

                if (!record || !record.code) continue;

                all.push(record);

                if (byCode.hasOwnProperty(record.code)) continue;

                byCode[record.code] = record;

                if (record.provider === 'twitch' && !byTwitchId.hasOwnProperty(record.id)) byTwitchId[record.id] = record;
            }
        }

        return {
            resolve: function (code) {
                return byCode.hasOwnProperty(code) ? byCode[code] : null;
            },
            //Twitch emote id -> record (for alt text on range-rendered emotes)
            resolveTwitchId: function (id) {
                return byTwitchId.hasOwnProperty(id) ? byTwitchId[id] : null;
            },
            all: function () {
                return all;
            }
        };
    }

    return {
        isSafeImageUrl: isSafeImageUrl,
        normalizeTwitch: normalizeTwitch,
        normalizeTwitchUserEmotes: normalizeTwitchUserEmotes,
        twitchTemplateUrl: twitchTemplateUrl,
        normalizeBttv: normalizeBttv,
        normalizeFfz: normalizeFfz,
        normalizeSevenTv: normalizeSevenTv,
        buildResolver: buildResolver
    };
})();
