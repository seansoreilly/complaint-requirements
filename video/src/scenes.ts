/**
 * The storyboard: one entry per beat, in order.
 *
 * `shot` is a file in public/shots (captured by capture.mjs from the live app).
 * `seconds` is how long the beat is on screen, derived from the measured
 * narration by retime.mjs. The total is asserted to be exactly TOTAL_SECONDS in
 * Root.tsx, so edits here cannot silently change the video's length.
 *
 * The wording comes from SCRIPT.md — run `node recaption.mjs` after editing it
 * rather than retyping captions here.
 */
export type Scene = {
  readonly shot: string;
  /** Narration clip in public/voice, without the .mp3 extension. */
  readonly voice: string;
  readonly title: string;
  readonly body: string;
  readonly seconds: number;
  /** Normalised focal point the slow zoom pushes toward, 0–1 in each axis. */
  readonly focus?: readonly [number, number];
};

export const FPS = 30;
export const TOTAL_SECONDS = 40.3;

export const TITLE_SECONDS = 3.6;
export const OUTRO_SECONDS = 6.8;

export const SCENES: readonly Scene[] = [
  {
    shot: "01-empty.png",
    voice: "01-empty",
    title: "Eight stages of questions",
    body: "A lot to face when you're already frustrated.",
    seconds: 9.2,
    focus: [0.75, 0.4],
  },
  {
    shot: "02-story-typed.png",
    voice: "02-story-typed",
    title: "So just say what happened",
    body: "One sentence, in your own words.",
    seconds: 7.1,
    focus: [0.25, 0.9],
  },
  {
    shot: "03-form-filled.png",
    voice: "03-form-filled",
    title: "The form fills itself in",
    body: "One sentence answered eight questions at once.",
    seconds: 13.6,
    focus: [0.75, 0.5],
  },
];
