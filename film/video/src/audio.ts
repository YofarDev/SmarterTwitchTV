// The sound edit: which stretch of which run's voice/foley plays where on the
// film's clock, and the designed hits. Font-free: scripts/edl.ts prints it
// for pipeline/mixfilm.py.
import { sections } from "./sections";
import { coldPlan, railPlan, searchPlan, tabsPlan, themePlan, titlePlan, type Plan } from "./plans";

export type Region = {
  tag: string;
  /** film frame the region starts at */
  at: number;
  /** the run's clock at that frame */
  atMs: number;
  frames: number;
  voice: number; // gain
  foley: number;
  /** ambient bed (file name in film.json bedsDir, without .wav) and level */
  bed?: string;
  bedLevel?: number;
  /** playback speed of the footage (typing sped up): ticks follow it */
  rate?: number;
};

export type Hit = { at: number; kind: "whoosh" | "boom" | "riser" | "shimmer"; gain: number };

// Every shot's run audio (the app is silent: the foley is the typing ticks
// and key clicks the mix adds from the run's events).
export function regions(): Region[] {
  const s = Object.fromEntries(sections().map((x) => [x.id, x]));
  const plans: [string, Plan][] = [
    ["cold", coldPlan()],
    ["title", titlePlan()],
    ["rail", railPlan()],
    ["tabs", tabsPlan()],
    ["search", searchPlan()],
    ["theme", themePlan()],
  ];
  return plans.flatMap(([id, p]) =>
    p.segs.map((g) => ({
      tag: g.tag, at: s[id].from + g.from, atMs: g.atMs, frames: g.dur, voice: 0, foley: id === "title" ? 0.3 : 0.8, rate: g.rate,
    })),
  );
}

export function hits(): Hit[] {
  const s = Object.fromEntries(sections().map((x) => [x.id, x]));
  return [
    { at: s.title.from - 120, kind: "riser", gain: 0.45 }, // ends on the title's downbeat
    { at: s.title.from, kind: "boom", gain: 0.9 },
    { at: s.title.from, kind: "shimmer", gain: 0.5 },
    { at: s.rail.from, kind: "whoosh", gain: 0.35 },
    { at: s.theme.from, kind: "shimmer", gain: 0.4 },
    { at: s.finale.from, kind: "whoosh", gain: 0.35 },
    { at: s.finale.from + 6, kind: "boom", gain: 0.5 },
  ];
}
