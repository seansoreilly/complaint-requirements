import React from "react";
import { Composition } from "remotion";
import { Explainer } from "./Explainer";
import { FPS, OUTRO_SECONDS, SCENES, TITLE_SECONDS, TOTAL_SECONDS } from "./scenes";
import durations from "./durations.json";

const scenesSeconds = SCENES.reduce((total, scene) => total + scene.seconds, 0);
const storyboardSeconds = TITLE_SECONDS + scenesSeconds + OUTRO_SECONDS;

// The brief is a two-minute video, so the storyboard has to add up to exactly
// that. Failing loudly here beats shipping a 113-second file. The tolerance is
// for float addition only — a tenth of a second would not survive it.
if (Math.abs(storyboardSeconds - TOTAL_SECONDS) > 0.001) {
  throw new Error(
    `Storyboard is ${storyboardSeconds.toFixed(2)}s but must be ${TOTAL_SECONDS}s ` +
      `(title ${TITLE_SECONDS} + scenes ${scenesSeconds.toFixed(2)} + outro ${OUTRO_SECONDS}).`,
  );
}

/**
 * Remotion truncates audio at the end of its Sequence without warning, so a
 * beat shorter than its narration would cut Jess off mid-word and nothing
 * would say so. Check every clip has room, plus a beat of silence to breathe.
 */
// Audio starts 0.25s in (0.45s title, 0.35s outro), so the clip needs that
// much plus a short tail inside the scene. retime.mjs caps the other end.
const MIN_HEADROOM = 0.7;
const clips: Record<string, number> = durations;

for (const [label, voice, seconds] of [
  ["title", "title", TITLE_SECONDS],
  ...SCENES.map((scene) => [scene.shot, scene.voice, scene.seconds] as const),
  ["outro", "outro", OUTRO_SECONDS],
] as ReadonlyArray<readonly [string, string, number]>) {
  const clip = clips[voice];
  if (clip === undefined) {
    throw new Error(`No narration measured for "${voice}". Run: node voice.mjs`);
  }
  if (seconds < clip + MIN_HEADROOM) {
    throw new Error(
      `Scene "${label}" is ${seconds}s but its narration runs ${clip.toFixed(2)}s. ` +
        `Give it at least ${(clip + MIN_HEADROOM).toFixed(1)}s, or cut words from voice.mjs.`,
    );
  }
}

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Explainer"
    component={Explainer}
    durationInFrames={Math.round(TOTAL_SECONDS * FPS)}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
