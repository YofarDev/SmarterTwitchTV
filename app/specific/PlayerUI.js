/* Player presentation adapter. Playback objects and their original callbacks remain authoritative. */
var PlayerUI_State = {
    mode: 0,
    frames: [],
    suspended: false,
    closing: false,
    hiddenTimer: null,
    timelineTimer: null,
    paused: false,
    barPaused: null,
    autoQuality: ''
};

function PlayerUI_Mode() {
    return Play_isOn ? 1 : PlayVod_isOn ? 2 : PlayClip_isOn ? 3 : 0;
}

function PlayerUI_Groups() {
    return {
        chat: [Play_controlsPhoneChat, Play_controlsChat, Play_controlsChatSend, Play_controlsChatSettings],
        quality: [Play_controlsQuality, Play_controlsQualityMini, Play_controlsQualityMulti],
        layout: [Play_controlsChatSide, Play_MultiStream],
        content: [
            Play_controlsSearch,
            Play_controlsChanelCont,
            Play_controlsGameCont,
            Play_controlsOpenLive,
            Play_controlsOpenVod,
            Play_controlsFollow,
            Play_controlsContentLang
        ],
        playback: [
            Play_controlsSpeed,
            Play_controlsExternal,
            Play_controlsRewind,
            Play_controlsScreeOff,
            Play_controlsLowLatency,
            Play_controlsChapters
        ],
        audio: [
            Play_controlsAudioAll,
            Play_controlsAudio_Volume_100,
            Play_controlsAudioEna0,
            Play_controlsAudioVol0,
            Play_controlsAudioEna1,
            Play_controlsAudioVol1,
            Play_controlsAudioEna2,
            Play_controlsAudioVol2,
            Play_controlsAudioEna3,
            Play_controlsAudioVol3
        ],
        preview: [Play_controlsPreviewEnable, Play_controlsPreviewSize, Play_controlsPreviewVolume, Play_controlsPreviewMainVolume],
        diagnostics: [Play_controlsPlayerStatus, Play_controlsControls],
        chatSettings: [
            Play_controlsChatForceDis,
            Play_controlsChatDisShared,
            Play_controlsChatDelay,
            Play_controlsChatPos,
            Play_controlsChatSize,
            Play_controlsChatBright,
            Play_controlsChatFont
        ]
    };
}

function PlayerUI_Labels() {
    return {
        chat: STR_UI.chat,
        quality: STR_UI.quality,
        layout: STR_UI.layout,
        more: STR_UI.more,
        content: STR_UI.channelContent,
        playback: STR_UI.playback,
        audio: STR_UI.audio,
        preview: STR_UI.preview,
        diagnostics: STR_UI.diagnostics,
        chatSettings: STR_CHAT_EXTRA
    };
}

function PlayerUI_Visibility() {
    if (PlayerUI_State.mode === 2) return 'ShowInVod';
    if (PlayerUI_State.mode === 3) return 'ShowInClip';
    return Play_StayDialogVisible() ? 'ShowInStay' : Play_MultiEnable ? 'ShowInMulti' : PlayExtra_PicturePicture ? 'ShowInPP' : 'ShowInLive';
}

function PlayerUI_Available(key, group) {
    var control = Play_controls[key];
    if (!control) return false;
    if (group === 'chatSettings') return Boolean(control.ShowInChat);
    if (group === 'preview') return Boolean(control.ShowInPreview);
    if (group === 'audio') {
        var visibility = Play_MultiEnable ? 'ShowInAudioMulti' : PlayExtra_PicturePicture ? 'ShowInAudioPP' : 'ShowInAudio';
        if (!control[visibility]) return false;
        if (key >= Play_controlsAudioEna0 && key <= Play_controlsAudioVol3 && Play_MultiEnable) {
            var slot = Math.floor((key - Play_controlsAudioEna0) / 2);
            return Boolean(Play_MultiArray[slot] && Play_MultiArray[slot].data.length);
        }
        return true;
    }
    if (key === Play_controlsChapters) return PlayerUI_State.mode === 2 && PlayVod_ChaptersArray.length > 0;
    if (key === Play_controlsOpenLive) return PlayerUI_State.mode > 1 && Boolean(Play_HasLive);
    if (key === Play_controlsOpenVod) return PlayerUI_State.mode === 3 && Boolean(PlayClip_HasVOD);
    return Boolean(control[PlayerUI_Visibility()]);
}

