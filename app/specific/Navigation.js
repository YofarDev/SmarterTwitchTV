/* Logical routes over existing screen IDs. Construct lazily: source and bundle load orders differ. */
var Navigation_State = {destination: 'following', tab: 0, generation: 0, account: '', origins: [], bookmarks: []};
var Navigation_BookmarkLimit = 24;

function Navigation_Destinations() {
    return [
        {id: 'following', screens: [Main_UserLive, Main_UserVod, Main_UserChannels, Main_usergames], account: true},
        {id: 'browse', screens: [Main_Live, Main_Featured, Main_games, Main_Vod, Main_Clip]},
        {id: 'search', screens: [Main_Search, Main_SearchLive, Main_SearchChannels, Main_SearchGames, Main_SearchVod]},
        {id: 'library', screens: [Main_HistoryLive, Main_HistoryVod, Main_HistoryClip], account: true},
        {id: 'account', screens: [Main_Users, Main_addUser, Main_Blocked]},
        {id: 'settings', screens: []},
        {id: 'exit', screens: []}
    ];
}

function Navigation_Route(screen) {
    var routes = Navigation_Destinations(),
        i,
        tab;
    for (i = 0; i < routes.length; i++) {
        tab = routes[i].screens.indexOf(screen);
        if (tab !== -1) return {destination: routes[i].id, tab: tab, screen: screen};
    }
    return null; // Channel/category details inherit their actual origin, not a guessed top-level destination.
}

function Navigation_Target(destination, tab) {
    var routes = Navigation_Destinations(),
        i;
    for (i = 0; i < routes.length; i++) {
        if (routes[i].id === destination && tab >= 0 && tab === Math.floor(tab) && tab < routes[i].screens.length) {
            return routes[i].screens[tab];
        }
    }
    return null;
}

function Navigation_SetAccount(account) {
    account = String(account || '');
    if (Navigation_State.account === account) return false;
    Navigation_State.account = account;
    Navigation_State.generation++;
    Navigation_State.origins = [];
    Navigation_State.bookmarks = [];
    Search_SessionEnd(); // stale account data must not survive a switch
    return true;
}

function Navigation_Context(context) {
    return {account: Navigation_State.account, generation: Navigation_State.generation, context: context};
}

function Navigation_IsCurrent(ticket, context) {
    return Boolean(
        ticket && ticket.account === Navigation_State.account && ticket.generation === Navigation_State.generation && ticket.context === context
    );
}

function Navigation_SaveBookmark(screen, context, itemId, index, anchor) {
    var bookmarks = Navigation_State.bookmarks,
        i;
    for (i = bookmarks.length - 1; i >= 0; i--) {
        if (bookmarks[i].screen === screen && bookmarks[i].context === context) bookmarks.splice(i, 1);
    }
    bookmarks.push({screen: screen, context: context, itemId: itemId, index: index, anchor: anchor, account: Navigation_State.account});
    if (bookmarks.length > Navigation_BookmarkLimit) bookmarks.shift();
}

function Navigation_Bookmark(screen, context) {
    var bookmarks = Navigation_State.bookmarks,
        i;
    for (i = bookmarks.length - 1; i >= 0; i--) {
        if (bookmarks[i].screen === screen && bookmarks[i].context === context && bookmarks[i].account === Navigation_State.account) {
            return bookmarks[i];
        }
    }
    return null;
}

function Navigation_Enter(screen, origin) {
    var route = Navigation_Route(screen);
    if (origin) {
        Navigation_State.origins.push(origin);
        if (Navigation_State.origins.length > Navigation_BookmarkLimit) Navigation_State.origins.shift();
    }
    if (route) {
        Navigation_State.destination = route.destination;
        Navigation_State.tab = route.tab;
    }
    Navigation_State.generation++;
    return route;
}

function Navigation_BackOrigin() {
    return Navigation_State.origins.pop() || null;
}

/* The integration supplies the existing lifecycle, never a second screen registry or listener. */
function Navigation_Transition(screen, adapter, origin) {
    if (!adapter || !adapter.valid(screen)) return false;
    adapter.capture();
    adapter.cancelPreview();
    UIFocus_Clear();
    adapter.exit();
    Navigation_Enter(screen, origin);
    adapter.init(screen);
    return true;
}

/* Startup policy only; callers retain the current intent/restore implementation. */
function Navigation_Startup(options) {
    if (options.intent) return {action: 'intent', screen: options.intentScreen};
    if (options.startUser) return {action: 'screen', screen: Main_Users};
    if (options.restore && options.wasPlaying) return {action: 'restore', screen: options.previousScreen};
    if (options.explicitScreen !== undefined && options.explicitScreen !== null) return {action: 'screen', screen: options.explicitScreen};
    return {action: options.hasAccount ? 'screen' : 'onboarding', screen: options.hasAccount ? Main_UserLive : null};
}

