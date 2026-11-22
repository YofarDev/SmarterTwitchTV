// Every cut hangs on a harness event (src/data/events.ts), never on
// hand-typed seconds: the fallbacks only apply until the run is captured.
// Run tags = film/harness/capture.mjs run names.
import { ev } from "./data/events";
import { BAR } from "./lib/consts";
import type { Seg } from "./lib/segtypes";

export type Plan = { segs: Seg[]; dur: number };

const one = (tag: string, atMs: number, extra: Partial<Seg> = {}): Plan => ({
  segs: [{ from: 0, dur: BAR, tag, atMs, ...extra }],
  dur: BAR,
});

const two = (a: Omit<Seg, "from">, b: Omit<Seg, "from" | "dur">): Plan => ({
  segs: [
    { from: 0, ...a },
    { from: a.dur, dur: BAR - a.dur, ...b },
  ],
  dur: BAR,
});

/** Bar 1: the focus glides across the live grid. */
export const coldPlan = () => one("browse", ev("browse", "glideStart", 0, 4400) - 150, { zoom: 1, zoomTo: 1.04, focus: [0.3, 0.4] });

/** Bar 2 (blurred under the title): the glide goes on. */
export const titlePlan = () => one("browse", ev("browse", "focus", 2, 6500) - 100);

/** Bar 3: the rail opens, moves, closes (slightly sped up). */
export const railPlan = () => one("nav", ev("nav", "railOpen", 0, 5000) - 250, { rate: 1.15 });

/** Bar 4: Live → Front Page, then Categories. */
export const tabsPlan = () =>
  two(
    { dur: 70, tag: "nav", atMs: ev("nav", "tab", 0, 9000) - 450 },
    { tag: "nav", atMs: ev("nav", "tab", 1, 11000) - 450, zoom: 1, zoomTo: 1.04, focus: [0.3, 0.45] },
  );

/** Bar 5: "minecraft" typed (sped up), then the results. */
export const searchPlan = () =>
  two(
    { dur: 80, tag: "search", atMs: ev("search", "typeStart", 0, 6000) - 150, rate: 1.3, zoom: 1.12, focus: [0.5, 0.35] },
    { tag: "search", atMs: ev("search", "results", 0, 9000) - 150 },
  );

/** Bar 6: Styles → White, then Browse in the light theme. */
export const themePlan = () =>
  two(
    { dur: 55, tag: "theme", atMs: ev("theme", "styleWhite", 0, 9000) - 550, zoom: 1.1, focus: [0.5, 0.75] },
    { tag: "theme", atMs: ev("theme", "browseLight", 0, 11000) - 200 },
  );
