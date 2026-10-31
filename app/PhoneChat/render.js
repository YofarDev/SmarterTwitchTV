/*
 * SPTV phone chat - safe message rendering and bounded history.
 *
 * Part of the standalone phone page bundle (app/PhoneChat/), NOT the TV app.
 * ES5 only. Depends on: SPTVPhoneChat.Emotes.
 *
 * Safety rules:
 * - All text (channel names, usernames, message text, notices) goes into the
 *   DOM through text nodes / textContent. Raw remote HTML is never assigned.
 * - Images are only created from URLs that pass the emote URL safety check
 *   (HTTPS + known provider CDN hosts); every image has emote-code alt text
 *   and a text fallback if loading fails.
 * - User colors are validated against a strict #rgb/#rrggbb pattern; unknown
 *   values fall back to the default color instead of becoming CSS.
 *
 * The segment/store logic is DOM-free and covered by the Node assertion
 * harness (release/scripts/phonechat-tests.js).
 */

SPTVPhoneChat.Render = (function () {
    var HistoryLimit = 300;

    //Unicode code point <-> string helpers (Twitch emote ranges use code points,
    //while JS string indices are UTF-16 units). Same approach as the TV app's punycode.ucs2 use.
    function ucs2Decode(value) {
        var out = [],
            counter = 0,
            length = value.length,
            valueChar,
            extra;

        while (counter < length) {
            valueChar = value.charCodeAt(counter++);
            if (valueChar >= 0xd800 && valueChar <= 0xdbff && counter < length) {
                extra = value.charCodeAt(counter++);
                if ((extra & 0xfc00) === 0xdc00) {
                    out.push(((valueChar & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
                } else {
                    out.push(valueChar, extra);
                }
            } else {
                out.push(valueChar);
            }
        }

        return out;
    }

    function ucs2Encode(value) {
        var out = '',
            i,
            len = value.length,
            codePoint;

        for (i = 0; i < len; i++) {
            codePoint = value[i];

            if (codePoint > 0xffff) {
                codePoint -= 0x10000;
                out += String.fromCharCode((codePoint >>> 10) + 0xd800, (codePoint & 0x3ff) + 0xdc00);
            } else {
                out += String.fromCharCode(codePoint);
            }
        }

        return out;
    }

    //Parse the IRC 'emotes' tag into { emoteId: [[start, end], ...] } (code points). Null when absent.
    function parseTwitchRanges(raw) {
        if (typeof raw !== 'string' || !raw.length) return null;

        var out = {},
            groups = raw.split('/'),
            i,
            len = groups.length,
            group,
            ranges,
            j,
            lenJ,
            bounds,
            id;

        for (i = 0; i < len; i++) {
            group = groups[i].split(':');
            if (group.length !== 2 || !group[0]) continue;

            id = group[0];
            ranges = group[1].split(',');
            out[id] = [];

            for (j = 0, lenJ = ranges.length; j < lenJ; j++) {
                bounds = ranges[j].split('-');
                if (bounds.length !== 2) continue;
                out[id].push([parseInt(bounds[0], 10), parseInt(bounds[1], 10)]);
            }
        }

        return out;
    }

    /*
     * Attach zero-width (7TV overlay) emotes to their base emote. An overlay
     * attaches to the most recent NON-overlay emote when only whitespace
     * separates them (users type "base overlay"); attached overlays move onto
     * the base segment as .overlays and the overlay segment is dropped. An
     * orphan overlay (no preceding base) stays a standalone segment and the
     * DOM layer renders it inline as a safe fallback.
     * Overlay state lives on the SEGMENT (per-message objects), never on the
     * shared resolver records.
     */
    function attachOverlays(segments) {
        var lastBase = -1,
            i,
            len = segments.length,
            j,
            onlySpace;

        for (i = 0; i < len; i++) {
            if (segments[i].type !== 'emote') continue;

            if (!segments[i].emote.zeroWidth) {
                lastBase = i;
                continue;
            }

            onlySpace = lastBase > -1;

            for (j = lastBase + 1; j < i; j++) {
                if (segments[j].drop) continue; //an already-attached overlay: part of the base
                if (segments[j].type !== 'text' || segments[j].text.replace(/\s/g, '').length) {
                    onlySpace = false;
                    break;
                }
            }

            if (onlySpace) {
                if (!segments[lastBase].overlays) segments[lastBase].overlays = [];
                segments[lastBase].overlays.push(segments[i].emote);
                segments[i].drop = true;
            }
        }

        return segments.filter(function (segment) {
            return !segment.drop;
        });
    }

    /*
     * Build display segments from message text.
     * - Twitch ranges (code points over the visible text) always win and are
     *   applied first; a range that falls out of bounds is ignored defensively.
     * - Remaining text runs are tokenized on spaces; each whole token is
     *   matched case-sensitively against the third-party emote resolver
     *   (zero-width overlay codes included; see attachOverlays).
     * Returns [{ type: 'text'|'emote', text?, emote?, overlays? }, ...]
     */
    function buildSegments(text, emotesTag, resolver) {
        var segments = [],
            codePoints = ucs2Decode(text),
            ranges = parseTwitchRanges(emotesTag),
            flat = [],
            id,
            i,
            len,
            bounds;

        if (ranges) {
            for (id in ranges) {
                if (ranges.hasOwnProperty(id)) {
                    for (i = 0, len = ranges[id].length; i < len; i++) {
                        bounds = ranges[id][i];
                        flat.push({start: bounds[0], end: bounds[1], id: id});
                    }
                }
            }

            //Apply from the end of the text backwards so earlier indices stay valid while splicing
            flat.sort(function (a, b) {
                return b.start - a.start;
            });
        }

        var cursor = codePoints.length,
            segment;

        function pushText(cpStart, cpEnd) {
            if (cpEnd <= cpStart) return;
            segments.unshift({type: 'text', text: ucs2Encode(codePoints.slice(cpStart, cpEnd))});
        }

        for (i = 0, len = flat.length; i < len; i++) {
            bounds = flat[i];

            if (bounds.start < 0 || bounds.end >= cursor || bounds.end < bounds.start) continue;

            pushText(bounds.end + 1, cursor);
            segments.unshift({type: 'emote', emote: {provider: 'twitch', id: bounds.id, code: null, url: null}});
            cursor = bounds.start;
        }

        pushText(0, cursor);

        //Tokenize text segments against third-party emote codes
        if (resolver) {
            var result = [];

            for (i = 0, len = segments.length; i < len; i++) {
                segment = segments[i];

                if (segment.type !== 'text') {
                    if (segment.type === 'emote' && segment.emote.provider === 'twitch' && resolver.resolveTwitchId) {
                        var twitchRecord = resolver.resolveTwitchId(segment.emote.id);
                        if (twitchRecord) {
                            segment.emote.code = twitchRecord.code;
                            segment.emote.url = twitchRecord.url;
                            segment.emote.srcset = twitchRecord.srcset;
                        }
                    }
                    result.push(segment);
                    continue;
                }

                result.push.apply(result, tokenizeText(segment.text, resolver));
            }

            return attachOverlays(result);
        }

        return segments;
    }

    function tokenizeText(text, resolver) {
        var out = [],
            tokens = text.split(' '),
            i,
            len = tokens.length,
            emote;

        for (i = 0; i < len; i++) {
            if (tokens[i].length) {
                emote = resolver.resolve(tokens[i]);

                if (emote && emote.provider !== 'twitch') out.push({type: 'emote', emote: emote});
                else out.push({type: 'text', text: tokens[i]});
            }

            if (i !== len - 1) out.push({type: 'text', text: ' '});
        }

        return out;
    }

    function isValidUserColor(color) {
        return typeof color === 'string' && (/^#[0-9a-fA-F]{3}$/.test(color) || /^#[0-9a-fA-F]{6}$/.test(color));
    }

    //Use exact IRC badge tokens, independently of downloaded badge artwork.
    function messageRoles(badges, login) {
        var tokens = typeof badges === 'string' ? badges.split(',') : [],
            partner = tokens.indexOf('partner/1') !== -1 || tokens.indexOf('verified/1') !== -1,
            privileged = partner || tokens.indexOf('vip/1') !== -1 || tokens.indexOf('moderator/1') !== -1,
            //Exact account logins only: never hide a human whose name contains a bot name.
            bots = ['nightbot', 'streamelements', 'wizebot', 'wisebot', 'moobot', 'fossabot'],
            bot = bots.indexOf(String(login || '').toLowerCase()) !== -1;

        return {partner: partner, priority: privileged && !bot};
    }

    /*
     * Bounded message history store. Keeps at most HistoryLimit entries and a
     * separate bounded id->state index used for dedup and deletion (the id
     * tracking list is capped at twice the history limit).
     *
     * Index values: true = seen, false = deleted (tombstone). A DELETED id
     * still counts as SEEN: Twitch may deliver a message more than once, so a
     * replayed PRIVMSG for a tombstoned id must be suppressed, not restored.
     * A deletion can even arrive BEFORE its message (out of order): the
     * tombstone is recorded so the late delivery is dropped too. Both states
     * expire together through the bounded tracking window.
     */
    function createStore(limit) {
        var messages = [],
            byId = {},
            idOrder = [];

        function trackId(id) {
            idOrder.push(id);
            if (idOrder.length > (limit || HistoryLimit) * 2) {
                //Evict the OLDEST tracked id unconditionally: keeping entries
                //whose value is true (ordinary ids) leaked every message id
                //for the lifetime of chat. Tombstones expire the same way.
                delete byId[idOrder.shift()];
            }
        }

        return {
            messages: messages,
            //Returns { appended: true, duplicate: bool, pruned: n } — ids already
            //seen (including deleted) are duplicates and are not appended
            append: function (entry) {
                var pruned = 0,
                    duplicate = false;

                if (entry.id) {
                    duplicate = byId.hasOwnProperty(entry.id);

                    if (duplicate) return {appended: false, duplicate: true, pruned: 0};

                    byId[entry.id] = entry;
                    trackId(entry.id);
                }

                messages.push(entry);

                if (messages.length > (limit || HistoryLimit)) {
                    messages.shift();
                    pruned = 1;
                }

                return {appended: true, duplicate: false, pruned: pruned};
            },
            //True when the id was seen — including deleted: callers use this
            //to suppress duplicates and replays of removed messages
            has: function (id) {
                return byId.hasOwnProperty(id);
            },
            //Merged messages retain their displayed row id for moderation.
            get: function (id) {
                return byId.hasOwnProperty(id) ? byId[id] || null : null;
            },
            //Mark a message id as deleted (tombstone). Works before delivery too.
            markDeleted: function (id) {
                var existed = byId.hasOwnProperty(id);

                byId[id] = false;
                if (!existed) trackId(id); //keep the out-of-order tombstone bounded

                return true;
            }
        };
    }

    return {
        HistoryLimit: HistoryLimit,
        ucs2Decode: ucs2Decode,
        ucs2Encode: ucs2Encode,
        parseTwitchRanges: parseTwitchRanges,
        buildSegments: buildSegments,
        attachOverlays: attachOverlays,
        tokenizeText: tokenizeText,
        isValidUserColor: isValidUserColor,
        messageRoles: messageRoles,
        createStore: createStore
    };
})();

/*
 * DOM helpers (browser only; not exercised by the Node harness).
 * Attached below so the pure logic above stays load-safe without a document.
 */
SPTVPhoneChat.Dom = {
    //Text fallback when an emote image fails to load (no outer-scope references,
    //so it is safe to create inside loops)
    emoteFallback: function (node) {
        return function () {
            node.onerror = null;
            node.parentNode.replaceChild(node.ownerDocument.createTextNode(node.alt || ''), node);
        };
    },

    buildMessageContent: function (segments, documentRef) {
        var fragment = documentRef.createDocumentFragment(),
            i,
            len = segments.length,
            segment,
            img,
            k,
            lenK,
            holder,
            textNode;

        function makeEmoteImage(emote, extraClass) {
            var node = documentRef.createElement('img');

            node.className = 'pc-emote' + (extraClass ? ' ' + extraClass : '');
            node.alt = emote.code || emote.id;

            if (emote.url) {
                node.setAttribute('srcset', emote.srcset || '');
                node.setAttribute('src', emote.url);
            } else {
                //Twitch range emotes have a predictable template URL; a missing URL falls back to the id
                node.setAttribute('src', 'https://static-cdn.jtvnw.net/emoticons/v2/' + encodeURIComponent(emote.id) + '/default/dark/2.0');
            }

            node.onerror = SPTVPhoneChat.Dom.emoteFallback(node);

            return node;
        }

        for (i = 0; i < len; i++) {
            segment = segments[i];

            if (segment.type === 'text') {
                textNode = documentRef.createTextNode(segment.text);
                fragment.appendChild(textNode);
            } else if (segment.type === 'emote') {
                if (segment.overlays && segment.overlays.length) {
                    //Base emote with one or more zero-width overlays stacked on it
                    holder = documentRef.createElement('span');
                    holder.className = 'pc-emote-wrap';
                    holder.appendChild(makeEmoteImage(segment.emote, null));

                    for (k = 0, lenK = segment.overlays.length; k < lenK; k++) {
                        img = makeEmoteImage(segment.overlays[k], 'pc-emote-overlay');
                        holder.appendChild(img);
                    }

                    fragment.appendChild(holder);
                } else {
                    //Orphan zero-width overlays render inline as a safe fallback
                    fragment.appendChild(makeEmoteImage(segment.emote, null));
                }
            }
        }

        return fragment;
    }
};