var Navigation_Region = '';
var Navigation_Position = 0;
var Navigation_Callback = null;
var Navigation_Onboarding = false;
var Navigation_LastScreen = null;
var Navigation_RequestSerial = 0;

function Navigation_Account() {
    return AddUser_UsernameArray[0] ? String(AddUser_UsernameArray[0].id || AddUser_UsernameArray[0].name) : '';
}

function Navigation_Labels() {
    return [
        STR_UI.following,
        STR_UI.browse,
        STR_SEARCH,
        STR_UI.library,
        STR_UI.account,
        STR_SETTINGS,
        STR_EXIT,
        STR_ABOUT,
        STR_CONTROLS,
        STR_UPDATE_CHANGELOG
    ];
}

function Navigation_Tabs(destination) {
    if (destination === 'following') return [STR_UI.liveNow, STR_VIDEOS, STR_CHANNELS, STR_UI.categories];
    if (destination === 'browse') return [STR_LIVE, STR_FEATURED, STR_UI.categories, STR_VIDEOS, STR_CLIPS];
    if (destination === 'library') return [STR_LIVE, STR_VIDEOS, STR_CLIPS];
    if (destination === 'search')
        // With results in the session the form tab is Edit search, keeping the visible path to correct a query.
        return [Search_Session.active && Search_Session.submitted ? STR_EDIT_SEARCH : STR_SEARCH, STR_LIVE, STR_CHANNELS, STR_UI.categories, STR_VIDEOS];
    if (destination === 'account') return [STR_UI.switchAccount, STR_USER_ADD, STR_USER_MY_CHANNEL, STR_BLOCKED];
    return [];
}

function Navigation_Button(parent, id, label, callback, icon) {
    var button = document.createElement('button'),
        span = document.createElement('span');
    button.type = 'button';
    button.id = id;
    button.className = 'navigation-button';
    button.setAttribute('aria-label', label);
    if (icon) {
        var glyph = document.createElement('i');
        glyph.className = 'icon icon-' + icon;
        glyph.setAttribute('aria-hidden', 'true');
        button.appendChild(glyph);
    }
    span.textContent = label;
    button.appendChild(span);
    button.onclick = callback;
    if (id.indexOf('navigation-') === 0) {
        button.onfocus = function () {
            Navigation_ElementFocus(id);
        };
        button.onkeydown = function (event) {
            if (!Navigation_Region) {
                var region =
                    id.indexOf('navigation-route-') === 0 || id === 'navigation-about' || id === 'navigation-help' || id === 'navigation-updates'
                        ? 'rail'
                        : id.indexOf('navigation-recovery-') === 0
                          ? 'recovery'
                          : 'tabs';
                Navigation_Open(null, region);
            }
            Navigation_ElementFocus(id);
            UIFocus_Dispatch(event, false);
        };
    }
    parent.appendChild(button);
    return button;
}

/* Contextual footer hint, resolved from the active screen, editing state and card subtarget.
 * Updated on screen/region/subtarget changes, never per rendered frame. */
function Navigation_UpdateHint(screen) {
    var hint;
    if (screen === Main_Search) hint = STR_UI.searchHelp;
    else if (Settings_isVisible()) hint = STR_UI.settingsNavHelp;
    else if (ScreenObj[screen] && ScreenObj[screen].posSub === Screens_SubActions) hint = STR_UI.actionsHelp;
    else if (Screens_DirectInputMode()) hint = STR_UI.browseHelpDirect;
    else hint = STR_UI.browseHelp;
    Main_innerHTML('navigation-footer', Navigation_KeyHintHtml(hint));
}

//Remote keys in the hint strings, drawn with the bundled icon font like the rail glyphs
var Navigation_KeyGlyphs = {
    up: 'key-up',
    down: 'key-down',
    left: 'key-left',
    right: 'key-right',
    back: 'return'
};

/* Hint strings name keys as {ok}, {up}, {down}, {left}, {right} and {back} so translations keep plain labels;
 * the text is escaped and each placeholder becomes its key: OK is a small key cap, the others icon glyphs.
 * Key groups are separated by a run of spaces in the strings, drawn as a divider. */