function PlayerUI_Frame() {
    return PlayerUI_State.frames[PlayerUI_State.frames.length - 1];
}

function PlayerUI_Show(mode) {
    if (!mode || !Main_isScene2DocVisible() || PlayerUI_State.suspended || PlayerUI_State.closing) return;
    if (PlayerUI_State.frames.length) {
        if (PlayerUI_State.mode === mode) return;
        PlayerUI_Close(false);
    }
    PlayerUI_State.mode = mode;
    PlayerUI_State.frames = [{group: 'bar', index: 0}];
    Play_clearHidePanel();
    UIFocus_Push({
        id: 'player',
        handle: PlayerUI_Handle,
        cleanup: function () {
            Main_clearTimeout(PlayerUI_State.hiddenTimer);
            Main_clearTimeout(PlayerUI_State.timelineTimer);
            PlayerUI_State.frames = [];
            PlayerUI_State.suspended = false;
            Main_HideElement('player-ui');
            Main_RemoveClass('scene2', 'player-ui-active');
            Main_RemoveClass('scene2', 'player-ui-drawer-open');
            Main_RemoveClass('player-ui', 'player-ui-drawer-open');
            Main_removeEventListener('keydown', PlayerUI_Listener);
            // Release the DOM focus the focused control kept; playback keeps its own handlers.
            UIFocus_DomRelease(Main_getElementById('player-ui'));
        }
    });
    Main_addEventListener('keydown', PlayerUI_Listener);
    Main_AddClass('scene2', 'player-ui-active');
    Main_ShowElement('player-ui');
    PlayerUI_Render();
    PlayerUI_ScheduleHide();
    // VOD reveals the timeline about half a second after start; re-check once it is up.
    Main_clearTimeout(PlayerUI_State.timelineTimer);
    PlayerUI_State.timelineTimer = Main_setTimeout(function () {
        if (PlayerUI_State.frames.length && !PlayerUI_State.suspended) PlayerUI_TimelineClass();
    }, 700);
}

function PlayerUI_Listener() {
    // Input is dispatched by UIFocus_Listener before this existing-listener adapter is reached.
}

function PlayerUI_ScheduleHide() {
    Main_clearTimeout(PlayerUI_State.hiddenTimer);
    Play_clearHidePanel();
    if (PlayerUI_State.frames.length === 1 && !PlayerUI_State.suspended) {
        PlayerUI_State.hiddenTimer = Main_setTimeout(function () {
            PlayerUI_Close(true);
        }, 5000);
    }
}

function PlayerUI_Close(hidePanel) {
    if (PlayerUI_State.closing || PlayerUI_State.suspended) return;
    PlayerUI_State.closing = true;
    if (PlayerUI_State.frames.length) UIFocus_Pop(false);
    if (hidePanel && PlayerUI_Mode()) Play_hidePanelFull(PlayerUI_Mode());
    PlayerUI_State.closing = false;
}

function PlayerUI_Open(group) {
    Main_clearTimeout(PlayerUI_State.hiddenTimer);
    Play_clearHidePanel();
    var initializer =
        group === 'audio'
            ? Play_controlsAudio
            : group === 'preview'
              ? Play_controlsPreview
              : group === 'chatSettings'
                ? Play_controlsChatSettings
                : null;
    if (initializer !== null && Play_controls[initializer]) {
        Play_PanelCounter = initializer;
        Play_controls[initializer].enterKey.call(Play_controls[initializer], PlayerUI_State.mode);
    }
    PlayerUI_State.frames.push({group: group, index: 0});
    PlayerUI_Render();
}

function PlayerUI_Back() {
    if (PlayerUI_State.frames.length < 2) {
        PlayerUI_Close(true);
        return;
    }
    PlayerUI_State.frames.pop();
    // Cancel uncommitted quality/speed/latency selections through the original reset paths.
    if (PlayerUI_State.mode === 1) Play_qualityReset();
    else if (PlayerUI_State.mode === 2) PlayVod_qualityReset();
    else PlayClip_qualityReset();
    Play_ResetSpeed();
    Play_ResetLowlatency();
    PlayerUI_Render();
    PlayerUI_ScheduleHide();
}

