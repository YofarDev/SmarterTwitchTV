---
name: Smarter Purple TV
description: Layered-charcoal TV interface - tonal charcoal surfaces, one violet accent reserved for focus, em-scaled Roboto type on a virtual 1080p stage
colors:
  bg-base: "#0b0a0e"
  bg-elevated: "#15121c"
  bg-railed: "#1e1b25"
  bg-surface: "#1f1b29"
  bg-focus: "#30253f"
  edge: "#2b2438"
  divider: "#494151"
  text-primary: "#ffffff"
  text-secondary: "#b4a9cf"
  text-meta: "#9a90b3"
  text-title-focus: "#f5f1fa"
  text-soft: "#c1b8cd"
  accent: "#7635fc"
  accent-bright: "#a78bfa"
  accent-tab: "#6f43bd"
  focus-outline: "#bca0ff"
  live: "#ff4d4d"
  live-deep: "#ff2121"
  live-badge: "#d92626"
  vod-badge: "#00843a"
  vod-indicator: "#00a94b"
  clip-badge: "#c2410c"
  hosting: "#FED000"
typography:
  body:
    fontFamily: "Roboto"
    fontSize: "29px"
    fontWeight: 400
  bold:
    fontFamily: "Roboto-Bold"
  display:
    fontFamily: "Roboto-Black, Roboto-Bold"
    fontSize: "200%"
  label:
    fontFamily: "Roboto"
    fontSize: "90%"
  meta:
    fontFamily: "Roboto"
    fontSize: "72%"
rounded:
  chip: "0.15em"
  badge: "0.2em"
  card: "0.25em"
  pill: "0.55em"
  circle: "50%"
spacing:
  hairline: "0.09em"
  gap: "1vh"
  safe-margin: "4.5%"
components:
  card-grid:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
  card-grid-focused:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
  card-switcher-focused:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
  nav-rail:
    backgroundColor: "{colors.bg-railed}"
    textColor: "{colors.text-primary}"
  nav-focused:
    backgroundColor: "{colors.bg-focus}"
    textColor: "{colors.text-primary}"
  tab-selected:
    backgroundColor: "{colors.accent-tab}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
  live-badge:
    backgroundColor: "{colors.live}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.badge}"
---

# Design System: Smarter Purple TV

## Overview