function Navigation_KeyHintHtml(text) {
    return Screens_AriaEscape(text)
        .replace(/\{(\w+)\}/g, function (match, key) {
            if (key === 'ok') return '<span class="navigation-key navigation-key-ok" aria-hidden="true">OK</span>';
            return Navigation_KeyGlyphs.hasOwnProperty(key)
                ? '<i class="icon icon-' + Navigation_KeyGlyphs[key] + ' navigation-key" aria-hidden="true"></i>'
                : match;
        })
        .replace(/ {3,}/g, ' <span class="navigation-key-divider" aria-hidden="true"></span> ');
}

function Navigation_Render(screen) {
    var rail = Main_getElementById('navigation-destinations');
    if (!rail || !STR_UI) return;
    Navigation_SyncAccount();
    var route = Navigation_Route(screen),
        routes = Navigation_Destinations(),
        labels = Navigation_Labels(),
        icons = ['heart', 'gamepad', 'search', 'history', 'user', 'options', 'return'],
        i,
        tabLabels,
        button;
    if (route && !Navigation_Onboarding) {
        Navigation_State.destination = route.destination;
        Navigation_State.tab = screen === Main_Blocked ? 3 : route.tab;
    }
    if (Settings_isVisible()) {
        Navigation_State.destination = 'settings';
        Navigation_State.tab = 0;
    }
    if (Navigation_LastScreen !== screen) {
        Navigation_State.generation++;
        Navigation_LastScreen = screen;
    }
    Main_emptyWithEle(rail);
    for (i = 0; i < routes.length; i++) {
        button = Navigation_Button(rail, 'navigation-route-' + i, labels[i], Navigation_Activate.bind(null, i), icons[i]);
        if (routes[i].id === Navigation_State.destination) button.setAttribute('aria-current', 'page');
    }
    Main_textContent(
        'navigation-heading',
        labels[
            routes
                .map(function (item) {
                    return item.id;
                })
                .indexOf(Navigation_State.destination)
        ]
    );
    Main_textContent(
        'navigation-account',
        AddUser_UsernameArray[0] ? AddUser_UsernameArray[0].display_name || AddUser_UsernameArray[0].name : STR_UI.noAccount
    );
    Main_empty('navigation-tabs');
    tabLabels = Navigation_Tabs(Navigation_State.destination);
    for (i = 0; i < tabLabels.length; i++) {
        button = Navigation_Button(Main_getElementById('navigation-tabs'), 'navigation-tab-' + i, tabLabels[i], Navigation_ActivateTab.bind(null, i));
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(i === Navigation_State.tab));
    }
    Main_textContent('navigation-refresh', STR_REFRESH);
    Navigation_UpdateHint(screen);
    Main_getElementById('navigation-refresh').onclick = Navigation_Refresh;
    Navigation_BindStaticKeys();
    Main_AddClass('scene1', 'navigation-enabled');
    var obj = ScreenObj[screen],
        live = Boolean(obj && obj.screenType === 0 && !obj.isHistory && !Settings_isVisible());
    if (live && !Navigation_Onboarding) Main_AddClass('scene1', 'navigation-live');
    else Main_RemoveClass('scene1', 'navigation-live');
    if (live && !Navigation_Onboarding) Main_ShowElement('navigation-details');
    else Main_HideElement('navigation-details');
    Main_ShowElement('navigation-shell');
    if (Settings_isVisible()) {
        Main_HideElement('navigation-tabs');
        Main_HideElement('navigation-refresh');
    } else {
        Main_ShowElement('navigation-tabs');
        Main_ShowElement('navigation-refresh');
    }
    Main_textContent('navigation-about', STR_ABOUT);
    Main_textContent('navigation-help', STR_CONTROLS);
    Main_textContent('navigation-updates', STR_UPDATE_CHANGELOG);
    Navigation_SetUpdateBadge(Boolean(Main_HasUpdate));
    Main_getElementById('navigation-about').onclick = Navigation_Activate.bind(null, 7);
    Main_getElementById('navigation-help').onclick = Navigation_Activate.bind(null, 8);
    Main_getElementById('navigation-updates').onclick = Navigation_Activate.bind(null, 9);
    Navigation_UpdateDetails(screen);
}