function PlayerUI_Action(key, adjust) {
    var frame = PlayerUI_Frame(),
        control = Play_controls[key];
    if (!frame || !PlayerUI_Available(key, frame.group)) return false;
    frame.index = frame.entries.indexOf(key);
    Play_PanelCounter = key;
    if (adjust) {
        if (control.updown) control.updown.call(control, adjust, PlayerUI_State.mode);
    } else if (key === Play_controlsChatSettings) {
        PlayerUI_Open('chatSettings');
        return true;
    } else {
        var phone = key === Play_controlsPhoneChat,
            leave =
                [
                    Play_controlsSearch,
                    Play_controlsChanelCont,
                    Play_controlsGameCont,
                    Play_controlsOpenLive,
                    Play_controlsOpenVod,
                    Play_controlsExternal,
                    Play_controlsRewind,
                    Play_controlsScreeOff,
                    Play_controlsChapters,
                    Play_MultiStream,
                    Play_controlsChatSend,
                    Play_controlsControls
                ].indexOf(key) !== -1;
        var mode = PlayerUI_State.mode;
        if (leave && !phone) PlayerUI_Close(false);
        // Multistream takes a shutdown boolean, unlike ordinary controls taking a mode number.
        if (control.enterKey) control.enterKey.call(control, key === Play_MultiStream ? false : mode);
    }
    Play_clearHidePanel();
    if (PlayerUI_State.frames.length && !PlayerUI_State.suspended) {
        if (PlayerUI_Mode() !== PlayerUI_State.mode) PlayerUI_Close(false);
        else {
            PlayerUI_Render();
            PlayerUI_ScheduleHide();
        }
    }
    return true;
}

function PlayerUI_QualityList() {
    var mode = PlayerUI_State.mode,
        qualities = mode === 1 ? Play_data.qualities : mode === 2 ? PlayVod_qualities : PlayClip_qualities,
        count = mode === 1 ? Play_getQualitiesCount() : mode === 2 ? PlayVod_getQualitiesCount() : PlayClip_getQualitiesCount(),
        playing = mode === 1 ? Play_data.qualityPlaying : mode === 2 ? PlayVod_qualityPlaying : PlayClip_qualityPlaying,
        items = [],
        indexes = [],
        current = -1,
        i;
    for (i = 0; i < count; i++) {
        if (!qualities[i]) continue;
        items.push(qualities[i].id);
        indexes.push(i);
        if (qualities[i].id === playing) current = items.length - 1;
    }
    return {items: items, indexes: indexes, current: current};
}

function PlayerUI_QualityPick(index) {
    var mode = PlayerUI_State.mode,
        list = PlayerUI_QualityList(),
        position = list.indexes[index];
    // Re-applying the playing rendition restarts the stream; picking it just returns to the bar.
    if (index !== list.current && position !== undefined) {
        if (mode === 1) Play_data.qualityIndex = position;
        else if (mode === 2) PlayVod_qualityIndex = position;
        else PlayClip_qualityIndex = position;
        Play_PanelCounter = Play_controlsQuality;
        Play_controls[Play_controlsQuality].enterKey.call(Play_controls[Play_controlsQuality], mode);
    }
    PlayerUI_State.frames.pop();
    PlayerUI_Render();
    PlayerUI_ScheduleHide();
}

function PlayerUI_QualityCaption() {
    var quality = PlayerUI_State.mode === 1 ? Play_data.qualityPlaying : PlayerUI_State.mode === 2 ? PlayVod_qualityPlaying : PlayClip_qualityPlaying;

    if (PlayerUI_State.autoQuality && PlayerUI_State.mode < 3 && Main_A_includes_B(quality, 'Auto')) {
        quality = STR_UI.qualityAutoPlaying.replace('{quality}', quality).replace('{playing}', PlayerUI_State.autoQuality);
    }

    Main_textContent('player-ui-name', STR_UI.quality + STR_UI.separator + quality);
}

