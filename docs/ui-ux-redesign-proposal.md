# Smarter Purple TV redesign proposal

Status: draft for review. Scope: navigation, home, and player. Based on source inspection; current on-device appearance and behavior have not been tested for this proposal.

## 1. Product direction

**Open SPTV, see who you follow that is live, and start watching.**

The user has confirmed three priorities: followed live channels come first, all capabilities remain available, and the first deliverable is a proposal covering the whole everyday experience.

The proposed identity comes through a recognizable interaction: the followed channels you see at startup are also available in a compact switcher while watching. Home and playback feel like two views of the same personal channel collection.

"Premium" should be visible in readable typography, steady focus, useful defaults, coherent controls, and fast transitions. Larger empty areas alone would make finding a stream slower.

## 2. Navigation: one stable menu

Replace the separate main/user menu states with one menu whose destinations keep the same meaning. On browsing screens, use a narrow left rail that expands into labeled navigation when entered. Expansion overlays the content rather than moving its grid or native preview bounds. Every destination remains identifiable through an icon and a short label; do not require memorizing icons.

| Destination | Contents |
| --- | --- |
| **Following**, startup destination | Live now; tabs for followed videos, channels, and categories |
| **Browse** | Live streams, categories, featured content, videos, and clips |
| **Search** | One entry point; result types for live streams, channels, categories, and videos |
| **Library** | Watch history, with live/video/clip filters; resume videos where existing history supports it |
| **Account**, lower utility area | Switch/add accounts, own channel, blocked channels |
| **Settings**, lower utility area | Playback, chat, appearance, remote controls, notifications, accounts/sync, updates, help/about |

Keep explicit Exit available in the utility area. Put changelog under Updates and controls help under Remote controls. Featured content remains accessible inside Browse.

Navigation behavior:

- Left from the first content column enters navigation; Right returns to the remembered content item.
- Moving focus over a destination does not replace the screen. OK opens it.
- Return from playback restores the previous channel and scroll position when that item still exists.
- Back closes the current layer before navigating away. At the top level, preserve an explicit exit flow.
- Keep sort/filter controls near their content, with current values visible when relevant.

**Tradeoff:** less frequently used destinations move one level deeper. They gain stable names and locations instead of a second menu mode.

## 3. Home: Following opens on Live now

Use a three-column grid as the initial TV layout hypothesis. It provides recognizable thumbnails and readable channel names without spending half the viewport on a single featured stream. Validate density at viewing distance; three columns is a proposal, not a locked setting.

Structural sketch. Placeholders represent content, not a final visual design:

```text
┌──────────────────────────────────────────────────────────────────┐
│ SPTV       Following                              Account        │
│            Live now · 12   Videos   Channels   Categories         │
│                                                                  │
│ Following  ┌────────────────┐ ┌────────────────┐ ┌──────────────┐│
│ Browse     │ Stream preview │ │ Stream preview │ │ Preview      ││
│ Search     │ LIVE           │ │ LIVE           │ │ LIVE         ││
│ Library    └────────────────┘ └────────────────┘ └──────────────┘│
│            Channel name       Channel name       Channel name    │
│            Category · viewers Category · viewers Category        │
│                                                                  │
│            ┌────────────────┐ ┌────────────────┐ ┌──────────────┐│
│            │ Stream preview │ │ Stream preview │ │ Preview      ││
│ Account    └────────────────┘ └────────────────┘ └──────────────┘│
│ Settings   Channel name       Channel name       Channel name    │
│                                                                  │
│            Focused stream title                     OK Watch     │
└──────────────────────────────────────────────────────────────────┘
```

The sketch shows navigation expanded for explanation; content gets the larger area during ordinary browsing. Numbers and stream placeholders are illustrative.

Card hierarchy:

1. Thumbnail and a compact LIVE badge.
2. Channel name, with the strongest text emphasis.
3. Category and viewer count in a quieter line.
4. The full focused stream title in a fixed detail area, so focus does not change card height.

On a fresh launch, focus the first available live card. Within a session, restore the last focused channel by identity. Respect the existing sort preference. Refreshes must not move a focused item under the user; defer reordering until navigation/re-entry and choose a predictable neighboring item if a channel disappears.

OK plays immediately. Keep channel details reachable through an explicit action in the detail area; long press may remain a shortcut but must not be the only route. Preserve configured preview behavior with a focus dwell delay and one preview at a time.

Important states:

| State | Experience |
| --- | --- |
| No account configured | "Add an account to see followed channels," plus a usable Browse action |
| Account needs authorization | Explain the issue and offer reconnection without implying follows are empty |
| No follows | Explain how to follow channels; offer Search and Browse |
| Nobody live | "Nobody you follow is live right now"; offer followed videos and Browse |
| Loading | Stable card placeholders and usable navigation; no decorative animated shimmer required |
| Refresh failure | Keep last successful content, mark it as potentially out of date, and offer Retry |
| Missing thumbnail or long title | Same card geometry, fallback image, readable truncation; full title in detail area |

## 4. Player: a quiet bar with clear destinations

While watching, the picture leads. Reveal controls on OK, then automatically dismiss the compact bar after inactivity. A settings drawer stays open while the viewer is reading or editing it.

```text
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                           VIDEO                                  │
│                                                                  │
│                                                                  │
│  Channel name · LIVE                                             │
│  Stream title                                                    │
│                                                                  │
│  [Pause]   [Chat]   [Quality: Auto]   [Layout]   [More]              │
│  ↑ Channels                                          Back Close  │
└──────────────────────────────────────────────────────────────────┘
```