function Navigation_SyncAccount() {
    if (!Navigation_SetAccount(Navigation_Account())) return;
    Navigation_FeedRequests = {};
    for (var feed = UserLiveFeedobj_UserLivePos; feed <= UserLiveFeedobj_UserVodHistoryPos; feed++) {
        if (!UserLiveFeed_obj[feed]) continue;
        Navigation_FeedGenerations[feed] = (Navigation_FeedGenerations[feed] || 0) + 1;
        UserLiveFeed_DataObj[feed] = [];
        UserLiveFeed_loadingData[feed] = false;
        UserLiveFeed_status[feed] = false;
        UserLiveFeed_obj[feed].loadingMore = false;
        if (UserLiveFeed_obj[feed].div) Main_emptyWithEle(UserLiveFeed_obj[feed].div);
    }
    // An in-flight response carries the old account ticket; clear account-scoped rendered data now.
    for (var key in ScreenObj) {
        var obj = ScreenObj[key];
        if (obj.IsUser || obj.isHistory || Number(key) === Main_Blocked) {
            obj.navigationRequest = null;
            obj.navigationPreview = null;
            obj.status = false;
            obj.loadingData = false;
            obj.isRefreshing = false;
            obj.DataObj = {};
            obj.Cells = [];
            obj.itemsCount = 0;
            if (obj.tableDoc) Main_emptyWithEle(obj.tableDoc);
        }
    }
}

function Navigation_Focus() {
    var shell = Main_getElementById('navigation-shell'),
        old = shell.querySelector('.navigation-focused'),
        id;
    if (old) old.classList.remove('navigation-focused');
    if (Navigation_Region === 'rail')
        id =
            Navigation_Position < 7
                ? 'navigation-route-' + Navigation_Position
                : ['navigation-about', 'navigation-help', 'navigation-updates'][Navigation_Position - 7];
    else if (Navigation_Region === 'tabs')
        id =
            Navigation_Position < Navigation_Tabs(Navigation_State.destination).length
                ? 'navigation-tab-' + Navigation_Position
                : 'navigation-refresh';
    else id = 'navigation-recovery-' + Navigation_Position;
    var target = Main_getElementById(id);
    if (target) {
        target.classList.add('navigation-focused');
        target.focus();
    }
}

function Navigation_Open(callback, region) {
    if (Navigation_Region) Navigation_Close(false);
    Navigation_Callback = callback || (ScreenObj[Main_values.Main_Go] && ScreenObj[Main_values.Main_Go].key_fun);
    Navigation_Region = region || 'rail';
    Navigation_Position = Navigation_Region === 'tabs' ? Navigation_State.tab : 0;
    if (Navigation_Region === 'rail') {
        var routes = Navigation_Destinations();
        for (var i = 0; i < routes.length; i++) if (routes[i].id === Navigation_State.destination) Navigation_Position = i;
    }
    if (Navigation_Callback) Main_removeEventListener('keydown', Navigation_Callback);
    Screens_LoadPreviewSTop();
    if (Navigation_Region === 'rail') Main_AddClass('navigation-rail', 'navigation-expanded');
    UIFocus_Push({
        id: 'navigation',
        handle: Navigation_Handle,
        cleanup: function () {
            Navigation_Region = '';
            Main_RemoveClass('navigation-rail', 'navigation-expanded');
            // Both the shell and the onboarding section can hold a focus treatment.
            var focused = document.querySelectorAll('#navigation-shell .navigation-focused, #navigation-onboarding .navigation-focused'),
                i;
            for (i = 0; i < focused.length; i++) focused[i].classList.remove('navigation-focused');
            // The shell took DOM focus in Navigation_Focus; release it so the restored content owner can take input.
            UIFocus_DomRelease(Main_getElementById('navigation-shell'));
            UIFocus_DomRelease(Main_getElementById('navigation-onboarding'));
            Main_removeEventListener('keydown', Navigation_HandleListener);
        }
    });
    Main_addEventListener('keydown', Navigation_HandleListener);
    Navigation_Focus();
}

function Navigation_HandleListener() {
    // UIFocus_Listener owns dispatch, including suspension and held-key release.
}

function Navigation_Close(restore) {
    if (Navigation_Region) UIFocus_Pop(false);
    if (restore && Navigation_Callback) {
        Main_addEventListener('keydown', Navigation_Callback);
        var obj = ScreenObj[Main_values.Main_Go];
        // Settings and the search form keep their own focus treatment; the grid behind must not take it.
        if (obj && obj.addFocus && obj.itemsCount && !Navigation_Onboarding && !Settings_isVisible() && Main_values.Main_Go !== Main_Search)
            Screens_addFocus(true, Main_values.Main_Go);
        if (obj && obj.emptyContent && Main_values.Main_Go === Main_UserLive && !Navigation_Onboarding)
            Main_getElementById('navigation-retry').focus();
    }
}