//Native report of the Auto rendition (Play_ShowVideoQuality), e.g. '1080p60 | Auto | 8.99Mbps | AVC';
//named after the stream's own list entry when one matches ('1080p60 | source')
function PlayerUI_SetAutoQuality(who_called, value) {
    var playing = value.split(' | ')[0],
        list = who_called ? PlayVod_qualities : Play_data.qualities,
        i;

    for (i = 0; i < list.length; i++) {
        if (list[i].id && list[i].id.split(' | ')[0] === playing) {
            playing = list[i].id;
            break;
        }
    }

    PlayerUI_State.autoQuality = playing;
    if (PlayerUI_State.frames.length && !PlayerUI_State.suspended) PlayerUI_QualityCaption();
}

function PlayerUI_TimelineClass() {
    var timeline = Main_getElementById('progress_pause_holder');
    if (timeline.offsetHeight > 0) Main_AddClass('player-ui', 'player-ui-has-timeline');
    else Main_RemoveClass('player-ui', 'player-ui-has-timeline');
}

function PlayerUI_Render() {
    var frame = PlayerUI_Frame();
    if (!frame) return;
    var previousKey = frame.entries ? frame.entries[frame.index] : null;
    var labels = PlayerUI_Labels(),
        bar = Main_getElementById('player-ui-buttons'),
        menu = Main_getElementById('player-ui-menu'),
        drawer = Main_getElementById('player-ui-drawer'),
        actionRoot = Main_getElementById('player-ui-actions'),
        i,
        key,
        control,
        keys,
        node;
    Main_emptyWithEle(menu);
    PlayerUI_TimelineClass();
    // Reuse the actual control DOM; there is no invisible duplicate strip behind the drawers.
    for (key in Play_controls) Play_controls[key].doc.style.display = 'none';
    var barGroups = ['pause', 'chat', 'quality', 'layout', 'more', 'channels'],
        barIcons = {
            pause: PlayerUI_State.paused ? 'play' : 'pause',
            chat: 'chat',
            quality: 'levels',
            layout: 'side-by-side',
            more: 'options',
            channels: 'feed'
        };
    //The bar only depends on the paused state, keep the built nodes between renders
    if (PlayerUI_State.barPaused !== PlayerUI_State.paused || !bar.firstChild) {
        PlayerUI_State.barPaused = PlayerUI_State.paused;
        Main_emptyWithEle(bar);
        for (i = 0; i < barGroups.length; i++) {
            key = barGroups[i];
            node = Navigation_Button(
                bar,
                'player-ui-bar-' + i,
                key === 'pause' ? (PlayerUI_State.paused ? STR_UI.play : STR_UI.pause) : key === 'channels' ? STR_UI.channels : labels[key],
                PlayerUI_ActivateBar.bind(null, i),
                barIcons[key]
            );
            node.onfocus = PlayerUI_SetIndex.bind(null, i, 'bar');
            if (!i) {
                node.setAttribute('aria-pressed', String(PlayerUI_State.paused));
                node.className += ' player-ui-bar-primary';
            } else if (key === 'more') node.className += ' player-ui-bar-end';
        }
    }
    PlayerUI_QualityCaption();
    Main_textContent('player-ui-value', PlayerUI_State.paused ? STR_UI.paused : '');
    drawer.style.display = frame.group === 'bar' ? 'none' : '';
    frame.list = false;
    if (frame.group === 'bar') {
        frame.entries = barGroups;
    } else if (frame.group === 'more') {
        frame.entries = ['content', 'playback', 'audio', 'preview', 'diagnostics'];
        for (i = 0; i < frame.entries.length; i++) {
            node = Navigation_Button(menu, 'player-ui-row-' + i, labels[frame.entries[i]], PlayerUI_OpenAt.bind(null, i, frame.entries[i]));
            node.onfocus = PlayerUI_SetIndex.bind(null, i, 'more');
        }
    } else if (frame.group === 'quality' && PlayerUI_Available(Play_controlsQuality, 'quality')) {
        // One row per rendition; the single-stream spinner row is replaced by the list. PiP and
        // multistream keep their spinner rows through the generic branch below.
        var list = PlayerUI_QualityList();
        frame.entries = [];
        if (!list.items.length) {
            Main_textContentWithEle(menu, STR_UI.loadingQualities);
        } else {
            for (i = 0; i < list.items.length; i++) {
                node = Navigation_Button(
                    menu,
                    'player-ui-quality-' + i,
                    list.current === i ? list.items[i] + ' ✓' : list.items[i],
                    PlayerUI_QualityPick.bind(null, i)
                );
                node.setAttribute('role', 'menuitemradio');
                if (list.current === i) {
                    node.setAttribute('aria-checked', 'true');
                    node.className += ' player-ui-current';
                }
                node.onfocus = PlayerUI_SetIndex.bind(null, i, 'quality');
                frame.entries.push('q:' + list.items[i]);
            }
            frame.list = true;
        }
    } else {
        keys = PlayerUI_Groups()[frame.group] || [];
        frame.entries = [];
        for (i = 0; i < keys.length; i++) {
            key = keys[i];
            control = Play_controls[key];
            if (!PlayerUI_Available(key, frame.group)) continue;
            frame.entries.push(key);
            // Same order as the descriptors' own updown: arrows (writes the raw value) before the label
            // (which may format it, e.g. speed's "1x (Normal)").
            if (control.bottomArrows) control.bottomArrows();
            // Only state-derived labels take a no-arg refresh here; the argument-driven ones
            // (channel/game content, open live/vod, follow) stringify the argument, so a no-arg
            // call would render "undefined" over the label the mode code already wrote.
            if (control.setLabel && control.setLabel.length === 0) control.setLabel();
            control.doc.style.display = '';
            control.doc.className = 'player-ui-action';
            control.doc.setAttribute('role', 'button');
            control.doc.setAttribute('tabindex', '0');
            control.doc.setAttribute('aria-label', control.doc_title.textContent);
            control.doc.onclick = PlayerUI_Action.bind(null, key, 0);
            control.doc.onfocus = PlayerUI_SetIndex.bind(null, frame.entries.length - 1, frame.group);
            actionRoot.appendChild(control.doc);
        }
        if (!frame.entries.length) Main_textContentWithEle(menu, STR_UI.unavailable);
    }
    PlayerUI_Orient(frame, labels);
    if (previousKey !== null && frame.entries.indexOf(previousKey) !== -1) frame.index = frame.entries.indexOf(previousKey);
    frame.index = Math.max(0, Math.min(frame.index, frame.entries.length - 1));
    PlayerUI_Focus();
}

