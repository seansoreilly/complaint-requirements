/**
 * Recomputes each beat's duration from the measured narration and rewrites
 * scenes.ts, so the video always totals exactly two minutes.
 *
 * Every clip gets PAD seconds of breathing room, then the remaining slack is
 * shared out in proportion to how much there is to look at in that shot.
 *
 *   node retime.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BEATS } from "./script.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// A target, not a promise: if the narration is shorter than this, the video is
// shorter, because padding beats out to a round number is what makes a short
// explainer drag. TOTAL is the ceiling, and MAX_HEADROOM caps the silence.
const TOTAL = 60;
const PAD = 0.9;
/** Most slack any one beat may carry beyond its narration, in seconds. */
const MAX_HEADROOM = 1.8;

// Relative share of the leftover time. The payoff shot — the form filled in —
// earns the most, because it is the one thing the video is about.
const WEIGHT = {
  "01-empty": 1.0,
  "02-story-typed": 1.0,
  "03-form-filled": 1.6,
};

const clips = JSON.parse(readFileSync(join(HERE, "src", "durations.json"), "utf8"));
const beats = BEATS.filter((beat) => beat.shot);

const title = round(clips.title + 1.9);
const outro = round(clips.outro + 2.4);

const base = Object.fromEntries(beats.map((b) => [b.id, clips[b.id] + PAD]));
const used = Object.values(base).reduce((a, v) => a + v, 0);
const slack = TOTAL - title - outro - used;
if (slack < 0) throw new Error(`Narration overruns by ${(-slack).toFixed(1)}s. Cut words.`);

// Share the slack by weight, but never let a beat sit further past its
// narration than MAX_HEADROOM — beyond that it stops reading as a pause and
// starts reading as dead air. Leftover slack is simply not used, so the video
// comes in under TOTAL rather than padded out to it.
const weights = beats.reduce((sum, b) => sum + WEIGHT[b.id], 0);
const seconds = {};
for (const beat of beats) {
  const share = (slack * WEIGHT[beat.id]) / weights;
  const capped = Math.min(PAD + share, MAX_HEADROOM);
  seconds[beat.id] = round(clips[beat.id] + capped);
}

let source = readFileSync(join(HERE, "src", "scenes.ts"), "utf8");
source = source.replace(/export const TITLE_SECONDS = [\d.]+;/, `export const TITLE_SECONDS = ${title};`);
source = source.replace(/export const OUTRO_SECONDS = [\d.]+;/, `export const OUTRO_SECONDS = ${outro};`);
for (const beat of beats) {
  const pattern = new RegExp(`(voice: "${beat.id}",[\\s\\S]*?seconds: )[\\d.]+`);
  source = source.replace(pattern, `$1${seconds[beat.id]}`);
}
// The runtime follows the narration, so write it rather than assume TOTAL.
const total = round(title + outro + sum(seconds));
source = source.replace(/export const TOTAL_SECONDS = [\d.]+;/, `export const TOTAL_SECONDS = ${total};`);
writeFileSync(join(HERE, "src", "scenes.ts"), source);

console.log(`title ${title}s   outro ${outro}s   slack available ${slack.toFixed(1)}s`);
for (const beat of beats) {
  const head = seconds[beat.id] - clips[beat.id];
  console.log(
    `  ${beat.id.padEnd(18)} vo=${clips[beat.id].toFixed(2)}  scene=${seconds[beat.id].toFixed(1)}  headroom=${head.toFixed(2)}`,
  );
}
console.log(`TOTAL ${(title + outro + sum(seconds)).toFixed(2)}s`);

function sum(object) {
  return Object.values(object).reduce((a, v) => a + v, 0);
}
function round(value) {
  return Number(value.toFixed(1));
}