function Navigation_Handle(event, up) {
    if (up) return true;
    var code = event.keyCode;
    if (code === 9) return false;
    var tabs = Navigation_Tabs(Navigation_State.destination);
    if (code === KEY_RETURN || code === KEY_KEYBOARD_BACKSPACE || code === 27) {
        if (Navigation_Onboarding) {
            Navigation_Region = 'rail';
            Navigation_Position = 0;
            Main_AddClass('navigation-rail', 'navigation-expanded');
            Navigation_Focus();
        } else {
            Navigation_Close(true);
            return true; // Back must not fall through to Navigation_Focus and mark the hidden recovery buttons.
        }
    } else if (code === KEY_ENTER || code === KEY_PLAY || code === KEY_PLAYPAUSE || code === KEY_KEYBOARD_SPACE) {
        if (Navigation_Region === 'rail') Navigation_Activate(Navigation_Position);
        else if (Navigation_Region === 'tabs') {
            if (Navigation_Position === tabs.length) Navigation_Refresh();
            else Navigation_ActivateTab(Navigation_Position);
        } else if (!Navigation_Position) Navigation_Go(Main_addUser);
        else Navigation_Go(Main_Live);
    } else if (code === KEY_6 || code === KEY_PAUSE) {
        Navigation_Activate(5);
        return true;
    } else if (code === KEY_7 || code === KEY_A) {
        Navigation_Activate(7);
        return true;
    } else if (code === KEY_8 || code === KEY_C) {
        Navigation_Activate(8);
        return true;
    } else if (code === KEY_9 || code === KEY_E) {
        Navigation_Activate(6);
        return true;
    } else if (Navigation_Region === 'rail') {
        if (code === KEY_UP || code === KEY_DOWN)
            Navigation_Position = Math.max(0, Math.min(Navigation_Labels().length - 1, Navigation_Position + (code === KEY_UP ? -1 : 1)));
        else if (code === KEY_RIGHT) {
            if (Navigation_Onboarding) {
                Navigation_Region = 'recovery';
                Navigation_Position = 0;
                Main_RemoveClass('navigation-rail', 'navigation-expanded');
            } else {
                Navigation_Close(true);
                return true;
            }
        } else if (code === KEY_LEFT || code === KEY_3) {
            Navigation_Close(false);
            if (AddUser_UserHasToken()) Sidepannel_StartFeed();
            else {
                Sidepannel_ShowNoUserWarning();
                Navigation_Open(Navigation_Callback);
            }
            return true;
        }
    } else if (Navigation_Region === 'tabs') {
        if (code === KEY_LEFT && !Navigation_Position) {
            Navigation_Open(Navigation_Callback, 'rail');
            return true;
        }
        if (code === KEY_LEFT || code === KEY_RIGHT)
            Navigation_Position = Math.max(0, Math.min(tabs.length, Navigation_Position + (code === KEY_LEFT ? -1 : 1)));
        else if (code === KEY_DOWN) {
            if (Navigation_Onboarding) {
                Navigation_Region = 'recovery';
                Navigation_Position = 0;
            } else {
                Navigation_Close(true);
                return true;
            }
        }
    } else if (Navigation_Region === 'recovery') {
        if (code === KEY_LEFT || code === KEY_RIGHT) Navigation_Position = code === KEY_LEFT ? 0 : 1;
        else if (code === KEY_UP) {
            Navigation_Region = 'tabs';
            Navigation_Position = 0;
        }
    }
    Navigation_Focus();
    return true;
}

function Navigation_Activate(index) {
    Navigation_Close(false);
    if (index >= 7) {
        if (index === 7) Main_showAboutDialog(Navigation_Callback, Navigation_UtilityReturn);
        else if (index === 8) Main_showControlsDialog(Navigation_Callback, Navigation_UtilityReturn);
        else Main_UpdateDialogShowCheck();
        return;
    }
    var id = Navigation_Destinations()[index].id;
    if (id === 'settings') {
        Navigation_Onboarding = false;
        Main_HideElement('navigation-onboarding');
        Navigation_ExitCurrent();
        Settings_init();
        return;
    }
    if (id === 'exit') {
        Main_showExitDialog();
        return;
    }
    if ((id === 'following' || id === 'library') && !AddUser_IsUserSet()) {
        Navigation_ShowOnboarding(id);
        return;
    }
    if (id === 'search') {
        Navigation_Go(Main_Search);
        return;
    }
    Navigation_Go(id === 'account' ? (AddUser_IsUserSet() ? Main_Users : Main_addUser) : Navigation_Target(id, 0));
}

function Navigation_ActivateTab(tab) {
    if (Navigation_Onboarding) return;
    if (Navigation_State.destination === 'search' && tab && !Main_values.Search_data) {
        Navigation_Go(Main_Search);
        return;
    }
    if (Navigation_State.destination === 'account') {
        if (!AddUser_IsUserSet() && tab !== 1) {
            Navigation_Go(Main_addUser);
            return;
        }
        if (tab === 2) {
            if (!AddUser_IsUserSet()) {
                Navigation_Go(Main_addUser);
                return;
            }
            Navigation_Close(false);
            Navigation_State.tab = 2;
            Sidepannel_Sidepannel_Pos = 7;
            Sidepannel_KeyEnterUser();
            return;
        }
        Navigation_Go(tab === 0 ? Main_Users : tab === 1 ? Main_addUser : Main_Blocked);
    } else Navigation_Go(Navigation_Target(Navigation_State.destination, tab));
}

