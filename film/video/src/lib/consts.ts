// Font-free constants (importable from Node scripts: scripts/sections.ts,
// scripts/edl.ts). Keep BPM equal to film.json bpm.
export const ACCENT = {
  main: "#7635fc",
  second: "#a78bfa",
} as const;
export type SceneId = keyof typeof ACCENT;

export const FPS = 60;
export const BPM = 96;
/** One bar in frames (96 BPM at 60 fps: 2.5 s = 150 frames). */
export const BAR = Math.round(((4 * 60) / BPM) * FPS);
export const BEAT = BAR / 4;
/** Frame at a 1-indexed bar (+ beats). */
export const bar = (b: number, beats = 0) => Math.round((b - 1) * BAR + beats * BEAT);