**Creative North Star: "Layered Charcoal"** (named by the project's own token comment in `app/index.html`; direction approved by the user in October 2026 and integrated in the production shell and player)

A television interface viewed from a couch distance and operated with a directional remote, OK, and Back. Hierarchy is carried by content imagery and remote focus, not by decoration: charcoal surfaces stack tonally (darker canvas, elevated cards, one railed layer), and a single violet accent marks everything the remote can act on. The look is deliberately quiet so live thumbnails own the screen; focus feedback is instant, outlined, and never changes element geometry.

Two structural facts shape every rule here. First, the whole UI renders on a virtual 1920×1080 stage that scales to the device, so all sizes live in `em`, `%`, and `vh` relative to a 29px base body font. Second, users choose a theme (dark, light, or custom RGB) whose four palette slots — background, text, border/accent, progress — are applied at runtime by `app/specific/SettingsColor.js`, which writes generated CSS classes; the hex values in this document are the default dark theme's layer. The hard compatibility floor is old TV WebViews: no CSS variables, no blur, no webfont downloads, no focus scaling, and motion must honor the saved animation preference and reduced-motion.

This system was captured from the integrated redesign (`app/`); the isolated fixture in `dev/ui-redesign/` remains reference-only and may use modern CSS that must be ported or verified against supported TV engines before adoption into `app/index.html`. Hardware acceptance is tracked in `docs/ui-ux-redesign-validation.md`.

**Key Characteristics:**

- Tonal charcoal layering instead of shadows: depth is a five-step surface ladder, not drop shadows
- One violet accent family, reserved for focus, progress, and active destination state
- Focus is an outline or layered glow that never scales or transforms the focused element
- Everything scales from a virtual 1080p stage; no media-query breakpoints
- Labeled badges for state (LIVE, Paused, quality) — never color alone
- Values kept in sync by hand: the token comment in `app/index.html` is the source of truth

## Colors

A near-monochrome charcoal palette with one violet accent family and a single semantic red for live state. Quiet surfaces, expressive focus.

### Primary

- **Royal Violet** (`#7635fc`): The accent. Default theme's border/accent and progress color; focus borders on cards, quality/progress bars, Actions button borders. Its 45%-alpha version is the focus glow.
- **Bright Violet** (`#a78bfa`): The accent at full brightness for thin marks — inset focus rings on small elements, spinner-row arrows, scroll arrows.
- **Focus Lavender** (`#bca0ff`): The remote-focus voice. Focus outlines and underline marks on switcher cards, rail rows, bar buttons, and the origin underline in the player bar.
- **Tab Violet** (`#6f43bd`): Filled pill background for the selected destination tab, white text on top.

### Neutral

- **Void** (`#0b0a0e`): Scenes and scrims. The app's ground behind everything, including the scene background the theme generator paints.
- **Panel Charcoal** (`#15121c`): Elevated layer: dialogs, grid cards, chat and input bars; also the default theme background slot.
- **Rail Charcoal** (`#1e1b25`): The one step above Panel Charcoal: navigation rail, player bar, drawers. Elevated surfaces get directional edge shadows so they read as floating over content.
- **Row Charcoal** (`#1f1b29`): Pressed/hover row surfaces, one step inside Panel Charcoal.
- **Focus Fill** (`#30253f`): Filled surface under focused rail rows, bar buttons, and drawer rows — the focused element darkens toward violet rather than brightening.
- **Edge** (`#2b2438`): Hairline borders between panels and rows.
- **Divider** (`#494151`): Hairline separators that must stay visible on Rail Charcoal surfaces — toolbar group separators, the detail band's top rule, footer key-group dividers.

### Text

- **Primary White** (`#ffffff`): Titles, labels, and generated-theme body text.
- **Secondary Grey-Violet** (`#b4a9cf`): Metadata and secondary labels on cards.
- **Meta Grey** (`#9a90b3`): Tertiary metadata — the quietest text on screen.
- **Focus Title White** (`#f5f1fa`): The focused title in the reserved bottom area; near-white warmed toward violet.
- **Soft Violet** (`#c1b8cd`): Player captions and drawer help lines in the default theme.

### Semantic

- **Live Red** (`#ff4d4d`): LIVE state and recording indicators (family: `#ff5252`, `#ff2121`). Always paired with a text badge.
- **Deep Red** (`#ff2121`): The deep end of the Live Red family; update-warning text (sidepanel label and update dialog title).
- **Live Badge Red** (`#d92626`): The LIVE badge background — Live Red's hue deepened so white badge text keeps ≥ 4.5:1 contrast at badge size. Single source: `Main_ColorBadgeLive` in `Main.js` and `.stream_live_badge` in `app/index.html`.
- **VOD Green** (`#00843a`): VOD badge background, white text on top. Single source: `Main_ColorBadgeVod` in `Main.js`.
- **VOD Dot Green** (`#00a94b`): VOD state indicator dot — the brighter indicator hue of VOD Green. Single source: `Main_ColorIndicatorVod` in `Main.js`.
- **Clip Orange** (`#c2410c`): CLIP badge background, white text on top. Single source: `Main_ColorBadgeClip` in `Main.js`.
- **Hosting Yellow** (`#FED000`): Hosting state dot. Single source: `Main_ColorIndicatorHosting` in `Main.js`.

### Named Rules

**The Theme-Slots Rule.** The saved palette wins. User themes are four slots (background, text, border, progress) applied by `SettingsColor.js` via generated classes; a new UI element that needs theming must read those generated classes or slot values, never hardcode default hexes. The defaults here are only the dark theme's layer.

**The One Accent Rule.** The violet family (accent, bright, tab, focus lavender) is spent on focus, progress, and active state only. It never colors containers, text runs, or decoration.

## Typography

**Display/Emphasis Font:** Roboto-Black with Roboto-Bold fallback (bundled locally)
**Body Font:** Roboto (bundled locally)
**Emphasis via family:** Roboto-Bold — weight is expressed by switching family, not `font-weight`, for old-WebView reliability

**Character:** A neutral, dense, highly legible sans tuned for TV distance; a hairline text stroke (`-webkit-text-stroke: 0.005em` on body) keeps light-on-dark text crisp on low-contrast panels.

### Hierarchy

All sizes are percentages of the stage body font (29px at the 1080p reference), so they track the user's global font offset and screen scale.

- **Display** (Roboto-Black, 200%, ≈57px at 1080p): Screen-level headings and hero numbers.
- **Title** (Roboto-Bold, 130–150%): Dialog titles, section headers.
- **Body** (Roboto, 100%): Standard labels, list rows, chat.
- **Label** (Roboto/Bold, 80–110%, contextual): Card titles and controls; the most common size band.
- **Meta** (Roboto, 55–76%): Viewer counts, uptime, game names under thumbnails.

### Named Rules

**The No New Fonts Rule.** The bundled Roboto family and the existing icon library are the complete cast. No font downloads, no framework additions.

## Layout

One geometry: the app renders on a virtual 1920×1080 stage. `app/general/resize.js` fits the stage by height (wider than 16:9) or width (narrower), letterboxes the remainder, and sets body font to 29px × scale factor plus the user's `global_font_offset` setting. A handful of components get vh-derived pixel sizes through the generated `vh_class` style block. There are no breakpoints; the stage math replaces them.

- **Safe margins:** Keep at least 4.5–5% around primary content; nothing important touches the screen edge.
- **Shell:** A fixed narrow navigation rail opens over the content without moving its grid or previews. Following holds Live now, Videos, Channels, Categories.
- **Grid:** Three columns of fixed 16:9 thumbnails (a TV-validation hypothesis, not a law), scrolling inside the available area. The focused title and the channel-details action live in a reserved bottom area that stays reachable when large text reduces visible rows.
- **Player:** A compact bar over the video with `[Play] [Chat][Quality][Layout] … [More][Channels]`; the timeline lives inside the bar card. Drawers open as one vertical selection column; the paused chip stays bottom-left once the bar hides.
- **Traversal:** Left/Right move between card bodies and clamp at row ends — never wrap into another grid row. On refresh, identity resolves before numerical position.

### Named Rules

**The Row Clamp Rule.** Left/Right traversal clamps at row ends. A horizontal press never lands the user on a different vertical position.

**The Instant Focus Rule.** Focus feedback never waits: rail opening, network responses, delay timers, and preview completion may not delay the focus treatment.

## Elevation & Depth

A hybrid that leans tonal. The five surface steps (Void → Panel Charcoal → Rail Charcoal → Row Charcoal → Focus Fill) carry most depth. Drop shadows appear only where a surface floats over moving content — the rail and drawers — and inside the layered focus glow on grid cards. Switcher cards, rail rows, and drawer rows use outline-only focus with no glow. Nothing grows, scales, or lifts on focus.

### Shadow Vocabulary

- **Layered focus glow** (`box-shadow: 0 0 0 0.05em rgba(118,53,252,0.45), 0 0 0.7em 0.1em rgba(118,53,252,0.45), 0 0.35em 1em rgba(0,0,0,0.5)`): Grid-card focus — tight accent edge, soft glow, depth shadow in one stack. Generated by `SettingsColor.js` from the theme border slot; never scales the card (scroll math and the native preview overlay read live `getBoundingClientRect()`).
- **Rail edge right** (`box-shadow: 0.6em 0 1.5em rgba(0,0,0,0.35)`): Right edge of an open rail/drawer.
- **Rail edge left** (`box-shadow: -0.5em 0 1.5em rgba(0,0,0,0.3)`): Left edge of a right-anchored drawer.
- **Inset accent ring** (`box-shadow: inset 0 0 0 0.4vh #a78bfa`): Selected-state marking on small controls.
- **Focus underline** (`box-shadow: 0 0.12em 0 #bca0ff` / `inset 0 -0.12em 0 #bca0ff`): Focused row titles and the player-bar button that owns the open drawer.

### Named Rules

**The Focus Never Scales Rule.** Focus changes outline, fill, and shadow only. No scale, no transform: scroll positioning and the native preview overlay measure live element bounds.

## Shapes

Small, quiet radii expressed in em so they scale with text. Chips at 0.15em, badges at 0.2em, cards and dialogs at 0.25em, the selected tab as a 0.55em pill, avatars and dots at 50%. Borders are 0.09em hairlines in Edge `#2b2438` — or fully transparent until focus replaces them with the outline treatment. Titles and long labels clip with ellipsis while full identity stays in accessible labels; drawer rows clipped above or below get gradient fade hints instead of scrollbars. Spinner rows read `◂ value ▸` with the bright arrow on the in-bounds side.

## Components

### Grid thumbnail card (signature)

The recurring live/VOD/clip card: 16:9 image, metadata row with a trailing **Actions** button in the corner (the Web 755 model). The card body is the remote focus target and holds the single-press primary action; holding OK — or activating Actions with a pointer — opens the item's options menu, never inheriting the body's hold timers. Focused cards darken to Panel Charcoal with the accent border and layered focus glow; focused titles render in Focus Title White.

- **Shape:** 0.25em radius card, 16:9 fixed image geometry
- **Default:** transparent-to-Edge border, Secondary Grey-Violet metadata
- **Focused:** Panel Charcoal fill, accent border, layered focus glow, 300ms `cubic-bezier(0.4, 0, 0.2, 1)` transition
- **Switcher variant:** flat fill + `0.1em` Focus Lavender outline (0.05em offset), no glow, 200ms transition

### Navigation rail button

Icon + label rows on Rail Charcoal. Focused: Focus Fill `#30253f` with a Focus Lavender outline. Current destination: text in Focus Lavender (`aria-current="page"`), separate from the focus outline so position and destination read independently.

### Destination tabs

Text tabs in the shell header; the selected one becomes a Tab Violet pill (white text, 0.55em radius). Unselected tabs are Soft Violet text on transparent.

### Player bar buttons

Icon buttons on Rail Charcoal, grouped `[Play] [Chat][Quality][Layout] … [More][Channels]`. The button that opened the current drawer keeps an inset underline while the rest of the bar recedes; captions read `Quality · <rendition>` with `Paused` on the right while paused.

### Live badge

Labeled badge in Live Red with white text, 0.2em radius, uppercase — "LIVE", "VOD", "CLIP" — always text, never color alone.

### Drawer rows and dialogs

One vertical selection column on Rail Charcoal; focused rows use Focus Fill + outline; groups opened from More carry a `More › …` breadcrumb and a help line matching the drawer's controls. Dialogs sit on Panel Charcoal at 0.25em radius. Footer hints describe the focused target's actual controls and may wrap to two lines rather than shrink.

## Do's and Don'ts

### Do:

- **Do** keep all sizes in `em`/`%`/`vh` on the 1080p stage, and honor the user's global font offset (large text may show fewer rows, but reserved controls stay reachable).
- **Do** theme new elements through the `SettingsColor.js` generated classes and theme slots.
- **Do** hand-sync any new default value with the token comment at the top of the `<style>` block in `app/index.html`.
- **Do** keep at least 4.5–5% safe margins and clamp horizontal traversal at row ends.
- **Do** label state (LIVE/Paused/quality) with text badges; pair color with words.
- **Do** honor the saved app-animation preference and reduced motion; motion is 200ms (switcher) / 300ms (grid) `cubic-bezier(0.4, 0, 0.2, 1)` when allowed.
- **Do** keep the focused title and channel-details action in the reserved bottom area of scrolling grids.

### Don't:

- **Don't** use CSS variables in production CSS — old TV WebViews and the theme generator require hand-synced literal values.
- **Don't** scale, transform, or blur focused elements; focus changes outline, fill, and shadow only.
- **Don't** convey state with color alone, and don't spend the violet accent on decoration or containers.
- **Don't** wrap Left/Right traversal into another grid row.
- **Don't** let any async work (network, timers, previews) delay focus feedback; Back closes only the top layer.
- **Don't** adopt modern CSS from the `dev/ui-redesign/` fixture into `app/index.html` without verifying it against supported TV engines.
- **Don't** hand-edit `release/` output; regenerate it with the build.
