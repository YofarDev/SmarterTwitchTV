/*
 * SPTV phone chat - page state and interaction wiring.
 *
 * Part of the standalone phone page bundle (app/PhoneChat/), NOT the TV app.
 * ES5 only. Depends on: PhoneChatConfig*, SPTVPhoneChat.{Auth,Transport,Emotes,Render}.
 *
 * UI copy lives in this file's own small English dictionary (no translation
 * pipeline for the phone page in V1).
 */

SPTVPhoneChat.App = (function () {
    var T = SPTVPhoneChat.Transport;
    var Auth = SPTVPhoneChat.Auth;
    var Emotes = SPTVPhoneChat.Emotes;
    var Render = SPTVPhoneChat.Render;
    var Local = SPTVPhoneChat.Local;

    var Strings = {
        connect: 'Connect',
        disconnect: 'Disconnect',
        reconnect: 'Reconnect',
        tryAgain: 'Try again',
        signInOut: 'Signing in...',
        stateAuthorizing: 'Signing in to Twitch...',
        stateDevicePending: 'Approve the sign-in in Twitch, then return to this tab.',
        stateDeviceExpired: 'The sign-in code expired. Connect again for a new code.',
        stateTvWaiting: 'Waiting for a live stream on your TV.',
        stateTvUnavailable: 'Cannot reach the TV. Keep SPTV open and connect both devices to the same network.',
        statePairingExpired: 'This TV pairing has expired. Scan the QR code on your TV again.',
        stateSignedOut: 'Connect your Twitch account to read and write chat.',
        stateDenied: 'Twitch authorization was denied.',
        stateAuthError: 'Sign-in could not be verified. Please connect again.',
        stateConfigMissing: 'The app owner has not configured a Twitch client ID yet, so chat connection is unavailable.',
        stateOrigin: 'This page is served from an address that is not configured for it. Connecting is disabled.',
        stateStorage: 'This browser is blocking page storage, so signing in cannot work here.',
        stateNoCrypto: 'This browser cannot create a secure sign-in (Web Crypto unavailable).',
        stateTokenInvalid: 'Your Twitch session is no longer valid.',
        stateScopeInvalid: 'The Twitch session is missing required permissions. Please connect again.',
        stateChannelMissing: 'This link is missing a valid channel. Scan the QR code shown on the TV again.',
        stateChannelNotFound: 'That channel does not exist or is not available.',
        stateConnecting: 'Connecting to chat...',
        stateReconnecting: 'Connection lost. Reconnecting...',
        stateOffline: 'You are offline. Chat resumes when the network returns.',
        stateBanned: 'You are banned in this channel.',
        stateTimeout: 'You are timed out in this channel. Sending resumes automatically.',
        stateRoomClear: 'A moderator cleared the chat.',
        roomSubsOnly: 'Room is in subscribers-only mode.',
        roomSubsOff: 'Room is no longer subscribers-only.',
        roomEmoteOnly: 'Room is in emote-only mode.',
        roomEmoteOff: 'Room is no longer emote-only.',
        roomFollowersOnly: 'Room is in followers-only mode.',
        roomFollowersOff: 'Room is no longer followers-only.',
        roomSlowOn: 'Slow mode is on: one message every %s s.',
        roomSlowOff: 'Slow mode is off.',
        connectedAs: 'Connected',
        quiet: 'Connected. Chat is quiet right now.',
        emotesLoading: 'Loading emotes...',
        emotesEmpty: 'No emotes here yet.',
        emotesError: 'This emote provider could not be loaded.',
        sendBlockedLength: 'Message is too long.',
        sendBlockedEmpty: 'Message is empty.',
        sendBlockedChars: 'Message contains unsupported control characters.',
        sendBlockedSlow: 'Slow mode: wait %s s.',
        sendBlockedOffline: 'Chat is not connected.',
        commandUnsupported: 'Slash commands are not supported on this page.',
        noticePrefix: 'Notice: ',
        deleted: 'message deleted',
        sentMark: 'submitted',
        localName: 'You',
        pickerChunks: 'Showing %n of %t emotes',
        muteAction: 'Mute %s',
        unmuteAction: 'Unmute %s',
        mute: 'Mute',
        unmute: 'Unmute',
        cancel: 'Cancel',
        mutedButton: 'Muted (%n)',
        mutedEmpty: 'No muted users. Tap a username or hold a message to mute its author.'
    };

    var ProviderLabels = {twitch: 'Twitch', bttv: 'BTTV', ffz: 'FFZ', seven_tv: '7TV'};
    var PickerChunkSize = 60;

    //Muted users are device state, not chat-session state: the list lives
    //outside S so channel changes and disconnects never clear it
    var MutedKey = 'sptv_phone_muted';
    var MutedLimit = 500;
    //Repeat messages from a user merge even when other users chat in between.
    var SpamWindowMs = 15000;
    //iOS never fires contextmenu for a touch, so message rows time their own
    //long-press; a finger drifting past the slop is a scroll, not a press
    var LongPressMs = 500;
    var LongPressSlopPx = 10;
    var mutedLogins = loadMuted();
    var rowMenuLogin = null;
    var rowTouch = null;

    var S = {
        channel: null,
        channelDisplayName: null,
        broadcasterId: null,
        session: null,
        sessionValid: false,
        transport: null,
        resolver: null,
        providers: null, //per provider {status, records}
        badges: null, //set_id -> version -> url
        ownBadges: null,
        store: null,
        localEchoes: [],
        spam: {}, //bounded latest row per login; other users cannot interrupt repeat filtering
        spamOrder: [],
        slowMode: 0,
        lastSendTime: 0,
        composing: false,
        sending: false,
        nearBottom: true,
        chatTab: 'all',
        tvHistorySeq: 0,
        refreshing: null,
        pickerTab: 'twitch',
        pickerFilter: '',
        pickerShown: 0,
        originOk: false,
        started: false,
        lastHiddenAt: 0,
        local: false,
        tvReady: false,
        deviceLogin: null,
        devicePopup: null,
        devicePopupNavigated: false,
        deviceGen: 0,
        authGen: 0,
        flowGen: 0, //bumped on disconnect/invalidate: stale HTTP continuations must not touch the new state
        providersGen: 0,
        echoSeq: 0,
        roomRestrictions: null,
        moderation: {blocked: false, until: 0, token: 0, timer: null}
    };

    function el(id) {
        return document.getElementById(id);
    }

    /* ---------- state banner / connection line ---------- */

    //Internal state keys -> copy in Strings. Keys not listed here are Strings
    //keys themselves (state* and sendBlocked*), so no raw key ever reaches the UI.
    var BannerText = {
        signed_out: 'stateSignedOut',
        denied: 'stateDenied',
        auth_error: 'stateAuthError',
        config_missing: 'stateConfigMissing',
        origin: 'stateOrigin',
        storage: 'stateStorage',
        no_crypto: 'stateNoCrypto',
        token_invalid: 'stateTokenInvalid',
        scope_invalid: 'stateScopeInvalid',
        no_channel: 'stateChannelMissing',
        channel_not_found: 'stateChannelNotFound'
    };

    var BannerActionMap = {
        signed_out: 'connect',
        denied: 'connect',
        auth_error: 'connect',
        token_invalid: 'connect',
        scope_invalid: 'connect',
        channel_not_found: null,
        stateDeviceExpired: 'connect',
        config_missing: null,
        origin: null,
        storage: null,
        no_channel: null,
        validating: null
    };

    function showBanner(key, isError, actionLabel) {
        var banner = el('pc-banner'),
            text = el('pc-banner-text'),
            action = el('pc-banner-action');

        if (!key) {
            banner.hidden = true;
            return;
        }

        banner.hidden = false;
        banner.className = 'pc-banner' + (isError ? ' pc-error' : '');
        text.textContent = Strings[BannerText[key] || key] || key;

        if (actionLabel && BannerActionMap[key] !== undefined && BannerActionMap[key] !== null) {
            action.hidden = false;
            action.textContent = actionLabel;
        } else {
            action.hidden = true;
        }
    }

    function setConnection(text, kind) {
        var node = el('pc-connection');

        node.textContent = text;
        node.className = kind === 'ok' ? 'pc-ok' : kind === 'bad' ? 'pc-bad' : '';
    }

    function setComposerEnabled(enabled) {
        el('pc-input').disabled = !enabled;
        el('pc-send').hidden = !enabled;
        el('pc-emote-button').hidden = !enabled;
    }

    /*
     * Composer eligibility is DERIVED, never set ad hoc: it requires a
     * connected joined socket, a valid session AND no active moderation
     * restriction. A join alone must not re-enable a timed-out or banned
     * account, and connection loss must not lift a moderation state.
     */
    function refreshComposer() {
        setComposerEnabled(!!(S.sessionValid && (!S.local || S.tvReady) && S.transport && S.transport.isConnected() && !S.moderation.blocked));
    }

    function isModerationBlocked() {
        return S.moderation.blocked;
    }

    //A socket join restores the account's current restriction, not just its
    //connection. Offline/background banners may have replaced this copy.
    function refreshJoinedState() {
        if (isModerationBlocked()) {
            showBanner(S.moderation.until ? 'stateTimeout' : 'stateBanned', true, null);
            setConnection(S.moderation.until ? 'Timed out' : 'Banned in this channel', 'bad');
        } else {
            showBanner(null);
            setConnection(Strings.connectedAs + ' ' + (S.session.login || ''), 'ok');
        }

        refreshComposer();
    }

    /*
     * Set the moderation state for the signed-in account. banDuration > 0 is a
     * timeout that lifts itself; 0/null is a permanent ban. Every call
     * replaces the previous expiry timer (token-guarded), so an older timeout
     * can never re-enable sending after a newer timeout or ban.
     */
    function setModeration(blocked, banDuration) {
        var mod = S.moderation;

        mod.token++;
        if (mod.timer) {
            clearTimeout(mod.timer);
            mod.timer = null;
        }

        mod.blocked = blocked;
        mod.until = blocked && banDuration > 0 ? Date.now() + banDuration * 1000 : 0;

        if (blocked && banDuration > 0) {
            var token = mod.token;

            mod.timer = setTimeout(function () {
                if (token !== mod.token) return; //a newer moderation event replaced us

                mod.blocked = false;
                mod.until = 0;
                mod.timer = null;
                refreshComposer();

                if (S.transport && S.transport.isConnected() && S.session) {
                    refreshJoinedState();
                }
            }, banDuration * 1000);
        }

        refreshComposer();
    }

    /* ---------- channel ---------- */

    function normalizeChannel(raw) {
        if (typeof raw !== 'string') return null;

        var value = raw.trim();

        if (!/^[a-zA-Z0-9_]{3,25}$/.test(value)) return null;

        return value.toLowerCase();
    }

    /* ---------- OAuth ---------- */

    function cancelDeviceLogin() {
        S.deviceGen++;
        S.authGen++;
        S.refreshing = null;
        if (S.deviceLogin) S.deviceLogin.cancel();
        S.deviceLogin = null;
        if (S.devicePopup && !S.devicePopupNavigated) {
            try {
                S.devicePopup.close();
            } catch (e) {
                /* User may have closed it already. */
            }
        }
        S.devicePopup = null;
        S.devicePopupNavigated = false;
        el('pc-device-login').hidden = true;
        updateAccountButton();
    }

    function startDeviceLogin() {
        if (!Auth.storageAvailable()) {
            showBanner('storage', true, null);
            return;
        }
        if (!Auth.isConfigured()) {
            showBanner('config_missing', true, null);
            return;
        }
        cancelDeviceLogin();
        var gen = S.deviceGen,
            popup = window.open ? window.open('about:blank', '_blank') : null;
        if (popup) popup.opener = null;
        S.devicePopup = popup;
        showBanner('stateAuthorizing', false, null);
        S.deviceLogin = SPTVPhoneChat.Device.start({
            code: function (code, url) {
                if (gen !== S.deviceGen) return;
                el('pc-device-code').textContent = code;
                el('pc-device-link').href = url;
                el('pc-device-login').hidden = false;
                showBanner('stateDevicePending', false, null);
                if (popup) {
                    try {
                        popup.location.href = url;
                        S.devicePopupNavigated = true;
                    } catch (e) {
                        /* The explicit Open Twitch link remains usable. */
                    }
                }
            },
            token: function (token, refreshToken) {
                if (gen !== S.deviceGen) return;
                S.deviceLogin = null;
                el('pc-device-login').hidden = true;
                validateAndUseToken(token, refreshToken).then(function () {
                    if (gen !== S.deviceGen) return;
                    updateAccountButton();
                    if (!S.sessionValid) return;
                    if (!S.local || S.tvReady) startChat();
                    else showBanner('stateTvWaiting', false, null);
                });
            },
            error: function (reason) {
                if (gen !== S.deviceGen) return;
                S.deviceLogin = null;
                el('pc-device-login').hidden = true;
                if (popup && !S.devicePopupNavigated) {
                    try {
                        popup.close();
                    } catch (e) {
                        /* User may have closed it already. */
                    }
                }
                S.devicePopup = null;
                showBanner(reason === 'denied' ? 'denied' : reason === 'expired' ? 'stateDeviceExpired' : 'auth_error', true, Strings.tryAgain);
                setConnection('Sign-in failed', 'bad');
                updateAccountButton();
            }
        });
        updateAccountButton();
    }

    function startLogin() {
        if (S.local || PhoneChatConfig.useDeviceLogin) {
            startDeviceLogin();
            return;
        }
        if (!Auth.storageAvailable() || !S.channel) return;

        if (!S.originOk || !Auth.currentCallbackUrl()) {
            showBanner('origin', true, null);
            return;
        }

        if (!Auth.isConfigured()) {
            showBanner('config_missing', true, null);
            return;
        }

        var stateValue = Auth.randomState(32);

        if (!stateValue) {
            showBanner('no_crypto', true, null);
            return;
        }

        var pending = Auth.createPending(stateValue, S.channel, Auth.currentCallbackUrl(), Date.now());

        try {
            window.sessionStorage.setItem(Auth.PendingKey, JSON.stringify(pending));
        } catch (e) {
            showBanner('storage', true, null);
            return;
        }

        showBanner('stateAuthorizing', false, null);
        setConnection('Signing in...', '');

        var url =
            PhoneChatConfig.oauth.authorizeUrl +
            '?client_id=' +
            encodeURIComponent(PhoneChatConfig.clientId) +
            '&redirect_uri=' +
            encodeURIComponent(pending.redirect) +
            '&response_type=token' +
            '&scope=' +
            encodeURIComponent(PhoneChatConfig.scopes.join(' ')) +
            '&state=' +
            encodeURIComponent(stateValue);

        window.location.assign(url);
    }

    function cleanUrl(channel) {
        return window.location.origin + window.location.pathname + (channel ? '?channel=' + encodeURIComponent(channel) : '');
    }

    function restoreCleanUrl(channel) {
        try {
            window.history.replaceState(null, '', cleanUrl(channel));
        } catch (e) {
            //replaceState can fail on file:// or sandboxed pages; harmless
        }
    }

    //A callback carries its result in the fragment (token flow) or the query (denial)
    function hasCallbackData() {
        var hash = window.location.hash || '',
            search = window.location.search || '';

        return hash.indexOf('access_token=') !== -1 || hash.indexOf('error=') !== -1 || search.indexOf('error=') !== -1;
    }

    /*
     * Process an OAuth return. MUST run before init()'s ordinary missing-channel
     * check: Twitch sends the user back to the REGISTERED callback URL, which
     * has no ?channel — the channel comes from the pending record instead.
     * Sensitive callback data is removed from the address bar on every path
     * (success, denial, tampering) before any network request. Returns true
     * whenever callback data was present (boot stops here either way).
     */
    function handleCallback() {
        var hash = window.location.hash || '',
            search = window.location.search || '',
            hashParams = Auth.parseParams(hash),
            params = Object.keys(hashParams).length ? hashParams : Auth.parseParams(search),
            rawPending = null,
            result,
            recovered;

        try {
            rawPending = window.sessionStorage.getItem(Auth.PendingKey);
        } catch (e) {
            rawPending = null;
        }

        result = Auth.evaluateCallback(params, rawPending, Date.now(), PhoneChatConfig.pendingTimeoutMs);

        //evaluateCallback consumed the pending record exactly once; its channel
        //is this page's own same-origin data and safe to recover even on failure
        recovered = result.channel ? normalizeChannel(result.channel) : null;

        restoreCleanUrl(recovered || '');

        if (result.ok && S.originOk && Auth.isConfigured()) {
            S.channel = recovered;
            el('pc-channel-name').textContent = S.channel;

            showBanner('stateAuthorizing', false, null);
            setConnection('Signing in...', '');

            validateAndUseToken(result.accessToken).then(function () {
                startChat();
            });

            return true;
        }

        //Failure (or a callback this page cannot act on): credentials were
        //discarded above; surface the most specific actionable state
        if (result.ok && !S.originOk) {
            showBanner('origin', true, null);
            setConnection('Wrong address', 'bad');
            updateAccountButton();
            return true;
        }

        if (result.ok && !Auth.isConfigured()) {
            showBanner('config_missing', true, null);
            setConnection('Not configured', 'bad');
            updateAccountButton();
            return true;
        }

        if (!Auth.storageAvailable()) {
            showBanner('storage', true, null);
            setConnection('Sign-in failed', 'bad');
            return true;
        }

        if (recovered) {
            S.channel = recovered;
            el('pc-channel-name').textContent = S.channel;
            showBanner(result.reason === 'denied' ? 'denied' : 'auth_error', true, Strings.tryAgain);
            setConnection('Sign-in failed', 'bad');
            updateAccountButton();
            return true;
        }

        //No verifiable channel: the only recovery is scanning the TV QR again
        showBanner('no_channel', true, null);
        setConnection('No channel', 'bad');
        updateAccountButton();
        return true;
    }

    function validateAndUseToken(token, refreshToken) {
        var gen = S.authGen;

        return Auth.validateToken(token).then(
            function (response) {
                var check;

                if (gen !== S.authGen) return; //a disconnect/sign-out happened meanwhile

                //HTTP failure (401 etc): the token is invalid; only a NETWORK
                //rejection (promise rejection below) keeps a retry option
                check = response.ok ? Auth.evaluateValidateResponse(response.json, PhoneChatConfig.scopes) : {ok: false, reason: 'invalid'};

                if (!check.ok) {
                    Auth.clearSession();
                    S.session = null;
                    S.sessionValid = false;
                    setComposerEnabled(false);
                    showBanner(check.reason === 'missing_scopes' ? 'scope_invalid' : 'token_invalid', true, Strings.reconnect);
                    setConnection('Signed out', 'bad');
                    return;
                }

                S.session = {
                    token: token,
                    refreshToken: refreshToken || null,
                    login: check.login,
                    userId: check.userId,
                    scopes: check.scopes,
                    expiresAt: Date.now() + check.expiresIn * 1000
                };
                S.sessionValid = true;

                if (!Auth.saveSession(S.session)) {
                    Auth.clearSession();
                    S.session = null;
                    S.sessionValid = false;
                    showBanner('storage', true, null);
                    return;
                }

                updateAccountButton();
            },
            function () {
                if (gen !== S.authGen) return;

                //Network failure: keep the saved session, offer an explicit retry
                S.session = {token: token, refreshToken: refreshToken || null, login: null, userId: null, expiresAt: 0};
                Auth.saveSession(S.session);
                S.sessionValid = false;
                showBanner('token_invalid', true, Strings.tryAgain);
            }
        );
    }

    function refreshSession() {
        if (S.refreshing) return S.refreshing;
        var gen = S.authGen,
            lease = String(Date.now()) + '-' + Math.random(),
            lockKey = 'sptv_phone_refresh_lock',
            saved = Auth.loadSession(),
            lock;
        if (saved && saved.refreshToken && saved.refreshToken !== S.session.refreshToken) {
            S.session = saved;
            return revalidateSession(true);
        }
        try {
            lock = JSON.parse(window.localStorage.getItem(lockKey) || 'null');
            if (lock && lock.until > Date.now()) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        resolve(gen === S.authGen && S.session ? revalidateSession() : false);
                    }, 1000);
                });
            }
            window.localStorage.setItem(lockKey, JSON.stringify({owner: lease, until: Date.now() + 20000}));
        } catch (ignore) {
            /* Session-only browser. */
        }
        S.refreshing = SPTVPhoneChat.Device.refresh(S.session.refreshToken)
            .then(
                function (response) {
                    if (gen !== S.authGen || !S.session) return false;
                    if (response.status !== 200 || !response.json || !response.json.access_token) {
                        if (response.status === 400 || response.status === 401) invalidateSession();
                        return false;
                    }
                    S.session.token = response.json.access_token;
                    S.session.refreshToken = response.json.refresh_token || S.session.refreshToken;
                    S.session.expiresAt = Date.now() + Number(response.json.expires_in || 0) * 1000;
                    Auth.saveSession(S.session);
                    return revalidateSession(true).then(function (valid) {
                        if (valid && S.transport && gen === S.authGen) startTransport();
                        return valid;
                    });
                },
                function () {
                    return false;
                }
            )
            .then(function (valid) {
                try {
                    lock = JSON.parse(window.localStorage.getItem(lockKey) || 'null');
                    if (lock && lock.owner === lease) window.localStorage.removeItem(lockKey);
                } catch (ignore) {
                    /* Session-only browser. */
                }
                if (gen === S.authGen) S.refreshing = null;
                return valid;
            });
        return S.refreshing;
    }

    function revalidateSession(afterRefresh) {
        if (!S.session || !S.session.token) return Promise.resolve(false);

        if (!afterRefresh && S.session.refreshToken && S.session.expiresAt && S.session.expiresAt < Date.now() + 60000) return refreshSession();
        var token = S.session.token,
            gen = S.authGen;

        return Auth.validateToken(token).then(
            function (response) {
                var check;

                if (gen !== S.authGen) return false;

                if (!response.ok) {
                    if (response.status === 401 && !afterRefresh && S.session.refreshToken) return refreshSession();
                    if (response.status >= 500) return false;
                    invalidateSession();
                    return false;
                }

                check = Auth.evaluateValidateResponse(response.json, PhoneChatConfig.scopes);

                if (!check.ok) {
                    invalidateSession(check.reason === 'missing_scopes' ? 'scope_invalid' : 'token_invalid');
                    return false;
                }

                S.sessionValid = true;
                S.session.expiresAt = Date.now() + check.expiresIn * 1000;
                Auth.saveSession(S.session);
                return true;
            },
            function () {
                //Network failure: do not destroy the saved session
                return false;
            }
        );
    }

    //bannerKey is an internal state key (see BannerText); default: expired token
    function invalidateSession(bannerKey) {
        S.authGen++;
        S.refreshing = null;
        S.flowGen++; //invalidate in-flight HTTP continuations
        Auth.clearSession();
        S.session = null;
        S.sessionValid = false;
        setComposerEnabled(false);
        updateAccountButton();
        showBanner(bannerKey || 'token_invalid', true, Strings.reconnect);
        setConnection('Signed out', 'bad');
        if (S.transport) S.transport.stop();
    }

    /* ---------- chat session ---------- */

    function startChat() {
        if (!S.sessionValid || !S.session || S.started || (S.local && !S.tvReady)) return;
        if (!S.channel) {
            showBanner('no_channel', true, null);
            return;
        }

        S.started = true;
        //History and local echoes belong to the displayed chat session. Keep
        //them across socket replacement while the existing feed stays visible.
        S.store = Render.createStore(Render.HistoryLimit);
        S.localEchoes = [];
        S.ownBadges = null;
        setModeration(false, 0); //a fresh chat session starts unrestricted

        var gen = S.flowGen;

        updateAccountButton();
        setConnection('Connecting...', '');
        showBanner('stateConnecting', false, null);

        Auth.helixGet('users?login=' + encodeURIComponent(S.channel), S.session).then(
            function (response) {
                if (gen !== S.flowGen || !S.session) return; //disconnected meanwhile

                if (response.status === 401) {
                    invalidateSession();
                    return;
                }

                var user = response.json && response.json.data && response.json.data[0];

                if (!user) {
                    showBanner('channel_not_found', true, null);
                    setConnection('Channel not found', 'bad');
                    return;
                }

                S.broadcasterId = user.id;
                S.channelDisplayName = user.display_name || S.channel;
                el('pc-channel-name').textContent = S.channelDisplayName;

                loadEmotes();
                loadBadges();
                startTransport();
            },
            function () {
                if (gen !== S.flowGen) return;
                showBanner('stateOffline', true, null);
                setConnection('Network error', 'bad');
                S.started = false;
            }
        );
    }

    function startTransport() {
        if (S.transport) S.transport.stop();

        S.transport = T.create({
            url: PhoneChatConfig.oauth.ircUrl,
            token: S.session.token,
            nick: S.session.login,
            channel: S.channel,
            onEvent: onTransportEvent
        });

        S.transport.start();
    }

    function onTransportEvent(event) {
        switch (event.type) {
            case 'state':
                onTransportState(event.state);
                break;
            case 'joined':
                refreshJoinedState();
                break;
            case 'message':
                onChatMessage(event.message);
                break;
            case 'userstate':
                S.ownBadges = event.tags ? event.tags.badges : null;
                break;
            case 'notice':
                onNotice(event);
                break;
            case 'clearmsg':
                onClearMsg(event.targetMsgId);
                break;
            case 'clearchat':
                onClearChat(event);
                break;
            case 'roomstate':
                onRoomState(event.tags);
                break;
            case 'error':
                if (event.kind === 'auth') {
                    if (S.session && S.session.refreshToken) refreshSession();
                    else invalidateSession();
                }
                break;
            default:
                break;
        }
    }

    /*
     * ROOMSTATE carries the room's restrictions. The initial burst establishes
     * the baseline silently; later CHANGES get a short informational row so
     * rejected messages can be explained instead of silently failing.
     */
    function onRoomState(tags) {
        if (!tags) return;

        if (typeof tags.slow !== 'undefined') {
            var slow = parseInt(tags.slow, 10);
            S.slowMode = slow > 0 ? slow : 0;

            //Announce only GENUINE changes, then update the stored baseline so
            //repeats stay silent and a change back to the initial value is seen
            if (S.roomRestrictions && S.slowMode !== S.roomRestrictions.slow) {
                appendRow(makeSystemRow(S.slowMode > 0 ? Strings.roomSlowOn.replace('%s', String(S.slowMode)) : Strings.roomSlowOff, ''));
                S.roomRestrictions.slow = S.slowMode;
            }
        }

        if (!S.roomRestrictions) {
            //First ROOMSTATE after joining: baseline, no announcements
            S.roomRestrictions = {
                slow: S.slowMode,
                subsOnly: tags['subs-only'] === '1',
                emoteOnly: tags['emote-only'] === '1',
                followers: typeof tags['followers-only'] !== 'undefined' && tags['followers-only'] !== '-1'
            };
            return;
        }

        if (tags['subs-only'] !== undefined && (tags['subs-only'] === '1') !== S.roomRestrictions.subsOnly) {
            S.roomRestrictions.subsOnly = tags['subs-only'] === '1';
            appendRow(makeSystemRow(S.roomRestrictions.subsOnly ? Strings.roomSubsOnly : Strings.roomSubsOff, ''));
        }

        if (tags['emote-only'] !== undefined && (tags['emote-only'] === '1') !== S.roomRestrictions.emoteOnly) {
            S.roomRestrictions.emoteOnly = tags['emote-only'] === '1';
            appendRow(makeSystemRow(S.roomRestrictions.emoteOnly ? Strings.roomEmoteOnly : Strings.roomEmoteOff, ''));
        }

        var followersNow = typeof tags['followers-only'] !== 'undefined' && tags['followers-only'] !== '-1';

        if (tags['followers-only'] !== undefined && followersNow !== S.roomRestrictions.followers) {
            S.roomRestrictions.followers = followersNow;
            appendRow(makeSystemRow(followersNow ? Strings.roomFollowersOnly : Strings.roomFollowersOff, ''));
        }
    }

    function onTransportState(state) {
        refreshComposer();

        switch (state) {
            case T.States.CONNECTING:
                S.roomRestrictions = null; //re-baseline ROOMSTATE on every new socket
                setConnection('Connecting...', '');
                break;
            case T.States.AUTHENTICATING:
            case T.States.JOINING:
                setConnection('Connecting...', '');
                break;
            case T.States.RECONNECTING:
                setConnection('Reconnecting...', 'bad');
                showBanner('stateReconnecting', true, null);
                break;
            case T.States.ERROR:
                setConnection('Chat error', 'bad');
                break;
            default:
                break;
        }
    }

    /* ---------- messages ---------- */

    function nearBottom() {
        var box = el('pc-messages');
        return box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    }

    function scrollToBottom() {
        var box = el('pc-messages');
        box.scrollTop = box.scrollHeight;
        rowAutoScrollTop = box.scrollTop;
        S.nearBottom = true;
        el('pc-jump-latest').hidden = true;
    }

    /* Mobile keyboards shrink only the visual viewport: iOS never resizes the layout
     * viewport for the keyboard and Android Chrome stopped doing so in 108 (the page's
     * interactive-widget meta opts Android back in, iOS relies on this). Pin the app to
     * the visible area so the composer stays above the keyboard and compensate the
     * visual viewport offset. A large shrink is the keyboard opening: keep the newest
     * message in view then, but only when the reader was already at the tail. */
    var vvLastHeight = null;
    function setupViewportSync() {
        var vv = window.visualViewport;
        if (!vv || !vv.addEventListener) return;
        var apply = function () {
            var keyboardOpened = vvLastHeight !== null && vvLastHeight - vv.height > 120,
                wasNearBottom = S.nearBottom;
            el('pc-app').style.height = vv.height + 'px';
            el('pc-app').style.transform = 'translateY(' + vv.offsetTop + 'px)';
            if (keyboardOpened && wasNearBottom) scrollToBottom();
            vvLastHeight = vv.height;
        };
        vv.addEventListener('resize', apply);
        vv.addEventListener('scroll', apply);
        apply();
    }

    var rowAutoScrollTop = null,
        rowBatchDepth = 0,
        rowFlushHandle = null,
        rowFlushIsFrame = false,
        rowFlushVisible = false,
        rowFlushGeneration = 0;

    function cancelRowFlush() {
        rowFlushGeneration++;
        rowAutoScrollTop = null;
        if (rowFlushHandle !== null) {
            if (rowFlushIsFrame) window.cancelAnimationFrame(rowFlushHandle);
            else clearTimeout(rowFlushHandle);
        }
        rowFlushHandle = null;
        rowFlushVisible = false;
    }

    function flushRows() {
        rowFlushHandle = null;
        pruneRows(el('pc-messages'));
        updateChatEmpty();
        if (rowFlushVisible) {
            if (S.nearBottom) scrollToBottom();
            else el('pc-jump-latest').hidden = false;
        }
        rowFlushVisible = false;
    }

    function scheduleRowFlush(visible) {
        rowFlushVisible = rowFlushVisible || visible;
        if (rowBatchDepth || rowFlushHandle !== null) return;
        var generation = rowFlushGeneration;
        rowFlushIsFrame = !document.hidden && !!(window.requestAnimationFrame && window.cancelAnimationFrame);
        var run = function () {
            if (generation === rowFlushGeneration) flushRows();
        };
        rowFlushHandle = rowFlushIsFrame ? window.requestAnimationFrame(run) : setTimeout(run, 16);
    }

    function appendRow(row) {
        var box = el('pc-messages');

        row.hidden = S.chatTab === 'priority' && row.getAttribute('data-priority') !== 'true';
        var before = null,
            i,
            time = Number(row.getAttribute('data-time')),
            tail = box.children[box.children.length - 1],
            tailTime = tail && Number(tail.getAttribute('data-time'));
        if (time && !(tailTime && time > tailTime)) {
            for (i = 0; i < box.children.length; i++) {
                if (Number(box.children[i].getAttribute('data-time')) > time) {
                    before = box.children[i];
                    break;
                }
            }
        }
        if (before) box.insertBefore(row, before);
        else box.appendChild(row);
        // Insert synchronously so moderation later in a replay sees this row.
        scheduleRowFlush(!row.hidden);
    }

    function updateChatEmpty() {
        var rows = el('pc-messages').children,
            visible = false,
            i;
        for (i = 0; i < rows.length; i++) {
            if (!rows[i].hidden) {
                visible = true;
                break;
            }
        }
        el('pc-chat-empty').hidden = S.chatTab !== 'priority' || visible;
    }

    function selectChatTab(tab) {
        S.chatTab = tab;
        var priority = tab === 'priority',
            rows = el('pc-messages').children,
            allButton = el('pc-chat-all'),
            priorityButton = el('pc-chat-priority'),
            i;
        allButton.setAttribute('aria-selected', String(!priority));
        priorityButton.setAttribute('aria-selected', String(priority));
        allButton.setAttribute('tabindex', priority ? '-1' : '0');
        priorityButton.setAttribute('tabindex', priority ? '0' : '-1');
        el('pc-messages').setAttribute('aria-labelledby', priority ? 'pc-chat-priority' : 'pc-chat-all');
        for (i = 0; i < rows.length; i++) {
            rows[i].hidden = priority && rows[i].getAttribute('data-priority') !== 'true';
        }
        updateChatEmpty();
        scrollToBottom();
    }

    function pruneRows(box) {
        var rows = box.children,
            ordinary = 0,
            i,
            row;
        for (i = rows.length - 1; i >= 0; i--) {
            row = rows[i];
            if (row.getAttribute('data-priority') === 'true') {
                if (Number(row.getAttribute('data-time')) < Date.now() - 20 * 60 * 1000) box.removeChild(row);
            } else if (++ordinary > Render.HistoryLimit + 20) box.removeChild(row);
        }
    }

    function makeSystemRow(text, cls) {
        var row = document.createElement('div');
        row.className = 'pc-msg ' + (cls || '');
        row.appendChild(document.createTextNode(text));
        return row;
    }

    function onChatMessage(message) {
        if (!message || !message.text) return;

        var login = String(message.login || '').toLowerCase();

        //Muted users are invisible on this phone; their ids are still recorded
        //so a replay after an unmute cannot resurrect dropped messages
        if (login && isMuted(login)) {
            if (!S.store) S.store = Render.createStore(Render.HistoryLimit);
            if (message.id) S.store.append({id: message.id, userId: message.tags ? message.tags['user-id'] : null});
            return;
        }

        //Deduplicate by message id
        if (!S.store) S.store = Render.createStore(Render.HistoryLimit);
        if (message.id && (S.store.has(message.id) || el('pc-messages').querySelector('[data-id="' + cssEscape(message.id) + '"]'))) return;

        //Deduplicate a matching local echo once the server echoes it back:
        //remove exactly the row belonging to the matched echo record
        if (S.session && message.login === S.session.login) {
            var i;
            for (i = 0; i < S.localEchoes.length; i++) {
                if (S.localEchoes[i].text === message.text && Math.abs((message.receivedAt || Date.now()) - S.localEchoes[i].time) < 10000) {
                    var echoRow = el('pc-messages').querySelector('[data-echo="' + cssEscape(S.localEchoes[i].rowId) + '"]');
                    S.localEchoes.splice(i, 1);
                    if (echoRow && echoRow.parentNode) echoRow.parentNode.removeChild(echoRow);
                    break;
                }
            }
        }

        var entry = {id: message.id, userId: message.tags ? message.tags['user-id'] : null};
        if (message.id) S.store.append(entry);

        //Keep one merge target per user so ordinary chat cannot break the filter.
        var receivedAt = message.receivedAt || Date.now(),
            spamKey = '$' + login,
            spam = S.spam[spamKey];

        if (
            spam &&
            login &&
            !spam.deleted &&
            spam.text === message.text &&
            spam.action === Boolean(message.action) &&
            spam.badges === message.badges &&
            receivedAt >= spam.time &&
            receivedAt - spam.time < SpamWindowMs &&
            spam.row.parentNode === el('pc-messages')
        ) {
            spam.count++;
            spam.time = receivedAt;
            entry.rowId = spam.row.getAttribute('data-id');
            spam.countEl.textContent = ' (x' + spam.count + ')';
            if (nearBottom()) scrollToBottom(); //the row grew, keep the newest content in view
            return;
        }

        var roles = Render.messageRoles(message.badges, message.login),
            resolver = S.resolver,
            segments = Render.buildSegments(message.text, message.emotes, resolver),
            row = document.createElement('div'),
            ownMessage = S.session && login === S.session.login,
            nameSpan = document.createElement(login && !ownMessage ? 'button' : 'span'),
            textSpan = document.createElement('span'),
            countSpan = document.createElement('span');

        row.className = 'pc-msg' + (message.action ? ' pc-action' : '') + (roles.partner ? ' pc-partner' : '');
        row.setAttribute('data-priority', String(roles.priority));
        row.setAttribute('data-time', String(receivedAt));
        if (message.id) row.setAttribute('data-id', message.id);
        if (message.tags && message.tags['user-id']) row.setAttribute('data-user-id', message.tags['user-id']);
        //The mute action sheet and row cleanup on mute both key on the login
        if (login) {
            row.setAttribute('data-login', login);
            row.setAttribute('data-name', message.displayName || login);
        }

        appendBadges(row, message.badges);

        nameSpan.className = 'pc-user';
        nameSpan.textContent = (message.displayName || message.login) + ': ';
        if (login && !ownMessage) {
            nameSpan.setAttribute('type', 'button');
            nameSpan.setAttribute('data-user-action', 'true');
            nameSpan.setAttribute('aria-label', Strings.muteAction.replace('%s', message.displayName || login));
        }
        if (Render.isValidUserColor(message.color)) nameSpan.style.color = message.color;

        textSpan.className = 'pc-text';
        textSpan.appendChild(SPTVPhoneChat.Dom.buildMessageContent(segments, document));

        countSpan.className = 'pc-count';

        row.appendChild(nameSpan);
        row.appendChild(textSpan);
        row.appendChild(countSpan);

        appendRow(row);

        if (login) {
            if (!S.spam.hasOwnProperty(spamKey)) S.spamOrder.push(spamKey);
            S.spam[spamKey] = {
                text: message.text,
                action: !!message.action,
                badges: message.badges,
                time: receivedAt,
                count: 1,
                row: row,
                countEl: countSpan
            };
            if (S.spamOrder.length > Render.HistoryLimit) delete S.spam[S.spamOrder.shift()];
        }
    }

    function appendBadges(row, badgesTag) {
        if (!badgesTag || typeof badgesTag !== 'string' || !S.badges) return;

        var parts = badgesTag.split(','),
            i,
            len = parts.length,
            pair,
            set,
            version,
            url;

        for (i = 0; i < len; i++) {
            pair = parts[i].split('/');
            if (pair.length !== 2) continue;

            set = S.badges[pair[0]];
            version = set ? set[pair[1]] || set['1'] || set['0'] : null;
            url = version ? Emotes.isSafeImageUrl(version) : null;

            if (!url) continue;

            var img = document.createElement('img');
            img.className = 'pc-badge';
            img.alt = pair[0];
            img.setAttribute('src', url);
            row.appendChild(img);
        }
    }

    function onNotice(event) {
        appendRow(makeSystemRow(Strings.noticePrefix + (event.text || ''), 'pc-deleted'));
    }

    function onClearMsg(targetMsgId) {
        if (!targetMsgId) return;

        if (!S.store) S.store = Render.createStore(Render.HistoryLimit);
        var entry = S.store.get(targetMsgId),
            rowId = entry && entry.rowId ? entry.rowId : targetMsgId;
        S.store.markDeleted(targetMsgId);

        var row = el('pc-messages').querySelector('[data-id="' + cssEscape(rowId) + '"]');

        if (row) {
            var spam = S.spam['$' + row.getAttribute('data-login')];
            if (spam && spam.row === row) spam.deleted = true;
            row.textContent = '';
            row.appendChild(document.createTextNode(Strings.deleted));
            row.className += ' pc-deleted';
        }
    }

    function cssEscape(value) {
        return String(value).replace(/["\\\]]/g, '\\$&');
    }

    function onClearChat(event) {
        var box = el('pc-messages');

        if (!event.targetUserId) {
            //The whole room was cleared
            while (box.firstChild) box.removeChild(box.firstChild);
            S.store = Render.createStore(Render.HistoryLimit);
            S.spam = {};
            S.spamOrder = [];
            appendRow(makeSystemRow(Strings.stateRoomClear, 'pc-deleted'));
            return;
        }

        //Common targeted cleanup FIRST: every user's messages are removed the
        //same way — including the signed-in account's own rows and echoes
        var rows = box.querySelectorAll('[data-user-id="' + cssEscape(event.targetUserId) + '"]'),
            i;

        for (i = 0; i < rows.length; i++) {
            if (rows[i].parentNode) rows[i].parentNode.removeChild(rows[i]);
        }

        if (S.session && event.targetUserId === S.session.userId) {
            //Our local echoes are this account's messages too
            for (i = 0; i < S.localEchoes.length; i++) {
                var echoRow = box.querySelector('[data-echo="' + cssEscape(S.localEchoes[i].rowId) + '"]');
                if (echoRow && echoRow.parentNode) echoRow.parentNode.removeChild(echoRow);
            }
            S.localEchoes = [];

            //A timeout lifts itself after ban-duration; a permanent ban does not
            setModeration(true, event.banDuration && event.banDuration > 0 ? event.banDuration : 0);
            refreshJoinedState();
        }
        updateChatEmpty();
    }

    /* ---------- sending ---------- */

    function trySend() {
        if (S.sending) return;

        if (!S.sessionValid || (S.local && !S.tvReady) || !S.transport || !S.transport.isConnected()) {
            showBanner('stateReconnecting', true, null);
            return;
        }

        if (isModerationBlocked()) {
            showBanner(S.moderation.until ? 'stateTimeout' : 'stateBanned', true, null);
            return;
        }

        var input = el('pc-input'),
            check = T.validateOutgoing(input.value),
            now = Date.now();

        if (!check.ok) {
            showBanner(
                check.reason === 'too_long' ? 'sendBlockedLength' : check.reason === 'empty' ? 'sendBlockedEmpty' : 'sendBlockedChars',
                true,
                null
            );
            return;
        }

        if (S.slowMode > 0 && now - S.lastSendTime < S.slowMode * 1000) {
            showBanner('sendBlockedSlow', true, null);
            el('pc-banner-text').textContent = Strings.sendBlockedSlow.replace('%s', String(S.slowMode));
            return;
        }

        S.sending = true;

        var result = S.transport.send(check.value);

        S.sending = false;

        if (!result.ok) {
            //Preserve the draft; the connection state banner explains why
            showBanner(result.reason === 'not_connected' ? 'sendBlockedOffline' : 'sendBlockedChars', true, null);
            return;
        }

        S.lastSendTime = now;

        //Local echo: rendered like any other message (third-party emote codes
        //included), marked as submitted — never as server-confirmed delivery
        S.echoSeq++;
        var rowId = 'echo-' + S.echoSeq,
            roles = Render.messageRoles(S.ownBadges, S.session.login),
            row = document.createElement('div'),
            nameSpan = document.createElement('span'),
            textSpan = document.createElement('span'),
            mark = document.createElement('span'),
            segments;

        row.className = 'pc-msg pc-local' + (roles.partner ? ' pc-partner' : '');
        row.setAttribute('data-priority', String(roles.priority));
        row.setAttribute('data-echo', rowId);
        row.setAttribute('data-time', String(Date.now()));
        //Echoes are this account's messages: targeted CLEARCHAT must find them
        if (S.session.userId) row.setAttribute('data-user-id', S.session.userId);
        if (S.session.login) row.setAttribute('data-login', S.session.login);

        nameSpan.className = 'pc-user';
        nameSpan.textContent = (S.session.login || Strings.localName) + ': ';

        segments = Render.buildSegments(result.value, null, S.resolver);
        textSpan.className = 'pc-text';
        textSpan.appendChild(SPTVPhoneChat.Dom.buildMessageContent(segments, document));

        mark.className = 'pc-sent';
        mark.textContent = Strings.sentMark;

        row.appendChild(nameSpan);
        row.appendChild(textSpan);
        row.appendChild(mark);
        appendRow(row);

        S.localEchoes.push({text: result.value, time: now, rowId: rowId});
        if (S.localEchoes.length > 10) S.localEchoes.shift();

        input.value = '';
    }

    /* ---------- emotes ---------- */

    function fetchJsonTimeout(url, timeoutMs) {
        var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null,
            timer = setTimeout(function () {
                if (controller) controller.abort();
            }, timeoutMs || 8000),
            options = controller ? {signal: controller.signal} : {};

        return window.fetch(url, options).then(
            function (response) {
                clearTimeout(timer);

                if (response.status === 404) return {ok: true, status: 404, json: null}; //normal: provider/channel not enabled
                if (!response.ok) return {ok: false, status: response.status, json: null};

                return response.json().then(
                    function (json) {
                        return {ok: true, status: response.status, json: json};
                    },
                    function () {
                        return {ok: false, status: response.status, json: null};
                    }
                );
            },
            function () {
                clearTimeout(timer);
                return {ok: false, status: 0, json: null};
            }
        );
    }

    function loadEmotes() {
        var preferStatic = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        S.providers = {
            twitch: {status: 'loading', records: []},
            bttv: {status: 'loading', records: []},
            ffz: {status: 'loading', records: []},
            seven_tv: {status: 'loading', records: []}
        };
        S.providersGen = S.flowGen;

        loadTwitchEmotes(preferStatic);
        loadBttvEmotes();
        loadFfzEmotes();
        loadSevenTvEmotes(preferStatic);
    }

    function providerDone(provider, status, records) {
        //Late results after teardown/disconnect (or a new chat session) are dropped
        if (!S.providers || !S.providers[provider] || S.providersGen !== S.flowGen) return;

        S.providers[provider].status = status;
        S.providers[provider].records = records || [];

        rebuildResolver();
        if (!el('pc-picker').hidden) renderPicker(true);
    }

    function loadTwitchEmotes(preferStatic) {
        //Get User Emotes: only emotes the logged-in viewer can actually use.
        //Entries carry NO per-emote image urls — the response has a top-level
        //template the normalizer substitutes into. The broadcaster-context
        //request ADDS follower emotes; it does not filter to one channel, so
        //channel scope is classified by owner_id == this broadcaster.
        var userId = S.session && S.session.userId ? S.session.userId : '',
            gen = S.flowGen;

        function pages(path, onDone, onError) {
            var data = [],
                template = null;

            function page(cursor) {
                Auth.helixGet(path + (cursor ? '&after=' + encodeURIComponent(cursor) : ''), S.session).then(
                    function (response) {
                        if (gen !== S.flowGen) return; //torn down meanwhile

                        if (response.status === 401) {
                            onError();
                            return;
                        }

                        var json = response.json || {};

                        data = data.concat(json.data || []);
                        if (!template && typeof json.template === 'string') template = json.template;

                        var cursorNext = json.pagination && json.pagination.cursor ? json.pagination.cursor : null;

                        if (cursorNext) page(cursorNext);
                        else onDone(data, template);
                    },
                    function () {
                        if (gen !== S.flowGen) return;
                        onError();
                    }
                );
            }

            page(null);
        }

        function error() {
            providerDone('twitch', 'error', []);
        }

        pages(
            'chat/emotes/user?user_id=' + encodeURIComponent(userId),
            function (data, template) {
                var records = Emotes.normalizeTwitchUserEmotes(data, template, 'global', preferStatic);

                if (gen !== S.flowGen) return;

                if (!S.broadcasterId) {
                    providerDone('twitch', records.length ? 'loaded' : 'empty', records);
                    return;
                }

                pages(
                    'chat/emotes/user?user_id=' + encodeURIComponent(userId) + '&broadcaster_id=' + encodeURIComponent(S.broadcasterId),
                    function (channelData, channelTemplate) {
                        if (gen !== S.flowGen) return;

                        var owned = [],
                            i;

                        for (i = 0; i < channelData.length; i++) {
                            if (channelData[i] && channelData[i].owner_id === S.broadcasterId) owned.push(channelData[i]);
                        }

                        var channelRecords = Emotes.normalizeTwitchUserEmotes(owned, channelTemplate || template, 'channel', preferStatic),
                            channelIds = {};

                        for (i = 0; i < channelRecords.length; i++) channelIds[channelRecords[i].id] = true;

                        records = channelRecords.concat(
                            records.filter(function (record) {
                                return !channelIds[record.id];
                            })
                        );

                        providerDone('twitch', records.length ? 'loaded' : 'empty', records);
                    },
                    function () {
                        //Channel context failed: global user emotes are still usable
                        if (gen !== S.flowGen) return;
                        providerDone('twitch', records.length ? 'loaded' : 'empty', records);
                    }
                );
            },
            error
        );
    }

    function loadBttvEmotes() {
        var globalDone = false,
            channelDone = false,
            globalRecords = [],
            channelRecords = [],
            broadcasterId = S.broadcasterId;

        function finish() {
            if (!globalDone || !channelDone) return;
            providerDone('bttv', globalRecords.length || channelRecords.length ? 'loaded' : 'empty', globalRecords.concat(channelRecords));
        }

        fetchJsonTimeout('https://api.betterttv.net/3/cached/emotes/global').then(function (result) {
            if (result.ok && result.json && result.json.length) globalRecords = Emotes.normalizeBttv(result.json, 'global');
            globalDone = true;
            finish();
        });

        fetchJsonTimeout('https://api.betterttv.net/3/cached/users/twitch/' + encodeURIComponent(broadcasterId)).then(function (result) {
            //404/empty is normal: the channel may not have BTTV enabled
            if (result.ok && result.json) {
                channelRecords = Emotes.normalizeBttv(result.json.channelEmotes, 'channel').concat(
                    Emotes.normalizeBttv(result.json.sharedEmotes, 'channel')
                );
            }
            channelDone = true;
            finish();
        });
    }

    function loadFfzEmotes() {
        var globalDone = false,
            channelDone = false,
            globalRecords = [],
            channelRecords = [];

        function finish() {
            if (!globalDone || !channelDone) return;
            providerDone('ffz', globalRecords.length || channelRecords.length ? 'loaded' : 'empty', globalRecords.concat(channelRecords));
        }

        fetchJsonTimeout('https://api.frankerfacez.com/v1/set/global').then(function (result) {
            if (result.ok && result.json) globalRecords = Emotes.normalizeFfz(result.json, 'global');
            globalDone = true;
            finish();
        });

        fetchJsonTimeout('https://api.frankerfacez.com/v1/room/id/' + encodeURIComponent(S.broadcasterId)).then(function (result) {
            if (result.ok && result.json) channelRecords = Emotes.normalizeFfz(result.json, 'channel');
            channelDone = true;
            finish();
        });
    }

    function loadSevenTvEmotes(preferStatic) {
        var globalDone = false,
            channelDone = false,
            globalRecords = [],
            channelRecords = [];

        function finish() {
            if (!globalDone || !channelDone) return;
            providerDone('seven_tv', globalRecords.length || channelRecords.length ? 'loaded' : 'empty', globalRecords.concat(channelRecords));
        }

        fetchJsonTimeout('https://7tv.io/v3/emote-sets/global').then(function (result) {
            if (result.ok && result.json) globalRecords = Emotes.normalizeSevenTv(result.json, 'global', preferStatic);
            globalDone = true;
            finish();
        });

        fetchJsonTimeout('https://7tv.io/v3/users/twitch/' + encodeURIComponent(S.broadcasterId)).then(function (result) {
            //Channel may have no emote set: that is normal
            if (result.ok && result.json) channelRecords = Emotes.normalizeSevenTv(result.json, 'channel', preferStatic);
            channelDone = true;
            finish();
        });
    }

    /*
     * Deterministic resolution order (channel beats global, then 7TV > BTTV > FFZ).
     * Twitch codes are listed last: Twitch rendering is driven by message ranges,
     * so its picker records must never shadow third-party codes here.
     */
    function rebuildResolver() {
        var p = S.providers;

        S.resolver = Emotes.buildResolver([
            p ? p.seven_tv.records.filter(channelOnly) : [],
            p ? p.bttv.records.filter(channelOnly) : [],
            p ? p.ffz.records.filter(channelOnly) : [],
            p ? p.seven_tv.records.filter(globalOnly) : [],
            p ? p.bttv.records.filter(globalOnly) : [],
            p ? p.ffz.records.filter(globalOnly) : [],
            p ? p.twitch.records : []
        ]);
    }

    function channelOnly(record) {
        return record.scope === 'channel';
    }

    function globalOnly(record) {
        return record.scope === 'global';
    }

    /* ---------- badges ---------- */

    function loadBadges() {
        S.badges = {};

        var gen = S.flowGen;

        function merge(json) {
            //A late badge response after teardown/disconnect must not revive state
            if (gen !== S.flowGen) return;

            var sets = json && json.data ? json.data : [],
                i,
                len = sets.length,
                j,
                versions,
                url;

            for (i = 0; i < len; i++) {
                if (!S.badges[sets[i].set_id]) S.badges[sets[i].set_id] = {};

                versions = sets[i].versions || [];

                for (j = 0; j < versions.length; j++) {
                    url = versions[j].image_url_2x || versions[j].image_url_1x;
                    if (url && !S.badges[sets[i].set_id][versions[j].id]) S.badges[sets[i].set_id][versions[j].id] = url;
                }
            }
        }

        Auth.helixGet('chat/badges/global', S.session).then(
            function (response) {
                if (response.status !== 401) merge(response.json);
            },
            function () {
                //Badges are optional decoration
            }
        );

        Auth.helixGet('chat/badges?broadcaster_id=' + encodeURIComponent(S.broadcasterId), S.session).then(
            function (response) {
                if (response.status !== 401) merge(response.json);
            },
            function () {
                //Badges are optional decoration
            }
        );
    }

    /* ---------- picker ---------- */

    function openPicker() {
        el('pc-picker').hidden = false;
        renderPicker(true);
    }

    function closePicker() {
        el('pc-picker').hidden = true;
        el('pc-input').focus();
    }

    function renderPicker(reset) {
        var tabs = el('pc-picker-tabs'),
            grid = el('pc-picker-grid'),
            status = el('pc-picker-status'),
            providerNames = ['twitch', 'bttv', 'ffz', 'seven_tv'],
            i,
            tab,
            scrollTop = reset ? 0 : grid.scrollTop,
            provider = S.pickerTab,
            section = S.providers ? S.providers[provider] : null,
            filter = S.pickerFilter.toLowerCase(),
            all = section ? section.records : [],
            filtered = [],
            count;

        if (reset) S.pickerShown = 0;

        while (tabs.firstChild) tabs.removeChild(tabs.firstChild);

        for (i = 0; i < providerNames.length; i++) {
            tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'pc-tab' + (providerNames[i] === provider ? ' pc-tab-active' : '');
            tab.textContent = ProviderLabels[providerNames[i]];
            tab.setAttribute('data-provider', providerNames[i]);
            tabs.appendChild(tab);
        }

        while (grid.firstChild) grid.removeChild(grid.firstChild);

        if (!section) {
            status.textContent = Strings.emotesLoading;
            return;
        }

        if (section.status === 'loading') {
            status.textContent = Strings.emotesLoading;
            return;
        }

        if (section.status === 'error') {
            status.textContent = Strings.emotesError;
            return;
        }

        for (i = 0; i < all.length; i++) {
            if (!filter || all[i].code.toLowerCase().indexOf(filter) > -1) filtered.push(all[i]);
        }

        if (!filtered.length) {
            status.textContent = Strings.emotesEmpty;
            return;
        }

        count = Math.min(filtered.length, S.pickerShown + PickerChunkSize);

        var grouped = groupByScope(filtered);

        renderPickerSection(grid, 'Channel', grouped.channel, 0, count);
        renderPickerSection(grid, 'Global', grouped.global, 0, count);

        S.pickerShown = count;

        status.textContent = filtered.length > count ? Strings.pickerChunks.replace('%n', String(count)).replace('%t', String(filtered.length)) : '';

        grid.scrollTop = scrollTop;
    }

    function groupByScope(records) {
        var channel = [],
            global = [],
            i;

        for (i = 0; i < records.length; i++) {
            if (records[i].scope === 'channel') channel.push(records[i]);
            else global.push(records[i]);
        }

        return {channel: channel, global: global};
    }

    function renderPickerSection(grid, title, records, start, count) {
        var i,
            len = Math.min(records.length, count),
            cell,
            img;

        if (!len) return;

        var heading = document.createElement('div');
        heading.className = 'pc-picker-section-title';
        heading.textContent = title;
        heading.style.gridColumn = '1 / -1';
        grid.appendChild(heading);

        for (i = start; i < len; i++) {
            cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'pc-emote-cell';
            cell.setAttribute('data-code', records[i].code);
            cell.title = records[i].code;

            img = document.createElement('img');
            img.alt = records[i].code;
            img.loading = 'lazy';
            img.setAttribute('src', records[i].url);
            if (records[i].srcset) img.setAttribute('srcset', records[i].srcset);
            img.onerror = (function (node) {
                return function () {
                    node.parentNode.replaceChild(document.createTextNode(node.alt || ''), node);
                };
            })(img);

            cell.appendChild(img);
            grid.appendChild(cell);
        }
    }

    function insertEmote(code) {
        var input = el('pc-input'),
            value = input.value,
            start = input.selectionStart,
            end = input.selectionEnd,
            needsSpace = start > 0 && value.charAt(start - 1) !== ' ' ? ' ' : '',
            insert = needsSpace + code + ' ';

        if (typeof start === 'number' && typeof end === 'number') {
            input.value = value.slice(0, start) + insert + value.slice(end);
            var caret = start + insert.length;
            input.setSelectionRange(caret, caret);
        } else {
            input.value = value + (value && value.charAt(value.length - 1) !== ' ' ? ' ' : '') + insert;
        }

        input.focus();
    }

    /* ---------- muted users ---------- */

    /*
     * A client-side ignore list: muted logins are hidden on this phone in
     * every tab and never rendered (message ids are still recorded so a
     * replay after an unmute cannot resurrect old rows). Persisted in
     * localStorage across visits; known bots can be muted here without an
     * app update, the static bot list in Render only trims the priority tab.
     */
    function loadMuted() {
        var raw = null,
            list,
            i,
            seen = {},
            out = [];

        try {
            raw = window.localStorage.getItem(MutedKey);
            list = raw ? JSON.parse(raw) : null;
        } catch (ignore) {
            /* Storage blocked or corrupt: keep the list in memory for this visit only. */
        }
        if (!Array.isArray(list)) return out;

        for (i = 0; i < list.length && out.length < MutedLimit; i++) {
            //Logins are the only thing ever stored: strict shape check on load
            if (typeof list[i] === 'string' && /^[a-z0-9_]{3,25}$/.test(list[i]) && !seen[list[i]]) {
                seen[list[i]] = true;
                out.push(list[i]);
            }
        }
        return out;
    }

    function saveMuted() {
        try {
            window.localStorage.setItem(MutedKey, JSON.stringify(mutedLogins));
        } catch (ignore) {
            /* Storage blocked: the in-memory list still works this visit. */
        }
    }

    function isMuted(login) {
        return typeof login === 'string' && mutedLogins.indexOf(login.toLowerCase()) !== -1;
    }

    function removeRowsForLogin(login) {
        var rows = el('pc-messages').querySelectorAll('[data-login="' + cssEscape(login) + '"]'),
            i;

        for (i = 0; i < rows.length; i++) {
            if (rows[i].parentNode) rows[i].parentNode.removeChild(rows[i]);
        }
        updateChatEmpty();
    }

    function setMuted(login, muted) {
        var index = mutedLogins.indexOf(login);

        if (muted) {
            if (index === -1) {
                mutedLogins.push(login);
                if (mutedLogins.length > MutedLimit) mutedLogins.shift();
                saveMuted();
            }
            removeRowsForLogin(login);
        } else if (index !== -1) {
            mutedLogins.splice(index, 1);
            saveMuted();
        }

        updateMutedButton();
    }

    function updateMutedButton() {
        var button = el('pc-muted-button');

        button.textContent = Strings.mutedButton.replace('%n', String(mutedLogins.length));
        button.hidden = false;
    }

    //Long-press (mobile) or right-click (desktop) on a chat message row
    function rowFromEventTarget(target) {
        var node = target,
            box = el('pc-messages');

        while (node && node !== box) {
            if (node.getAttribute && node.getAttribute('data-login')) return node;
            node = node.parentNode;
        }
        return null;
    }

    function openRowMenu(row) {
        var login = row.getAttribute('data-login'),
            name = row.getAttribute('data-name') || login,
            muted = isMuted(login);

        rowMenuLogin = login;
        el('pc-row-menu-title').textContent = (muted ? Strings.unmuteAction : Strings.muteAction).replace('%s', name);
        el('pc-row-menu-mute').textContent = muted ? Strings.unmute : Strings.mute;
        el('pc-row-menu').hidden = false;
    }

    function closeRowMenu() {
        el('pc-row-menu').hidden = true;
        rowMenuLogin = null;
    }

    function rowTouchCancel() {
        if (rowTouch && rowTouch.timer) clearTimeout(rowTouch.timer);
        rowTouch = null;
    }

    function rowTouchStart(event) {
        var row = event.touches && event.touches.length === 1 ? rowFromEventTarget(event.target) : null,
            state;

        rowTouchCancel();
        if (!row || (S.session && row.getAttribute('data-login') === S.session.login)) return;

        state = {row: row, x: event.touches[0].clientX, y: event.touches[0].clientY, opened: false, timer: null};
        state.timer = setTimeout(function () {
            if (rowTouch !== state) return;
            state.timer = null;
            state.opened = true;
            openRowMenu(row);
        }, LongPressMs);
        rowTouch = state;
    }

    function rowTouchMove(event) {
        var touch = event.touches && event.touches[0];

        if (!rowTouch || rowTouch.opened || !touch) return;
        if (Math.abs(touch.clientX - rowTouch.x) > LongPressSlopPx || Math.abs(touch.clientY - rowTouch.y) > LongPressSlopPx) rowTouchCancel();
    }

    //The release that ends a long-press would still deliver a click, which lands
    //on the sheet backdrop and closes it again
    function rowTouchEnd(event) {
        var opened = rowTouch !== null && rowTouch.opened;

        rowTouchCancel();
        if (opened) event.preventDefault();
    }

    function openMutedPanel() {
        renderMutedList();
        el('pc-muted-panel').hidden = false;
    }

    function closeMutedPanel() {
        el('pc-muted-panel').hidden = true;
    }

    function renderMutedList() {
        var list = el('pc-muted-list'),
            i,
            row,
            name,
            button;

        while (list.firstChild) list.removeChild(list.firstChild);

        if (!mutedLogins.length) {
            list.appendChild(document.createTextNode(Strings.mutedEmpty));
            return;
        }

        for (i = 0; i < mutedLogins.length; i++) {
            row = document.createElement('div');
            row.className = 'pc-muted-row';

            name = document.createElement('span');
            name.className = 'pc-muted-name';
            name.textContent = mutedLogins[i];

            button = document.createElement('button');
            button.type = 'button';
            button.className = 'pc-button pc-muted-unmute';
            button.textContent = Strings.unmute;
            button.setAttribute('data-unmute', mutedLogins[i]);

            row.appendChild(name);
            row.appendChild(button);
            list.appendChild(row);
        }
    }

    /* ---------- account button ---------- */

    function updateAccountButton() {
        var button = el('pc-account-button');

        if (S.deviceLogin) {
            button.textContent = 'Cancel';
            button.setAttribute('data-action', 'cancel');
        } else if (S.session && S.sessionValid) {
            button.textContent = Strings.disconnect;
            button.setAttribute('data-action', 'disconnect');
        } else {
            button.textContent = Strings.connect;
            button.setAttribute('data-action', 'connect');
        }

        button.hidden = !S.originOk;
    }

    function disconnect() {
        cancelDeviceLogin();
        S.authGen++;
        S.refreshing = null;
        //Ends THIS page's session only; the Twitch authorization itself is not revoked
        S.flowGen++; //late callbacks from the old session must not touch the next one
        setModeration(false, 0);
        if (S.transport) S.transport.stop();
        Auth.clearSession();
        S.session = null;
        S.sessionValid = false;
        S.started = false;
        S.resolver = null;
        S.providers = null;
        S.store = null;
        S.spam = {};
        S.spamOrder = [];
        S.broadcasterId = null;
        S.localEchoes = [];
        S.ownBadges = null;
        setComposerEnabled(false);
        cancelRowFlush();
        el('pc-messages').textContent = '';
        updateChatEmpty();
        closePicker();
        updateAccountButton();
        showBanner('signed_out', false, Strings.connect);
        setConnection('Signed out', '');
    }

    /* ---------- network lifecycle ---------- */

    function goOffline() {
        showBanner('stateOffline', true, null);
        setConnection('Offline', 'bad');
        if (S.transport) S.transport.stop();
    }

    function goOnline() {
        //Only resume when there is a session to resume: signed-out and error
        //states keep their banner (pageshow fires on first load too)
        if (!S.sessionValid || !S.session || (S.local && !S.tvReady)) return;

        //An already-connected transport (quick background/return) stays as is
        if (S.transport && S.transport.isConnected()) return;

        showBanner(null);
        if (S.broadcasterId) startTransport();
        else startChat();
    }

    /* ---------- boot ---------- */

    function wire() {
        el('pc-account-button').addEventListener('click', function () {
            if (el('pc-account-button').getAttribute('data-action') === 'cancel') {
                cancelDeviceLogin();
                showBanner('signed_out', false, Strings.connect);
            } else if (el('pc-account-button').getAttribute('data-action') === 'disconnect') disconnect();
            else startLogin();
        });

        el('pc-banner-action').addEventListener('click', function () {
            if (S.session && S.sessionValid) startChat();
            else startLogin();
        });

        el('pc-device-cancel').addEventListener('click', function () {
            cancelDeviceLogin();
            showBanner('signed_out', false, Strings.connect);
        });

        el('pc-jump-latest').addEventListener('click', scrollToBottom);

        updateMutedButton();

        el('pc-messages').addEventListener('click', function (event) {
            var target = event.target,
                row;
            if (!target || !target.getAttribute || target.getAttribute('data-user-action') !== 'true') return;
            row = rowFromEventTarget(target);
            if (row && (!S.session || row.getAttribute('data-login') !== S.session.login)) openRowMenu(row);
        });

        el('pc-muted-button').addEventListener('click', openMutedPanel);
        el('pc-muted-close').addEventListener('click', closeMutedPanel);
        el('pc-muted-panel').addEventListener('click', function (event) {
            //Backdrop tap closes; taps inside the card belong to its controls
            if (event.target === el('pc-muted-panel')) closeMutedPanel();
        });
        el('pc-muted-list').addEventListener('click', function (event) {
            var login = event.target && event.target.getAttribute ? event.target.getAttribute('data-unmute') : null;

            if (!login) return;
            setMuted(login, false);
            renderMutedList();
        });

        el('pc-messages').addEventListener('contextmenu', function (event) {
            var row = rowFromEventTarget(event.target);

            if (!row) return;
            //Message rows own the long-press: no native callout. Own rows have no action.
            event.preventDefault();
            if (S.session && row.getAttribute('data-login') === S.session.login) return;
            //Android also fires contextmenu for the press the touch timer owns; the
            //press keeps the sheet either way so its release cannot close it
            if (rowTouch) {
                if (rowTouch.opened) return;
                clearTimeout(rowTouch.timer);
                rowTouch.timer = null;
                rowTouch.opened = true;
            }
            openRowMenu(row);
        });
        el('pc-messages').addEventListener('touchstart', rowTouchStart, {passive: true});
        el('pc-messages').addEventListener('touchmove', rowTouchMove, {passive: true});
        el('pc-messages').addEventListener('touchend', rowTouchEnd);
        el('pc-messages').addEventListener('touchcancel', rowTouchCancel);
        el('pc-row-menu-mute').addEventListener('click', function () {
            if (rowMenuLogin) setMuted(rowMenuLogin, !isMuted(rowMenuLogin));
            closeRowMenu();
        });
        el('pc-row-menu-cancel').addEventListener('click', closeRowMenu);
        el('pc-row-menu').addEventListener('click', function (event) {
            if (event.target === el('pc-row-menu')) closeRowMenu();
        });

        el('pc-chat-all').addEventListener('click', function () {
            selectChatTab('all');
        });
        el('pc-chat-priority').addEventListener('click', function () {
            selectChatTab('priority');
        });
        el('pc-chat-tabs').addEventListener('keydown', function (event) {
            var tab;
            if (event.key === 'ArrowLeft' || event.key === 'Home') tab = 'all';
            else if (event.key === 'ArrowRight' || event.key === 'End') tab = 'priority';
            else return;
            event.preventDefault();
            selectChatTab(tab);
            el(tab === 'all' ? 'pc-chat-all' : 'pc-chat-priority').focus();
        });

        el('pc-messages').addEventListener('scroll', function () {
            var top = el('pc-messages').scrollTop;
            // A queued event from our last scroll may arrive after new rows grew the box.
            if (rowAutoScrollTop !== null && top === rowAutoScrollTop) {
                rowAutoScrollTop = null;
                return;
            }
            rowAutoScrollTop = null;
            S.nearBottom = nearBottom();
            if (S.nearBottom) el('pc-jump-latest').hidden = true;
        });

        el('pc-send').addEventListener('click', trySend);

        el('pc-emote-button').addEventListener('click', function () {
            if (el('pc-picker').hidden) openPicker();
            else closePicker();
        });

        el('pc-picker-close').addEventListener('click', closePicker);

        el('pc-picker-search').addEventListener('input', function () {
            S.pickerFilter = el('pc-picker-search').value || '';
            renderPicker(true);
        });

        el('pc-picker-tabs').addEventListener('click', function (event) {
            var target = event.target;
            if (!target || !target.getAttribute || !target.getAttribute('data-provider')) return;
            S.pickerTab = target.getAttribute('data-provider');
            renderPicker(true);
        });

        el('pc-picker-grid').addEventListener('click', function (event) {
            var target = event.target;
            while (target && target !== el('pc-picker-grid')) {
                if (target.getAttribute && target.getAttribute('data-code')) {
                    insertEmote(target.getAttribute('data-code'));
                    return;
                }
                target = target.parentNode;
            }
        });

        var input = el('pc-input');

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !S.composing) {
                event.preventDefault();
                trySend();
            }
        });

        input.addEventListener('compositionstart', function () {
            S.composing = true;
        });

        input.addEventListener('compositionend', function () {
            S.composing = false;
        });

        window.addEventListener('online', function () {
            if (S.local) Local.resume();
            goOnline();
        });
        window.addEventListener('offline', function () {
            if (S.local) {
                Local.stop();
                S.tvReady = false;
            }
            goOffline();
        });

        setupViewportSync();

        window.addEventListener('pagehide', function () {
            cancelRowFlush();
            if (S.local) {
                Local.stop();
                S.tvReady = false;
            }
            //No duplicate connections across resume: drop the socket cleanly
            if (S.transport) S.transport.stop();
        });

        window.addEventListener('pageshow', function () {
            if (S.local) Local.resume();
            goOnline();
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                // Hidden pages may suspend animation frames while IRC still receives messages.
                if (rowFlushHandle !== null) {
                    var pendingVisible = rowFlushVisible;
                    cancelRowFlush();
                    scheduleRowFlush(pendingVisible);
                }
                if (S.local) Local.stop();
                S.lastHiddenAt = Date.now();
                return;
            }

            if (S.local) {
                S.tvReady = false;
                refreshComposer();
                Local.resume();
            }
            //After a long background interval, revalidate the session
            if (S.lastHiddenAt && Date.now() - S.lastHiddenAt > PhoneChatConfig.backgroundRevalidateMs) {
                revalidateSession();
            }

            goOnline();
        });

        //Periodic revalidation while the page is in use
        setInterval(function () {
            if (!document.hidden && S.session) revalidateSession();
        }, PhoneChatConfig.sessionRevalidateMs);

        //Picker lazy chunks: render the next bounded chunk when scrolled near the end
        el('pc-picker-grid').addEventListener('scroll', function () {
            var grid = el('pc-picker-grid');

            if (grid.scrollTop + grid.clientHeight < grid.scrollHeight - 40) return;

            var section = S.providers ? S.providers[S.pickerTab] : null;

            if (!section || !section.records.length) return;
            if (S.pickerShown >= section.records.length) return;

            renderPicker(false);
        });
    }

    function setLocalChannel(channel) {
        var changed = channel !== S.channel;
        S.tvReady = !!channel;
        if (changed) {
            cancelRowFlush();
            S.flowGen++;
            S.providersGen++;
            if (S.transport) S.transport.stop();
            S.transport = null;
            S.started = false;
            S.channel = channel;
            S.channelDisplayName = null;
            S.tvHistorySeq = 0;
            S.broadcasterId = null;
            S.store = null;
            S.spam = {};
            S.spamOrder = [];
            S.localEchoes = [];
            S.resolver = null;
            S.providers = null;
            S.badges = null;
            S.ownBadges = null;
            S.slowMode = 0;
            S.lastSendTime = 0;
            S.nearBottom = true;
            setModeration(false, 0);
            el('pc-input').value = '';
            el('pc-messages').textContent = '';
            updateChatEmpty();
            el('pc-jump-latest').hidden = true;
            closePicker();
            el('pc-channel-name').textContent = channel || 'SPTV Chat';
        }
        if (!channel) {
            setComposerEnabled(false);
            if (!S.deviceLogin) showBanner('stateTvWaiting', false, null);
            setConnection('TV connected', '');
            return;
        }
        if (!Auth.isConfigured()) {
            showBanner('config_missing', true, null);
            return;
        }
        if (S.deviceLogin) return;
        if (S.sessionValid) {
            if (!S.started) startChat();
            else goOnline();
        } else if (!S.session) showBanner('signed_out', false, Strings.connect);
        refreshComposer();
    }

    function receiveTVHistory(history) {
        if (!history || !Array.isArray(history.events)) return;
        var i,
            event,
            rows,
            j,
            offset = Date.now() - Number(history.now || Date.now());
        // Fold any pending live maintenance into this synchronous replay.
        var visible = rowFlushVisible;
        cancelRowFlush();
        rowFlushVisible = visible;
        rowBatchDepth++;
        try {
            for (i = 0; i < history.events.length; i++) {
                event = history.events[i];
                if (!event || event.seq <= S.tvHistorySeq) continue;
                if (event.type === 'message' && event.message) {
                    event.message.receivedAt = event.time + offset;
                    onChatMessage(event.message);
                } else if (event.type === 'delete') onClearMsg(event.id);
                else if (event.type === 'clear') {
                    rows = el('pc-messages').children;
                    for (j = rows.length - 1; j >= 0; j--) {
                        if (
                            (!event.userId || rows[j].getAttribute('data-user-id') === event.userId) &&
                            Number(rows[j].getAttribute('data-time')) <= event.time + offset
                        )
                            rows[j].parentNode.removeChild(rows[j]);
                    }
                }
                S.tvHistorySeq = event.seq;
            }
        } finally {
            rowBatchDepth--;
            if (!rowBatchDepth) flushRows();
        }
    }

    function initLocal() {
        S.local = true;
        S.originOk = true;
        updateAccountButton();
        showBanner('stateTvWaiting', false, null);
        Local.start(
            setLocalChannel,
            function (unpaired) {
                S.tvReady = false;
                if (S.transport) S.transport.stop();
                refreshComposer();
                showBanner(unpaired ? 'statePairingExpired' : 'stateTvUnavailable', true, null);
                setConnection(unpaired ? 'Scan the TV QR again' : 'TV disconnected', 'bad');
            },
            receiveTVHistory
        );
        var saved = Auth.loadSession();
        if (saved && Auth.isConfigured()) {
            S.session = saved;
            revalidateSession().then(function (valid) {
                if (valid) startChat();
            });
        }
    }

    function init() {
        el('pc-channel-name').textContent = 'SPTV Chat';
        setComposerEnabled(false);

        if (Local.isLocalPage()) {
            if (!Auth.storageAvailable()) {
                showBanner('storage', true, null);
                return;
            }
            initLocal();
            return;
        }

        //The page must be served from a configured origin
        S.originOk = !!Auth.currentCallbackUrl();

        //OAuth returns land on the REGISTERED callback URL, which carries NO
        //?channel — so any callback data must be processed BEFORE the ordinary
        //missing-channel check below can reject boot (and the token fragment
        //must leave the address bar on every path, including failure)
        if (hasCallbackData()) {
            handleCallback();
            return;
        }

        if (!Auth.storageAvailable()) {
            showBanner('storage', true, null);
            updateAccountButton();
            return;
        }

        //Channel from the QR link (?channel=login)
        var params = Auth.parseParams(window.location.search);

        S.channel = normalizeChannel(params.channel || '');

        if (!S.channel) {
            showBanner('no_channel', true, null);
            setConnection('No channel', 'bad');
            updateAccountButton();
            return;
        }

        el('pc-channel-name').textContent = S.channel;

        if (!S.originOk) {
            showBanner('origin', true, null);
            updateAccountButton();
            return;
        }

        //Missing owner configuration is a visible state, not a crash
        if (!Auth.isConfigured()) {
            showBanner('config_missing', true, null);
            setConnection('Not configured', 'bad');
            updateAccountButton();
            return;
        }

        //Saved session (same tab): validate and continue
        var saved = Auth.loadSession();

        if (saved) {
            S.session = saved;
            updateAccountButton();
            showBanner('stateAuthorizing', false, null);
            revalidateSession().then(function (valid) {
                if (valid) {
                    S.sessionValid = true;
                    startChat();
                } else if (S.session && S.session.login) {
                    //Network failure kept the session: still try chat with it
                    S.sessionValid = true;
                    startChat();
                }
            });
            return;
        }

        showBanner('signed_out', false, Strings.connect);
        updateAccountButton();
    }

    SPTVPhoneChat.boot = function () {
        wire();
        init();
    };

    return {
        normalizeChannel: normalizeChannel,
        startLogin: startLogin,
        disconnect: disconnect,
        insertEmote: insertEmote,
        trySend: trySend
    };
})();

(function () {
    var boot = function () {
        SPTVPhoneChat.boot();
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
