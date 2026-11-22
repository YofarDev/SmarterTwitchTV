// The film's sections on the bar grid: seven one-bar shots (17.5 s at 96 BPM).
// The music is composed to this table (scripts/sections.ts prints it into
// ../music/sections.json). `role` picks the music for the section
// (music/styles/storybook.py: intro, hit, verse, verse2, groove, build,
// climax, breakdown, finale).
import { BAR } from "./lib/consts";

export type Section = { id: string; bars: number; from: number; dur: number; startBar: number; role?: string };

export function sections(): Section[] {
  const table: [string, number, string?][] = [
    ["cold", 1, "intro"],
    ["title", 1, "hit"],
    ["rail", 1, "verse"],
    ["tabs", 1, "groove"],
    ["search", 1, "build"],
    ["theme", 1, "climax"],
    ["finale", 1, "finale"],
  ];
  let at = 0;
  return table.map(([id, b, role]) => {
    const s: Section = { id, bars: b, from: at * BAR, dur: b * BAR, startBar: at + 1 };
    if (role) s.role = role;
    at += b;
    return s;
  });
}

export const total = () => sections().reduce((s, x) => s + x.dur, 0);
