import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// The film's look. Every colour and font the lib components use lives here
// (and the scene accents in consts.ts): set them from the app's own design
// system. Defaults: "storybook night" (the yofardev_ai film).

/** The app's name as the title card's wordmark draws it. */
export const WORDMARK = "Smarter Purple TV";

export const INK = "#0b0a0e"; // the stage background
export const SURFACE = "#15121c";
export const PAPER = "#ffffff"; // main text
export const MUTED = "rgba(180, 169, 207, 0.9)";
export const ACCENT_DEFAULT = "#a78bfa";
export const GLOW = "#7635fc"; // the backdrop's second, cool glow
export const VIGNETTE = "rgba(5,3,8,0.75)";
export const PANEL_FROM = "rgba(40,33,52,0.78)"; // callout glass
export const PANEL_TO = "rgba(22,18,29,0.72)";
export const CARD_FROM = "rgba(44,36,58,0.8)"; // chip / stat cards
export const CARD_TO = "rgba(24,19,32,0.8)";
export const SWEEP = "rgba(255,240,210,0.55)"; // the wordmark's light sweep
export const CHIP_BG = "rgba(14,11,19,0.82)"; // tool chip
export const CHIP_LABEL = "rgba(246,238,223,0.55)";
export const PHONE_FRAME = "linear-gradient(145deg, #4a4552 0%, #1b1820 18%, #0e0c12 50%, #26222c 82%, #55505d 100%)";
export const PHONE_SCREEN = "#000";
export const PHONE_CAMERA = "radial-gradient(circle at 35% 35%, #2b3140 0%, #050507 60%)";
export const PHONE_BUTTON = "linear-gradient(90deg, #2a2630, #5b5663)";

/** The captured clips' aspect (w, h): film.json clipAspect. */
export const CLIP_ASPECT: [number, number] = [16, 9];

export { ACCENT, FPS, BPM, BAR, BEAT, bar } from "./consts";
export type { SceneId } from "./consts";
// the app's own type: Roboto (DESIGN.md)
export const { fontFamily: DISPLAY } = loadRoboto("normal", { weights: ["400", "500", "700", "900"], subsets: ["latin"] });
export const { fontFamily: DISPLAY_ITALIC } = loadRoboto("italic", { weights: ["400", "700"], subsets: ["latin"] });
export const BODY = DISPLAY;
export const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });
