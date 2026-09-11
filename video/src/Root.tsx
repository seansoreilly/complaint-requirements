import React from "react";
import { Composition } from "remotion";
import { Explainer } from "./Explainer";
import { FPS, OUTRO_SECONDS, SCENES, TITLE_SECONDS, TOTAL_SECONDS } from "./scenes";

const scenesSeconds = SCENES.reduce((total, scene) => total + scene.seconds, 0);
const storyboardSeconds = TITLE_SECONDS + scenesSeconds + OUTRO_SECONDS;

// The brief is a two-minute video, so the storyboard has to add up to exactly
// that. Failing loudly here beats shipping a 113-second file.
if (storyboardSeconds !== TOTAL_SECONDS) {
  throw new Error(
    `Storyboard is ${storyboardSeconds}s but must be ${TOTAL_SECONDS}s ` +
      `(title ${TITLE_SECONDS} + scenes ${scenesSeconds} + outro ${OUTRO_SECONDS}).`,
  );
}

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Explainer"
    component={Explainer}
    durationInFrames={TOTAL_SECONDS * FPS}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