function Navigation_ExitCurrent() {
    var current = Main_values.Main_Go;
    Navigation_Capture(current);
    if (Main_isElementShowing('add_user_scroll')) AddUser_exit();
    else if (Main_isElementShowing('search_scroll')) Search_exit();
    else if (Settings_isVisible()) Settings_exit();
    else Main_ExitCurrent(current);
}

function Navigation_Go(screen) {
    if (screen === null || screen === undefined) return;
    Navigation_Close(false);
    Navigation_Onboarding = false;
    Main_HideElement('navigation-onboarding');
    var previous = Main_values.Main_Go;
    Navigation_ExitCurrent();
    Main_values.Main_Before = previous;
    if (screen === Main_Search) {
        Search_SessionEnter(previous);
        Main_values.Main_Go = Main_Search;
        Search_init();
        return;
    }
    var route = Navigation_Route(screen);
    if (route && route.destination !== 'search') {
        Main_values.Search_isSearching = false;
        Search_SessionEnd(); // leaving the search destination abandons the session
    }
    Main_values.Main_Go = screen;
    if (screen === Main_addUser) AddUser_init();
    else if (screen === Main_Users) Users_init();
    else ScreenObj[screen].init_fun();
    Main_SaveValuesWithTimeout();
}

function Navigation_UtilityReturn(event) {
    if (event.keyCode !== KEY_ENTER && event.keyCode !== KEY_RETURN && event.keyCode !== KEY_KEYBOARD_BACKSPACE) return;
    Main_HideAboutDialog();
    Main_HideControlsDialog();
    Main_removeEventListener('keydown', Navigation_UtilityReturn);
    Navigation_Open(Navigation_Callback);
}

function Navigation_Refresh() {
    Navigation_Close(true);
    var obj = ScreenObj[Main_values.Main_Go];
    // Suppress duplicate in-flight activation: an isRefreshing screen ignores further retries.
    if (obj && obj.isRefreshing) return;
    if (obj && obj.start_fun) Main_ReloadScreen();
}

function Navigation_ShowOnboarding(destination) {
    Main_ExitCurrent(Main_values.Main_Go);
    Navigation_Onboarding = true;
    Navigation_State.destination = destination || 'following';
    Navigation_State.tab = 0;
    Main_textContent('navigation-welcome-title', STR_UI.welcomeTitle);
    Main_textContent('navigation-welcome-copy', STR_UI.welcomeCopy);
    Main_textContent('navigation-recovery-0', STR_USER_ADD);
    Main_textContent('navigation-recovery-1', STR_UI.browse);
    Main_getElementById('navigation-recovery-0').onclick = Navigation_Go.bind(null, Main_addUser);
    Main_getElementById('navigation-recovery-1').onclick = Navigation_Go.bind(null, Main_Live);
    Navigation_Render(Main_values.Main_Go);
    Main_ShowElement('navigation-onboarding');
    Main_HideLoadDialog();
    Main_FirstRun = false;
    Navigation_Open(null, 'recovery');
}

function Navigation_ItemIdentity(obj, data) {
    if (!data || data.image || data.empty) return null;
    return String(obj.screenType === 0 ? data[14] || data[6] : obj.screenType === 1 || obj.screenType === 2 ? data[7] : data[7] || data[0]);
}

function Navigation_Capture(screen) {
    var obj = ScreenObj[screen];
    if (!obj || !obj.DataObj || obj.posY < 0) return;
    var data = obj.DataObj[obj.posY + '_' + obj.posX],
        identity = Navigation_ItemIdentity(obj, data);
    if (identity) Navigation_SaveBookmark(screen, Navigation_ScreenContext(screen), identity, obj.posY * obj.ColumnsCount + obj.posX, obj.posY);
}

