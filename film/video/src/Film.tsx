import React from "react";
import { AbsoluteFill, Easing, interpolate, interpolateColors, Sequence, useCurrentFrame } from "remotion";
import { Backdrop, Grain } from "./lib/Backdrop";
import { ACCENT } from "./lib/theme";
import { Cold, Finale, Rail, Search, Tabs, Theme, Title } from "./scenes/Showcase";
import { sections, total } from "./sections";

/** One scene component per section id. */
const SCENES: Record<string, React.FC<{ dur: number }>> = {
  cold: Cold,
  title: Title,
  rail: Rail,
  tabs: Tabs,
  search: Search,
  theme: Theme,
  finale: Finale,
};

/** The backdrop's accent per section (cross-faded). */
const ACCENTS: Record<string, string> = {
  cold: ACCENT.main,
  title: ACCENT.main,
  rail: ACCENT.main,
  tabs: ACCENT.second,
  search: ACCENT.main,
  theme: ACCENT.second,
  finale: ACCENT.main,
};

const AccentBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const s = sections();
  const stops = s.map((x) => x.from + 20);
  const colors = s.map((x) => ACCENTS[x.id] ?? ACCENT.main);
  const accent = s.length > 1 ? interpolateColors(frame, stops, colors) : colors[0];
  return <Backdrop accent={accent} />;
};

export const Film: React.FC = () => {
  const s = sections();
  return (
    <AbsoluteFill>
      <AccentBackdrop />
      {s.map((x, i) => {
        const C = SCENES[x.id];
        return (
          <Sequence key={x.id} from={x.from} durationInFrames={x.dur} name={x.id}>
            <Push dur={x.dur} first={i === 0} last={i === s.length - 1}>
              <C dur={x.dur} />
            </Push>
          </Sequence>
        );
      })}
      <Grain opacity={0.06} />
    </AbsoluteFill>
  );
};

/** Every section pushes in out of a soft blur and leaves the same way, as
 * if the camera moved on (the hits in the mix land on these). */
const Push: React.FC<{ dur: number; first: boolean; last: boolean; children: React.ReactNode }> = ({
  dur,
  first,
  last,
  children,
}) => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const inP = first ? 1 : interpolate(frame, [0, 22], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const outP = last ? 0 : interpolate(frame, [dur - 22, dur], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.84, 0) });
  const blur = (1 - inP) * 14 + outP * 14;
  return (
    <AbsoluteFill
      style={{
        scale: String(1.035 - 0.035 * inP - 0.03 * outP),
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const FILM_FRAMES = total();
