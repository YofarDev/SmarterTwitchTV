# UI/UX feature preservation inventory

Recorded October 16, 2026 against `aac56c84db8d79229a7f7aabbfa4f6eb4afa50af` plus the existing dirty working tree.

**Status:** production shell and player adapters are integrated. This table distinguishes source mapping from runtime certification: all destinations/actions retain existing lifecycles/callbacks, while exhaustive authenticated and native-mode checks remain pending. See `ui-ux-redesign-validation.md` for exact fixture/browser coverage.

## Existing screen entries

| Named screen | Existing entry point | Integrated location | Account / context | Verification |
| --- | --- | --- | --- | --- |
| `Main_Search` | Existing `ScreenObj` lifecycle / current menu or content action | Search / query result type | Query context | Shell wired; full round trip pending |
| `Main_Live` | Existing `ScreenObj` lifecycle / current menu or content action | Browse | Public | Shell wired; full round trip pending |
| `Main_Users` | Existing `ScreenObj` lifecycle / current menu or content action | Account | Add works without account; blocked requires account | Shell wired; full round trip pending |
| `Main_Featured` | Existing `ScreenObj` lifecycle / current menu or content action | Browse | Public | Shell wired; full round trip pending |
| `Main_games` | Existing `ScreenObj` lifecycle / current menu or content action | Browse | Public | Shell wired; full round trip pending |
| `Main_Vod` | Existing `ScreenObj` lifecycle / current menu or content action | Browse | Public | Shell wired; full round trip pending |
| `Main_Clip` | Existing `ScreenObj` lifecycle / current menu or content action | Browse | Public | Shell wired; full round trip pending |
| `Main_UserLive` | Existing `ScreenObj` lifecycle / current menu or content action | Following | Configured account; token availability handled by current loader | Shell wired; full round trip pending |
| `Main_usergames` | Existing `ScreenObj` lifecycle / current menu or content action | Following | Configured account; token availability handled by current loader | Shell wired; full round trip pending |
| `Main_UserVod` | Existing `ScreenObj` lifecycle / current menu or content action | Following | Configured account; token availability handled by current loader | Shell wired; full round trip pending |
| `Main_UserChannels` | Existing `ScreenObj` lifecycle / current menu or content action | Following | Configured account; token availability handled by current loader | Shell wired; full round trip pending |
| `Main_SearchGames` | Existing `ScreenObj` lifecycle / current menu or content action | Search / query result type | Query context | Shell wired; full round trip pending |
| `Main_SearchLive` | Existing `ScreenObj` lifecycle / current menu or content action | Search / query result type | Query context | Shell wired; full round trip pending |
| `Main_SearchChannels` | Existing `ScreenObj` lifecycle / current menu or content action | Search / query result type | Query context | Shell wired; full round trip pending |
| `Main_ChannelContent` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_ChannelVod` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_ChannelClip` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_addUser` | Existing `ScreenObj` lifecycle / current menu or content action | Account | Add works without account; blocked requires account | Shell wired; full round trip pending |
| `Main_aGame` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_AGameVod` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_AGameClip` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_HistoryLive` | Existing `ScreenObj` lifecycle / current menu or content action | Library | Account history; existing delete/resume rules | Shell wired; full round trip pending |
| `Main_HistoryVod` | Existing `ScreenObj` lifecycle / current menu or content action | Library | Account history; existing delete/resume rules | Shell wired; full round trip pending |
| `Main_HistoryClip` | Existing `ScreenObj` lifecycle / current menu or content action | Library | Account history; existing delete/resume rules | Shell wired; full round trip pending |
| `Main_Password` | Existing `ScreenObj` lifecycle / current menu or content action | Settings / password flow | Existing password policy | Shell wired; full round trip pending |
| `Main_Blocked` | Existing `ScreenObj` lifecycle / current menu or content action | Account | Add works without account; blocked requires account | Shell wired; full round trip pending |
| `Main_SearchVod` | Existing `ScreenObj` lifecycle / current menu or content action | Search / query result type | Query context | Shell wired; full round trip pending |
| `Main_newUsercode` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_ExitCursor` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_addFocusVideoOffset` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_RunningTime` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_ClockOffset` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_IsOn_OSInterface` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_vodOffset` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_UpdateCursor` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |
| `Main_date_Ms` | Existing `ScreenObj` lifecycle / current menu or content action | Nested channel/category details | Preserve actual caller and content identity | Shell wired; full round trip pending |

Keep `Main_OpenSearch`, channel/category origin flags, `Users_beforeUser`, Android intent mappings, and history confirmations authoritative during integration. Screen 0 is valid; never treat a target as a truthy numeric value.

## Player controls

Each row is extracted from an active control declaration in `Play_MakeControls`. Flags are L=Live, V=VOD, C=clip, P=PiP, M=multistream. Other visibility groups are recorded separately. All actions currently execute through the legacy strip; the new player prototype does not invoke them.

| Named control | Current label expression | Modes | Specialized groups | Callback / presentation dependencies | Proposed group | Migration |
| --- | --- | --- | --- | --- | --- | --- |
| `Play_controlsBack` | `STR_SIDE_PANEL_BACK_MAIN_MENU` | None | ShowInChat, ShowInAudio, ShowInAudioPP, ShowInAudioMulti, ShowInPreview | enterKey, Play_PanelCounter, Play_SetControlsVisibility | Drawer Back (existing behavior must be extracted) | Adapter wired; native check pending |
| `Play_controlsSearch` | `STR_SEARCH` | LVCPM | ShowInStay | enterKey | More / Channel/content | Adapter wired; native check pending |
| `Play_controlsChanelCont` | `STR_CHANNEL_CONT` | LVCPM | ShowInStay | enterKey, setLabel | More / Channel/content | Adapter wired; native check pending |
| `Play_controlsGameCont` | `STR_GAME_CONT` | LVCPM | ShowInStay | enterKey, setLabel | More / Channel/content | Adapter wired; native check pending |
| `Play_controlsOpenLive` | `STR_IS_LIVE` | None | None | enterKey, doc_title, setLabel | More / Channel/content | Adapter wired; native check pending |
| `Play_controlsOpenVod` | `STR_OPEN_BROADCAST` | None | None | enterKey, doc_title, setLabel | More / Channel/content | Adapter wired; native check pending |
| `Play_controlsFollow` | `STR_FOLLOW` | LVCPM | ShowInStay | enterKey, doc_title, setLabel, Play_ResetPanel | More / Channel/content | Adapter wired; native check pending |
| `Play_controlsSpeed` | `STR_SPEED` | LVCPM | None | enterKey, value adjustment, doc_name, setLabel, bottomArrows, OSInterface_ | More / Playback | Adapter wired; native check pending |
| `Play_controlsExternal` | `STR_OPEN_EXTERNAL_PLAYER` | LVCPM | None | enterKey, value adjustment, doc_name, setLabel, bottomArrows, OSInterface_ | More / Playback | Adapter wired; native check pending |
| `Play_controlsRewind` | `STR_OPEN_REWIND` | L | None | enterKey, setLabel | More / Playback | Adapter wired; native check pending |
| `Play_controlsQuality` | `STR_QUALITY` | LVC | None | enterKey, value adjustment, Play_ResetPanel, OSInterface_ | Quality / per-slot restart | Adapter wired; native check pending |
| `Play_controlsQualityMini` | `STR_PLAYER_RESYNC` | P | None | enterKey, value adjustment, doc_name, setLabel, Play_ResetPanel, OSInterface_ | Quality / per-slot restart | Adapter wired; native check pending |
| `Play_controlsQualityMulti` | `STR_PLAYER_RESYNC` | M | None | enterKey, value adjustment, doc_name, setLabel, Play_ResetPanel, OSInterface_ | Quality / per-slot restart | Adapter wired; native check pending |
| `Play_controlsScreeOff` | `STR_SCREEN_OFF` | LVCPM | ShowInStay | enterKey | More / Playback | Adapter wired; native check pending |
| `Play_controlsLowLatency` | `STR_LOW_LATENCY` | LPM | None | enterKey, value adjustment, doc_name, setLabel, bottomArrows, Play_ResetPanel, OSInterface_ | More / Playback | Adapter wired; native check pending |
| `Play_controlsChapters` | `STR_CHAPTERS` | None | None | enterKey, value adjustment, doc_name, setLabel, bottomArrows | More / Playback | Adapter wired; native check pending |
| `Play_MultiStream` | `STR_4_WAY_MULTI` | LPM | None | enterKey, OSInterface_ | Layout | Adapter wired; native check pending |
| `Play_controlsAudio` | `STR_VOLUME_CONTROLS` | LVCPM | None | enterKey, Play_PanelCounter | More / Audio | Adapter wired; native check pending |
| `Play_controlsChatSide` | `STR_CHAT_VIDEO_MODE` | LVCPM | ShowInStay | enterKey, doc_title, setLabel, Play_ResetPanel | Layout | Adapter wired; native check pending |
| `Play_controlsChat` | `STR_CHAT_SHOW` | LVCPM | ShowInChat, ShowInStay | enterKey, setLabel | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsChatSend` | `STR_CHAT_WRITE` | LPM | ShowInStay | enterKey | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsPhoneChat` | `STR_PHONE_CHAT_OPEN + ' (6)'` | LP | None | enterKey, PhoneChat_Show | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsChatSettings` | `STR_CHAT_EXTRA` | LVCPM | ShowInStay | enterKey, Play_PanelCounter, Play_SetControlsVisibility | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsPlayerStatus` | `STR_PLAYER_INFO_VISIBILITY` | LVCPM | None | value adjustment, bottomArrows | More / Diagnostics | Adapter wired; native check pending |
| `Play_controlsPreview` | `STR_PREVIEW_SET` | LVCPM | ShowInStay | enterKey, bottomArrows, Play_PanelCounter, Play_SetControlsVisibility | More / Preview | Adapter wired; native check pending |
| `Play_controlsChatForceDis` | `STR_F_DISABLE_CHAT` | None | ShowInChat | enterKey, setLabel | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsChatDisShared` | `STR_DISABLE_SHARED_CHAT` | None | ShowInChat | enterKey, setLabel | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsChatDelay` | `STR_CHAT_DELAY` | None | ShowInChat | value adjustment, doc_name, setLabel, bottomArrows | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsChatPos` | `STR_CHAT_POS` | None | ShowInChat | value adjustment, doc_name, setLabel, bottomArrows | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsChatSize` | `STR_CHAT_SIZE` | None | ShowInChat | value adjustment, doc_name, setLabel, bottomArrows | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsChatBright` | `STR_CHAT_BRIGHTNESS` | None | ShowInChat | value adjustment, doc_name, setLabel, bottomArrows | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsChatFont` | `STR_CHAT_FONT` | None | ShowInChat | value adjustment, doc_name, setLabel, bottomArrows | Chat (phone first) | Adapter wired; native check pending |
| `Play_controlsAudioAll` | `STR_AUDIO_ALL` | None | ShowInAudioPP, ShowInAudioMulti | enterKey, OSInterface_ | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudio_Volume_100` | `STR_AUDIO_ALL_100` | None | ShowInAudio, ShowInAudioPP, ShowInAudioMulti | enterKey, OSInterface_ | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudioEna0` | `''` | None | ShowInAudio, ShowInAudioPP, ShowInAudioMulti | value adjustment, setLabel, bottomArrows | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudioVol0` | `''` | None | ShowInAudio, ShowInAudioPP, ShowInAudioMulti | value adjustment, setLabel, bottomArrows | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudioEna1` | `''` | None | ShowInAudioPP, ShowInAudioMulti | value adjustment, setLabel, bottomArrows | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudioVol1` | `''` | None | ShowInAudioPP, ShowInAudioMulti | value adjustment, setLabel, bottomArrows | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudioEna2` | `''` | None | ShowInAudioMulti | value adjustment, setLabel, bottomArrows | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudioVol2` | `''` | None | ShowInAudioMulti | value adjustment, setLabel, bottomArrows | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudioEna3` | `''` | None | ShowInAudioMulti | value adjustment, setLabel, bottomArrows | More / Audio | Adapter wired; native check pending |
| `Play_controlsAudioVol3` | `''` | None | ShowInAudioMulti | value adjustment, setLabel, bottomArrows | More / Audio | Adapter wired; native check pending |
| `Play_controlsPreviewEnable` | `STR_PREVIEW_SHOW` | None | ShowInPreview | value adjustment, bottomArrows | More / Preview | Adapter wired; native check pending |
| `Play_controlsPreviewSize` | `STR_PREVIEW_SIZE_CONTROLS` | None | ShowInPreview | value adjustment, bottomArrows, OSInterface_ | More / Preview | Adapter wired; native check pending |
| `Play_controlsPreviewVolume` | `STR_PREVIEW_VOLUME` | None | ShowInPreview | value adjustment, bottomArrows, OSInterface_ | More / Preview | Adapter wired; native check pending |
| `Play_controlsPreviewMainVolume` | `STR_PREVIEW_OTHERS_VOLUME` | None | ShowInPreview | value adjustment, bottomArrows, OSInterface_ | More / Preview | Adapter wired; native check pending |
| `Play_controlsControls` | `STR_CONTROLS` | LVCPM | ShowInStay | enterKey | More / Diagnostics | Adapter wired; native check pending |
| `Play_controlsContentLang` | `STR_CONTENT_LANG` | LVCPM | ShowInStay | value adjustment, doc_name, bottomArrows | More / Playback | Adapter wired; native check pending |

Active declarations found: **48**. `Play_controlsBack` switches visibility groups and restores panel counters. Chat/audio/preview buttons are nested-panel commands, not simple toggles. Quality adjustments select a pending quality and Enter commits it; Cancel must reset pending values. Audio availability depends on populated slots. Phone-chat eligibility excludes VOD/clip/multistream in the current descriptor. Preserve execution-time capability checks.

The audit above is static. Before migrating, execute each callback through the production adapter with bridge stubs; preserve `this`, control DOM references, active slot, pending values, and mode arguments. Do not infer safety from visibility flags.

## Persisted settings keys

All existing keys below retain their spelling, default/range logic, `Main_getItem`/`Main_setItem` format, and backup behavior. Existing `Settings_SetSettings`, `Settings_Content`, `Settings_Dialog*`, `SettingsColor_*`, `GDrive*`, and native capability checks remain the entry points. Grouping is proposed; no preference migration is performed.

| Saved key | Proposed group | Verification |
| --- | --- | --- |
| `content_lang` | Interface | Preserve; not migrated |
| `app_lang` | Interface | Preserve; not migrated |
| `loadAll_lang` | Interface | Preserve; not migrated |
| `show_banner` | Interface | Preserve; not migrated |
| `av1_codec` | Player | Preserve; not migrated |
| `hevc_codec` | Player | Preserve; not migrated |
| `speed_adjust` | Player | Preserve; not migrated |
| `ttv_lolProxy` | Player | Preserve; not migrated |
| `proxy_timeout` | Player | Preserve; not migrated |
| `T1080` | Player | Preserve; not migrated |
| `k_twitch` | Player | Preserve; not migrated |
| `restor_playback` | Player | Preserve; not migrated |
| `clip_autoPlayNext` | Player | Preserve; not migrated |
| `seek_preview` | Player | Preserve; not migrated |
| `PP_workaround` | Player | Preserve; not migrated |
| `single_clickExit` | Player | Preserve; not migrated |
| `accessibility_warn` | Player | Preserve; not migrated |
| `ping_warn` | Player | Preserve; not migrated |
| `live_warn` | Player | Preserve; not migrated |
| `app_animations` | Interface | Preserve; not migrated |
| `show_feed_player` | Player | Preserve; not migrated |
| `preview_others_volume_new` | Player | Preserve; not migrated |
| `preview_volume_new` | Player | Preserve; not migrated |
| `screen_preview_volume` | Player | Preserve; not migrated |
| `preview_sizes` | Player | Preserve; not migrated |
| `preview_screen_sizes` | Player | Preserve; not migrated |
| `show_live_player` | Player | Preserve; not migrated |
| `show_vod_player` | Player | Preserve; not migrated |
| `show_clip_player` | Player | Preserve; not migrated |
| `auto_clip_preview` | Player | Preserve; not migrated |
| `show_side_player` | Player | Preserve; not migrated |
| `disable_feed_player_multi` | Player | Preserve; not migrated |
| `start_user_screen` | Interface | Preserve; not migrated |
| `vod_dialog` | Player | Preserve; not migrated |
| `auto_refresh_screen` | Player | Preserve; not migrated |
| `auto_minimize_inactive` | Player | Preserve; not migrated |
| `auto_refresh_background` | Player | Preserve; not migrated |
| `show_feed_player_delay` | Player | Preserve; not migrated |
| `key_up_timeout` | Player | Preserve; not migrated |
| `live_feed_sort` | Player | Preserve; not migrated |
| `burn_in_protection` | Interface | Preserve; not migrated |
| `open_host` | Player | Preserve; not migrated |
| `play_stay` | Player | Preserve; not migrated |
| `live_notification` | Notifications | Preserve; not migrated |
| `title_notification` | Notifications | Preserve; not migrated |
| `game_notification` | Notifications | Preserve; not migrated |
| `live_notification_background` | Notifications | Preserve; not migrated |
| `live_notification_position` | Notifications | Preserve; not migrated |
| `repeat_notification` | Notifications | Preserve; not migrated |
| `since_notification` | Notifications | Preserve; not migrated |
| `global_font_offset` | Interface | Preserve; not migrated |
| `buffer_live` | Player | Preserve; not migrated |
| `buffer_vod` | Player | Preserve; not migrated |
| `buffer_clip` | Player | Preserve; not migrated |
| `end_dialog_counter` | Player | Preserve; not migrated |
| `res_max` | Player | Preserve; not migrated |
| `res_min` | Player | Preserve; not migrated |
| `bitrate_main` | Player | Preserve; not migrated |
| `bitrate_min` | Player | Preserve; not migrated |
| `videos_animation` | Interface | Preserve; not migrated |
| `thumb_quality` | Player | Preserve; not migrated |
| `default_quality` | Player | Preserve; not migrated |
| `check_source` | Player | Preserve; not migrated |
| `ad_filter` | Player | Preserve; not migrated |
| `debug_logs` | Player | Preserve; not migrated |
| `enable_mature` | Player | Preserve; not migrated |
| `enable_embed` | Player | Preserve; not migrated |
| `clock_offset` | Interface | Preserve; not migrated |
| `clock_style` | Interface | Preserve; not migrated |
| `thumb_background` | Player | Preserve; not migrated |
| `ui_opt` | Player | Preserve; not migrated |
| `custom_opt` | Player | Preserve; not migrated |
| `livenotification_opt` | Notifications | Preserve; not migrated |
| `blocked_codecs` | Player | Preserve; not migrated |
| `player_buffers` | Player | Preserve; not migrated |
| `playerend_opt` | Player | Preserve; not migrated |
| `preview_settings` | Player | Preserve; not migrated |
| `update_settings` | Updates | Preserve; not migrated |
| `proxy_settings` | Player | Preserve; not migrated |
| `player_extracodecs` | Player | Preserve; not migrated |
| `player_bitrate` | Player | Preserve; not migrated |
| `dpad_opt` | Player | Preserve; not migrated |
| `chat_opt` | Chat | Preserve; not migrated |
| `backup_sync` | Backup & sync | Preserve; not migrated |
| `warnings_opt` | Player | Preserve; not migrated |
| `vod_seek` | Player | Preserve; not migrated |
| `block_qualities` | Player | Preserve; not migrated |
| `vod_seek_min` | Player | Preserve; not migrated |
| `vod_seek_max` | Player | Preserve; not migrated |
| `vod_seek_time` | Player | Preserve; not migrated |
| `dpad_position` | Player | Preserve; not migrated |
| `dpad_opacity` | Player | Preserve; not migrated |
| `highlight_rewards` | Player | Preserve; not migrated |
| `highlight_first` | Player | Preserve; not migrated |
| `highlight_streamer` | Player | Preserve; not migrated |
| `highlight_mod` | Player | Preserve; not migrated |
| `highlight_verified` | Player | Preserve; not migrated |
| `highlight_atstreamer` | Player | Preserve; not migrated |
| `highlight_atuser` | Player | Preserve; not migrated |
| `highlight_user_send` | Player | Preserve; not migrated |
| `show_sub` | Player | Preserve; not migrated |
| `highlight_bits` | Player | Preserve; not migrated |
| `chat_bot` | Chat | Preserve; not migrated |
| `show_actions` | Player | Preserve; not migrated |
| `clear_chat` | Chat | Preserve; not migrated |
| `show_chatters` | Chat | Preserve; not migrated |
| `chat_line_animation` | Chat | Preserve; not migrated |
| `individual_lines` | Player | Preserve; not migrated |
| `chat_individual_background` | Chat | Preserve; not migrated |
| `chat_showUserNotice` | Chat | Preserve; not migrated |
| `disabled_shared` | Player | Preserve; not migrated |
| `chat_logging` | Chat | Preserve; not migrated |
| `chat_nickcolor` | Chat | Preserve; not migrated |
| `chat_timestamp` | Chat | Preserve; not migrated |
| `block_qualities_43` | Player | Preserve; not migrated |
| `block_qualities_21` | Player | Preserve; not migrated |
| `block_qualities_16` | Player | Preserve; not migrated |
| `block_qualities_14` | Player | Preserve; not migrated |
| `block_qualities_10` | Player | Preserve; not migrated |
| `block_qualities_9` | Player | Preserve; not migrated |
| `block_qualities_7` | Player | Preserve; not migrated |
| `block_qualities_4` | Player | Preserve; not migrated |
| `block_qualities_3` | Player | Preserve; not migrated |
| `hide_main_clock` | Interface | Preserve; not migrated |
| `hide_player_clock` | Interface | Preserve; not migrated |
| `hide_main_screen_title` | Interface | Preserve; not migrated |
| `hide_etc_help_text` | Interface | Preserve; not migrated |
| `hide_screen_counter` | Interface | Preserve; not migrated |
| `round_images` | Interface | Preserve; not migrated |
| `update_background` | Updates | Preserve; not migrated |
| `update_show` | Updates | Preserve; not migrated |
| `chat_show_badges` | Chat | Preserve; not migrated |
| `chat_show_badges_mod` | Chat | Preserve; not migrated |
| `chat_show_badges_vip` | Chat | Preserve; not migrated |
| `chat_show_badges_shared` | Chat | Preserve; not migrated |
| `backup_enabled` | Backup & sync | Preserve; not migrated |
| `sync_enabled` | Backup & sync | Preserve; not migrated |
| `sync_users` | Backup & sync | Preserve; not migrated |
| `sync_history` | Backup & sync | Preserve; not migrated |
| `sync_settings` | Backup & sync | Preserve; not migrated |
| `backup_account` | Backup & sync | Preserve; not migrated |

Declarative settings found: **141**. This table includes legacy/migrated keys intentionally: removal requires reference checks, not assumptions.

Additional dynamic/settings surfaces requiring runtime enumeration:

| Surface | Existing owner / stored state | Proposed destination | Status |
| --- | --- | --- | --- |
| Device codec/bitrate choices | `Settings_CodecsValue`, dynamically created Settings entries | Settings / Player | Requires device capability inventory |
| Theme, focus style and custom RGB | `SettingsColor.js`, `SettingsColor_ColorsObj*`, `colo_rgb*` | Settings / Interface | Static owner mapped; dark/light/custom integration pending |
| Account tokens, username-only accounts and removals | `AddUser.js`, `Users.js`, existing OAuth/dialog flows | Account | Preserve existing storage; live auth tests pending |
| Backup account / Google Drive selection | `GDrive.js`, existing backup/sync preferences | Settings / Backup & sync | Existing flow retained; restore tests pending |
| Updates, changelog, About, controls, Exit | `Main_*Dialog*`, `Main_UpdateDialogShowCheck` | Settings utilities / Exit | Must remain reachable throughout migration |
| Screen filter/sort/period/language/thumb options | `Screens_ThumbOption*`, `Screens_Period*`, screen-specific current settings | Tabs toolbar / content options | Preserve long-press Left and explicit controls |
| Live feed sections / previews | `UserLiveFeed.js`, `UserLiveFeedobj.js`, `Sidepannel.js` | Channels / Browse | Preserve Featured, public Live, followed Live, live history, followed VOD, VOD history |

## Shortcuts and persistence requirements

See [remote matrix](ui-ux-remote-matrix.md). Numeric shortcuts are mode-specific; do not globally remap them. Neither focus movement nor fixture scenario switching writes app storage. Keep UI bookmarks bounded/in memory until a demonstrated persistence need justifies a versioned storage migration.

Production notes: Back closes the current drawer; Audio and Preview group actions initialize their
existing subcontrols before rendering. All 48 descriptors are loaded and checked by the player fixture.
The original settings catalog and storage values remain authoritative; no schema migration was added.