Use text labels alongside icons. Display the actual state, such as Chat on/off and selected quality. For videos and clips, show the timeline and supported transport controls; reserve "Back to live" for playback modes that actually support it.

| Entry | What opens |
| --- | --- |
| **Pause / Play** | Existing transport action; availability follows the current playback mode |
| **Chat** | Show/hide chat, Chat on phone, write a message, then appearance and advanced chat options |
| **Quality** | Available qualities and current choice; include Auto only where supported |
| **Layout** | Single stream, supported picture-in-picture/multistream modes, target stream selection, and audio source |
| **More** | Channel/category details, follow state, available broadcast/rewind/chapters, playback speed, audio, low latency, previews, external player, screen off, and diagnostics, grouped by purpose |

Drawers open as readable vertical lists, with current values aligned consistently and descriptions shown only for the focused row. Deep controls remain inside named groups: Playback, Audio, Preview, and Diagnostics. Avoid replacing one long control strip with one equally long "More" list.

**The channel switcher:** retain Up as the shortcut to followed channels. Show a horizontal row over the playing video. Left/Right selects; OK switches; Back cancels. Also expose Channels through More so the shortcut is optional. Preview behavior follows existing preferences. In multistream, selection uses the existing add/replace workflow and makes the destination slot explicit.

**The phone chat entry:** keep "Chat on phone" near the top of Chat, with its QR instructions in a focused panel. Retain the existing number-key shortcut as an accelerator. It should be discoverable with a basic remote.

## 5. Remote and focus contract

These are proposed rules to verify against all existing modes before implementation:

| Context | Input | Result |
| --- | --- | --- |
| Following | Arrows | Move predictably through tabs, cards, details, and navigation |
| Live card | OK | Start the stream |
| Watching, overlays closed | OK | Reveal the compact player bar |
| Watching, overlays closed | Up | Open the channel switcher |
| Single-stream playback | Down | Retain the existing chat shortcut where applicable |
| Bar or drawer open | Arrows / OK | Navigate / activate the selected control |
| Any overlay | Back | Close the top layer and restore its originating focus |
| Watching, overlays closed | Back | Return through the existing exit/background-playback policy; restore browsing position |
| Video timeline | Left / Right | Seek using existing seek configuration |

Existing mode-specific arrows for chat positioning, picture-in-picture, multistream audio, media keys, number keys, and long presses need an explicit compatibility mapping. Do not silently replace those actions with global shortcuts.

Focus must remain clearly visible at viewing distance, distinguish selection from keyboard/remote focus, and never depend on color alone. Use a stable outline plus a change in surface or label treatment. Avoid focus scaling: the current app's native preview and scrolling logic rely on measured element bounds.

## 6. Visual brief and feature preservation

The visual identity is still open for review. The layout proposal calls for a consistent type hierarchy, restrained interface decoration, readable secondary text, stable card geometry, and short transitions that do not delay input. The existing purple brand gives us a starting point; exact palette, typeface, icon treatment, corner shape, and motion should be compared visually in the next stage.

Keep TV content dominant, allow localization and user text-size preferences, and retain appearance/animation/accessibility settings. Avoid expensive full-screen blur and effects that depend on modern WebViews. Evaluate 1080p and 720p on the actual supported hardware rather than judging only a desktop screenshot.

Feature preservation is a migration requirement:

| Existing area | Proposed home |
| --- | --- |
| Followed live, videos, channels, categories | Following tabs |
| Public live, featured, categories, videos, clips | Browse tabs |
| Channel/category content and follow actions | Detail screens and player More |
| Live/video/clip history | Library filters |
| Accounts, own channel, blocked channels | Account |
| Chat, writing, phone chat, layout/delay/font/shared-chat controls | Player Chat and global Chat settings |
| PiP, multistream, per-stream audio/quality/resync | Layout, Audio, and relevant playback groups |
| Speed, rewind, chapters, external player, screen off | Contextual player groups |
| Preview enablement, size, volume and main-player volume | Preview group and global settings |
| Player status and troubleshooting | Diagnostics |
| Language, themes, notifications, buffering, codecs, ad blocking, backup/sync | Existing settings retained in named categories |
| Updates, changelog, controls help, about, exit | Stable utility destinations |

Before replacing any screen, enumerate every existing reachable action and setting into an old-to-new checklist. This table describes the major groups; it is not a completed parity audit. Device-dependent and unavailable actions must explain their state rather than silently vanish during an error.

## 7. Delivery and acceptance

1. Review this structure. Confirm that the navigation and player grouping fit everyday use.
2. Choose the visual direction using representative home, player, and drawer compositions.
3. Build a separate remote-navigable prototype with representative content, empty/error states, and long translated labels.
4. Integrate the browsing shell and Following first, then the player bar/drawers, preserving existing playback/data functions and user settings.
5. Complete the feature-parity checklist, targeted fixtures, JSHint, full generated build, browser keyboard checks, and real-device verification. Apply the required web version/changelog bump when shipping implementation.

Acceptance scenarios:

- A configured account opens on followed live channels; a focused live card starts with one OK press.
- A viewer can switch to another followed channel and cancel the switcher without losing the current stream.
- Back restores focus and closes one layer at a time.
- A refresh cannot jump focus to another stream or reset the user's scroll position.
- Quality, phone chat, and supported multistream remain reachable without special remote buttons.
- Live, VOD, clips, chat, PiP, multistream, account switching, and existing preference combinations retain their functions.
- A real TV check confirms legible text, unclipped focus, correctly aligned native previews, and responsive input.

The proposed first implementation boundary is the browsing shell plus Following. The player follows after the new focus and navigation patterns are validated. This document changes no application behavior.