/* Keep the viewer oriented while a drawer covers the content: underline the bar button that
 * opened it, dim the rest of the bar, breadcrumb groups opened from More, drop the drawer state. */
function PlayerUI_Orient(frame, labels) {
    var drawerOpen = frame.group !== 'bar',
        buttons = Main_getElementById('player-ui-buttons').querySelectorAll('.navigation-button'),
        origin,
        i;
    if (drawerOpen) {
        Main_AddClass('player-ui', 'player-ui-drawer-open');
        Main_AddClass('scene2', 'player-ui-drawer-open');
    } else {
        Main_RemoveClass('player-ui', 'player-ui-drawer-open');
        Main_RemoveClass('scene2', 'player-ui-drawer-open');
    }
    origin = PlayerUI_State.frames.length > 1 ? Main_getElementById('player-ui-bar-' + PlayerUI_State.frames[0].index) : null;
    for (i = 0; i < buttons.length; i++) {
        if (drawerOpen && buttons[i] === origin) {
            buttons[i].classList.add('player-ui-origin');
            buttons[i].setAttribute('aria-current', 'true');
        } else {
            buttons[i].classList.remove('player-ui-origin');
            buttons[i].removeAttribute('aria-current');
        }
    }
    if (drawerOpen && PlayerUI_State.frames.length > 2 && PlayerUI_State.frames[1].group === 'more' && labels[frame.group]) {
        Main_textContent('player-ui-title', labels.more + ' › ' + labels[frame.group]);
    } else {
        Main_textContent('player-ui-title', labels[frame.group] || '');
    }
}