function Navigation_Restore(screen) {
    var obj = ScreenObj[screen];
    if (!obj.navigationRestorePending) return;
    var mark = Navigation_Bookmark(screen, Navigation_ScreenContext(screen)),
        keys = Object.keys(obj.DataObj),
        i,
        data,
        chosen = null;
    keys.sort(function (a, b) {
        return parseInt(a, 10) - parseInt(b, 10) || Number(a.split('_')[1]) - Number(b.split('_')[1]);
    });
    for (i = 0; i < keys.length; i++) {
        data = obj.DataObj[keys[i]];
        if (mark && Navigation_ItemIdentity(obj, data) === mark.itemId) {
            chosen = keys[i];
            break;
        }
    }
    if (!chosen && mark && keys.length) chosen = keys[Math.min(keys.length - 1, mark.index)];
    if (chosen) {
        obj.posY = Number(chosen.split('_')[0]);
        obj.posX = Number(chosen.split('_')[1]);
    }
    obj.navigationRemount = Boolean(chosen && obj.posY > 1);
    obj.navigationRestorePending = false;
}

/* Rebuild the bounded row window after an identity restore jumps beyond adjacent rows. */
function Navigation_MountRestored(screen) {
    var obj = ScreenObj[screen];
    if (!obj.navigationRemount) return;
    obj.navigationRemount = false;
    var count = obj.visiblerows,
        start = Math.max(0, Math.min(obj.posY - Math.floor(count / 2), obj.Cells.length - count)),
        i;
    for (i = 0; i < obj.Cells.length; i++) Main_RemoveElement(obj.Cells[i]);
    for (i = start; i < Math.min(start + count, obj.Cells.length); i++) {
        obj.tableDoc.appendChild(obj.Cells[i]);
        obj.Cells[i].style.position = '';
        obj.Cells[i].style.transition = 'none';
        obj.Cells[i].style.transform = 'translateY(' + (i - start) * obj.offsettop + 'em)';
    }
    obj.currY = obj.posY;
    if (count === 3) obj.ScrollDoc.style.transform = 'translateY(-' + obj.offsettop + 'em)';
}

function Navigation_UpdateDetails(screen) {
    var obj = ScreenObj[screen],
        data;
    if (!obj || !obj.DataObj) return;
    data = obj.DataObj[obj.posY + '_' + obj.posX];
    Main_textContent('navigation-detail-category', data && !data.image ? data[3] : '');
    Main_textContent('navigation-detail-title', data && !data.image ? data[2] : '');
    Main_textContent('navigation-detail-name', data && !data.image ? data[1] + ' · ' + data[4] + ' ' + STR_VIEWERS : '');
}

function Navigation_ScreenContext(screen) {
    var obj = ScreenObj[screen],
        route = Navigation_Route(screen);
    return obj && obj.gameSelected_Id ? String(obj.gameSelected_Id) : route && route.destination === 'search' ? Main_values.Search_data || '' : '';
}

function Navigation_ElementFocus(id) {
    if (!Navigation_Region) return;
    if (id.indexOf('navigation-route-') === 0) {
        Navigation_Region = 'rail';
        Navigation_Position = Number(id.substring(17));
    } else if (id.indexOf('navigation-tab-') === 0) {
        Navigation_Region = 'tabs';
        Navigation_Position = Number(id.substring(15));
    } else if (id.indexOf('navigation-recovery-') === 0) {
        Navigation_Region = 'recovery';
        Navigation_Position = Number(id.substring(20));
    } else if (id === 'navigation-refresh') {
        Navigation_Region = 'tabs';
        Navigation_Position = Navigation_Tabs(Navigation_State.destination).length;
    }
}

/* Passive update availability: a badge on the rail's Updates entry. The update dialog opens
 * only from an explicit press of that entry, never as an automatic popup. */
function Navigation_SetUpdateBadge(available) {
    var button = Main_getElementById('navigation-updates');
    if (!button) return;
    if (available) Main_AddClassWithEle(button, 'navigation-update-available');
    else Main_RemoveClassWithEle(button, 'navigation-update-available');
}

function Navigation_BindStaticKeys() {
    var ids = [
        'navigation-refresh',
        'navigation-recovery-0',
        'navigation-recovery-1',
        'navigation-about',
        'navigation-help',
        'navigation-updates'
    ];
    for (var i = 0; i < ids.length; i++) {
        var node = Main_getElementById(ids[i]);
        node.onfocus = Navigation_ElementFocus.bind(null, ids[i]);
        node.onkeydown = Navigation_StaticKey.bind(null, ids[i]);
    }
}

function Navigation_StaticKey(id, event) {
    if (!Navigation_Region)
        Navigation_Open(
            null,
            id.indexOf('navigation-recovery-') === 0 ? 'recovery' : id === 'navigation-refresh' ? 'tabs' : 'rail'
        );
    Navigation_ElementFocus(id);
    if (id === 'navigation-about') Navigation_Position = 7;
    else if (id === 'navigation-help') Navigation_Position = 8;
    else if (id === 'navigation-updates') Navigation_Position = 9;
    UIFocus_Dispatch(event, false);
}

