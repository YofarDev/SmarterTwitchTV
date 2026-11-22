import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { captured } from "../data/events";
import { Segments } from "../lib/Clip";
import { ACCENT, DISPLAY, MUTED, PAPER } from "../lib/theme";
import { coldPlan, railPlan, searchPlan, tabsPlan, themePlan, titlePlan, type Plan } from "../plans";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The TV: the real app recording in a slim bezel, 1600 px wide. */
const TV_W = 1600;
const TV_H = (TV_W * 9) / 16;
const TV_TOP = 56;

const Screen: React.FC<{ plan: Plan; blur?: number; dim?: number }> = ({ plan, blur = 0, dim = 0 }) => {
  const tags = Array.from(new Set(plan.segs.map((s) => s.tag)));
  const ok = tags.every(captured);
  return (
    <div
      style={{
        position: "absolute",
        left: (1920 - TV_W) / 2,
        top: TV_TOP,
        width: TV_W,
        height: TV_H,
        borderRadius: 22,
        overflow: "hidden",
        background: "#000",
        boxShadow: `0 0 0 3px #1e1b25, 0 0 0 5px #2b2438, 0 30px 90px rgba(0,0,0,0.6), 0 0 140px ${ACCENT.main}33`,
      }}
    >
      <div style={{ position: "absolute", inset: 0, filter: blur ? `blur(${blur}px)` : undefined }}>
        {ok ? (
          <Segments segs={plan.segs} />
        ) : (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", color: MUTED, fontFamily: DISPLAY, fontSize: 40 }}>
            not captured yet: {tags.join(", ")}
          </AbsoluteFill>
        )}
      </div>
      {dim > 0 && <AbsoluteFill style={{ background: `rgba(11,10,14,${dim})` }} />}
    </div>
  );
};

/** One caption under the TV; `*word*` is set in the accent. */
const Caption: React.FC<{ text: string; dur: number }> = ({ text, dur }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [8, 34], [0, 1], { ...clamp, easing: EASE });
  const out = interpolate(frame, [dur - 18, dur - 4], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: TV_TOP + TV_H + 26,
        textAlign: "center",
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: 54,
        letterSpacing: "-0.01em",
        color: PAPER,
        opacity: p * out,
        transform: `translateY(${(1 - p) * 18}px)`,
      }}
    >
      {text.split(/(\*[^*]+\*)/).map((w, i) =>
        w.startsWith("*") ? (
          <span key={i} style={{ color: ACCENT.second }}>
            {w.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{w}</span>
        ),
      )}
    </div>
  );
};

const Shot: React.FC<{ dur: number; plan: Plan; caption: string }> = ({ dur, plan, caption }) => (
  <AbsoluteFill>
    <Screen plan={plan} />
    <Caption text={caption} dur={dur} />
  </AbsoluteFill>
);

export const Cold: React.FC<{ dur: number }> = ({ dur }) => <Shot dur={dur} plan={coldPlan()} caption="Live streams, *built for the remote*" />;
export const Rail: React.FC<{ dur: number }> = ({ dur }) => <Shot dur={dur} plan={railPlan()} caption="Every screen *one press away*" />;
export const Tabs: React.FC<{ dur: number }> = ({ dur }) => <Shot dur={dur} plan={tabsPlan()} caption="Live, *categories*, VODs and clips" />;
export const Search: React.FC<{ dur: number }> = ({ dur }) => <Shot dur={dur} plan={searchPlan()} caption="Search that *keeps up*" />;
export const Theme: React.FC<{ dur: number }> = ({ dur }) => <Shot dur={dur} plan={themePlan()} caption="Your theme, *your TV*" />;

/** Logo + two-tone wordmark, as on the TV banner. */
const Mark: React.FC<{ size: number; start?: number }> = ({ size, start = 0 }) => {
  const frame = useCurrentFrame() - start;
  const logo = interpolate(frame, [0, 30], [0, 1], { ...clamp, easing: EASE });
  const a = interpolate(frame, [6, 36], [0, 1], { ...clamp, easing: EASE });
  const b = interpolate(frame, [12, 42], [0, 1], { ...clamp, easing: EASE });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
      <Img
        src={staticFile("logo.png")}
        style={{
          width: size * 1.35,
          height: size * 1.35,
          opacity: logo,
          transform: `scale(${0.8 + 0.2 * logo})`,
          filter: `drop-shadow(0 0 ${size * 0.4}px ${ACCENT.main}66)`,
        }}
      />
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size * 0.62, lineHeight: 1.02, letterSpacing: "-0.02em" }}>
        <div style={{ color: PAPER, opacity: a, transform: `translateX(${(1 - a) * 30}px)` }}>Smarter</div>
        <div style={{ color: ACCENT.second, opacity: b, transform: `translateX(${(1 - b) * 30}px)` }}>Purple TV</div>
      </div>
    </div>
  );
};

export const Title: React.FC<{ dur: number }> = () => (
  <AbsoluteFill>
    <Screen plan={titlePlan()} blur={16} dim={0.55} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 40 }}>
      <Mark size={200} start={4} />
    </AbsoluteFill>
  </AbsoluteFill>
);

export const Finale: React.FC<{ dur: number }> = () => {
  const frame = useCurrentFrame();
  const sub = interpolate(frame, [34, 64], [0, 1], { ...clamp, easing: EASE });
  const url = interpolate(frame, [50, 80], [0, 1], { ...clamp, easing: EASE });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 56 }}>
      <Mark size={170} start={6} />
      <div style={{ textAlign: "center", fontFamily: DISPLAY }}>
        <div style={{ fontSize: 46, fontWeight: 500, color: PAPER, opacity: sub, transform: `translateY(${(1 - sub) * 16}px)` }}>
          Unofficial Twitch client for Android TV &amp; Google TV
        </div>
        <div style={{ marginTop: 18, fontSize: 36, fontWeight: 400, color: MUTED, opacity: url }}>github.com/YofarDev/SmarterPurpleTV</div>
      </div>
    </AbsoluteFill>
  );
};