function PlayerUI_HelpText(frame) {
    if (frame.list) return STR_UI.playerHelpList;
    if (frame.group === 'more') return STR_UI.playerHelpMenu;
    var control = frame.entries && Play_controls[frame.entries[frame.index]];
    // Only rows with a value range use Left/Right; the others are toggles or actions pressed with OK.
    if (control && control.values && control.values.length > 1) return STR_UI.playerHelp;
    return STR_UI.playerHelpAction;
}

function PlayerUI_Focus() {
    var root = Main_getElementById('player-ui'),
        old = root.querySelector('.player-ui-focused'),
        frame = PlayerUI_Frame(),
        target;
    if (old) old.classList.remove('player-ui-focused');
    if (frame && frame.group !== 'bar') Main_textContent('player-ui-help', PlayerUI_HelpText(frame));
    if (!frame || !frame.entries.length) return;
    if (frame.group === 'bar') target = Main_getElementById('player-ui-bar-' + frame.index);
    else if (frame.group === 'more') target = Main_getElementById('player-ui-row-' + frame.index);
    else if (frame.list) target = Main_getElementById('player-ui-quality-' + frame.index);
    else {
        Play_PanelCounter = frame.entries[frame.index];
        target = Play_controls[Play_PanelCounter].doc;
    }
    if (target) {
        target.classList.add('player-ui-focused');
        target.focus();
        if (frame.group !== 'bar' && target.offsetTop > 0) {
            var list = Main_getElementById('player-ui-scroll');
            if (target.offsetTop < list.scrollTop) list.scrollTop = target.offsetTop;
            else if (target.offsetTop + target.offsetHeight > list.scrollTop + list.clientHeight)
                list.scrollTop = target.offsetTop + target.offsetHeight - list.clientHeight;
        }
    }
    PlayerUI_ScrollHints();
}

/* Fade hints when the drawer clips rows above or below the visible scroll area. */
function PlayerUI_ScrollHints() {
    var scroll = Main_getElementById('player-ui-scroll');
    if (!scroll.scrollHeight) return;
    if (scroll.scrollTop > 1) Main_AddClass('player-ui-drawer', 'player-ui-more-above');
    else Main_RemoveClass('player-ui-drawer', 'player-ui-more-above');
    if (scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 1) Main_AddClass('player-ui-drawer', 'player-ui-more-below');
    else Main_RemoveClass('player-ui-drawer', 'player-ui-more-below');
}

function PlayerUI_ActivateBar(index) {
    var groups = ['pause', 'chat', 'quality', 'layout', 'more', 'channels'];
    if (!PlayerUI_Frame()) return;
    PlayerUI_Frame().index = index;
    if (!index) {
        OSInterface_PlayPauseChange(PlayerUI_State.mode);
        PlayerUI_ScheduleHide();
    } else if (groups[index] === 'channels') PlayerUI_Channels();
    else PlayerUI_Open(groups[index]);
}

function PlayerUI_Channels() {
    var mode = PlayerUI_State.mode;
    PlayerUI_Close(true);
    if (!mode) return;
    UserLiveFeed_FeedPosX = AddUser_UserIsSet() ? UserLiveFeedobj_UserLivePos : UserLiveFeedobj_LivePos;
    var data = UserLiveFeed_DataObj[UserLiveFeed_FeedPosX] || [],
        currentId = mode === 1 ? Play_data.data[14] : null;
    for (var i = 0; i < data.length; i++) {
        if (currentId && String(data[i][14]) === String(currentId)) {
            UserLiveFeed_FeedPosY[UserLiveFeed_FeedPosX] = i;
            Main_values.UserLiveFeed_LastPositionId[UserLiveFeed_FeedPosX] = currentId;
            Main_values.UserLiveFeed_LastPosition[UserLiveFeed_FeedPosX] = i;
            break;
        }
    }
    UserLiveFeed_ShowFeed();
}