function Navigation_LoadState(screen, state) {
    if (screen !== Main_UserLive || screen !== Main_values.Main_Go || Navigation_Onboarding) return;
    var panel = Main_getElementById('navigation-status');
    if (!state) {
        Main_HideElementWithEle(panel);
        return;
    }
    Main_textContent(
        'navigation-status-copy',
        state === 'loading' ? STR_UI.loading : state === 'auth' ? STR_UI.authNeeded : state === 'empty' ? STR_UI.nobodyLive : STR_UI.error
    );
    // Message, primary action and secondary action are selected together: the shared Retry
    // callback never sits behind a Reconnect label, and refresh never claims to fix a login.
    var primaryLabel = '',
        primaryAction = null,
        secondaryLabel = '',
        secondaryAction = null;
    if (state === 'auth') {
        primaryLabel = STR_UI.reconnect;
        primaryAction = Navigation_Reconnect;
        secondaryLabel = STR_UI.browse;
        secondaryAction = Navigation_Go.bind(null, Main_Live);
    } else if (state === 'empty') {
        primaryLabel = STR_UI.browse;
        primaryAction = Navigation_Go.bind(null, Main_Live);
        secondaryLabel = STR_REFRESH;
        secondaryAction = Navigation_Refresh;
    } else if (state === 'error') {
        primaryLabel = STR_UI.retry;
        primaryAction = Navigation_Refresh;
        secondaryLabel = STR_UI.browse;
        secondaryAction = Navigation_Go.bind(null, Main_Live);
    }
    Navigation_BindStatusButton(Main_getElementById('navigation-retry'), primaryLabel, primaryAction);
    Navigation_BindStatusButton(Main_getElementById('navigation-alt'), secondaryLabel, secondaryAction);
    Main_ShowElementWithEle(panel);
}

function Navigation_BindStatusButton(button, label, action) {
    if (!button) return;
    button.textContent = label;
    button.style.display = label ? '' : 'none';
    button.onclick = action;
    button.onkeydown = function (event) {
        if (event.repeat) return; // a held OK must not re-arm the same recovery action
        if (event.keyCode === KEY_ENTER) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (action) action();
        } else if (event.keyCode === KEY_UP || event.keyCode === KEY_LEFT) {
            event.preventDefault();
            event.stopImmediatePropagation();
            Navigation_Open(null, event.keyCode === KEY_UP ? 'tabs' : 'rail');
        }
    };
}

/* Reconnection goes through the existing device-code account flow and its add/update account
 * semantics; no second OAuth implementation. */
function Navigation_Reconnect() {
    Navigation_Close(false);
    Navigation_Go(Main_addUser);
}

/* Existing feed transports still fetch; these tickets only reject obsolete presentation results. */
var Navigation_FeedRequests = {};
var Navigation_FeedGenerations = {};

function Navigation_FeedTicket(callback, error, key, check) {
    var id = ++Navigation_RequestSerial;
    Navigation_FeedRequests[id] = {
        account: Navigation_Account(),
        generation: Navigation_FeedGenerations[key] || 0,
        callback: callback,
        error: error,
        key: key,
        check: check
    };
    var ids = Object.keys(Navigation_FeedRequests);
    if (ids.length > 128) delete Navigation_FeedRequests[ids[0]];
    return id;
}

function Navigation_FeedTake(id) {
    var ticket = Navigation_FeedRequests[id];
    delete Navigation_FeedRequests[id];
    if (!ticket || ticket.account !== Navigation_Account() || ticket.generation !== (Navigation_FeedGenerations[ticket.key] || 0)) return null;
    return ticket;
}

function Navigation_FeedBase(url, callback, error, key, check, headers) {
    BaseXmlHttpGet(url, Navigation_FeedBaseResult, Navigation_FeedBaseError, key, Navigation_FeedTicket(callback, error, key, check), headers);
}

function Navigation_FeedBaseResult(response, key, id) {
    var ticket = Navigation_FeedTake(id);
    if (ticket) ticket.callback(response, key, ticket.check);
}

function Navigation_FeedBaseError(key, id, response) {
    var ticket = Navigation_FeedTake(id);
    if (ticket) ticket.error(key, ticket.check, response);
}

function Navigation_FeedFull(url, headers, callback, error, key, check, method, post) {
    FullxmlHttpGet(url, headers, Navigation_FeedFullResult, noop_fun, key, Navigation_FeedTicket(callback, error, key, check), method, post);
}

function Navigation_FeedFullResult(response, key, id) {
    var ticket = Navigation_FeedTake(id);
    if (ticket) ticket.callback(response, key, ticket.check);
}