function PlayerUI_Handle(event, up) {
    if (up) return true;
    if (PlayerUI_State.mode !== PlayerUI_Mode() || !Main_isScene2DocVisible()) {
        PlayerUI_Close(false);
        return true;
    }
    var frame = PlayerUI_Frame(),
        code = event.keyCode;
    if (code === 9) return false;
    if (!frame) return false;
    //Only the quality drawer needs a refresh on plain input, its list loads
    //asynchronously; other drawers re-render on the action itself, rebuilding
    //them on every focus move is wasted work on key repeat
    if (frame.group === 'quality') PlayerUI_Render();
    if (code === KEY_RETURN || code === KEY_KEYBOARD_BACKSPACE || code === 27) PlayerUI_Back();
    else if (code === KEY_ENTER) {
        if (frame.group === 'bar') PlayerUI_ActivateBar(frame.index);
        else if (frame.group === 'more') PlayerUI_Open(frame.entries[frame.index]);
        else if (frame.list) PlayerUI_QualityPick(frame.index);
        else if (frame.entries.length) PlayerUI_Action(frame.entries[frame.index], 0);
    } else if (code === KEY_LEFT || code === KEY_RIGHT || code === KEY_UP || code === KEY_DOWN) {
        if (frame.group === 'bar') {
            if (code === KEY_LEFT || code === KEY_RIGHT)
                frame.index = Math.max(0, Math.min(frame.entries.length - 1, frame.index + (code === KEY_LEFT ? -1 : 1)));
            else if (code === KEY_UP) {
                // Hand timeline navigation back to its existing mode handler.
                PlayerUI_Close(false);
                PlayVod_PanelY = 0;
                Play_BottomIconsFocus();
                return true;
            }
        } else if (code === KEY_UP || code === KEY_DOWN)
            frame.index = Math.max(0, Math.min(frame.entries.length - 1, frame.index + (code === KEY_UP ? -1 : 1)));
        else if (!frame.list && frame.group !== 'more' && frame.entries.length)
            PlayerUI_Action(frame.entries[frame.index], code === KEY_LEFT ? -1 : 1);
        PlayerUI_Focus();
        PlayerUI_ScheduleHide();
    } else {
        // Media, number and specialized shortcuts keep their existing mode meaning.
        PlayerUI_Close(false);
        return false;
    }
    return true;
}

/* The native player only reports play/pause on a toggle; every (re)start of the main player begins
 * playing (SetupPlayer), so the bridge start calls and leaving the player clear the paused state. */
function PlayerUI_ResetPaused() {
    Main_HideElement('player-ui-paused');
    if (!PlayerUI_State.paused) return;
    PlayerUI_State.paused = false;
    if (Play_BottonIcons_Pause) Main_innerHTMLWithEle(Play_BottonIcons_Pause, Play_GetPlayPauseIcon(true));
    if (PlayerUI_State.frames.length && !PlayerUI_State.suspended) PlayerUI_Render();
}

function PlayerUI_SuspendPhone() {
    if (!PlayerUI_State.frames.length) return;
    PlayerUI_State.suspended = true;
    Main_clearTimeout(PlayerUI_State.hiddenTimer);
    UIFocus_Suspend('player', true);
    Main_HideElement('player-ui');
}

function PlayerUI_ResumePhone(skipRestore) {
    if (!PlayerUI_State.suspended) return;
    PlayerUI_State.suspended = false;
    UIFocus_Suspend('player', false);
    if (skipRestore || PlayerUI_Mode() !== PlayerUI_State.mode) {
        PlayerUI_Close(false);
        return;
    }
    Main_ShowElement('player-ui');
    Play_ForceShowPannel();
    Main_addEventListener('keydown', PlayerUI_Listener);
    PlayerUI_Render();
    PlayerUI_ScheduleHide();
}

function PlayerUI_OpenAt(index, group) {
    if (PlayerUI_Frame()) PlayerUI_Frame().index = index;
    PlayerUI_Open(group);
}

function PlayerUI_ControlShown(key) {
    var frame = PlayerUI_Frame();
    return Boolean(
        frame &&
        frame.group !== 'bar' &&
        frame.group !== 'more' &&
        frame.entries &&
        frame.entries.indexOf(Number(key)) !== -1 &&
        PlayerUI_Available(Number(key), frame.group)
    );
}

function PlayerUI_SetIndex(index, group) {
    var frame = PlayerUI_Frame();
    if (frame && frame.group === group) frame.index = index;
}
