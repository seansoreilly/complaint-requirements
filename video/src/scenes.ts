/**
 * The storyboard: one entry per beat, in order.
 *
 * `shot` is a file in public/shots (captured by capture.mjs from the live app).
 * `seconds` is how long the beat is on screen. The total is asserted to be
 * exactly TOTAL_SECONDS in Root.tsx, so edits here cannot silently change the
 * video's length.
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
export const TOTAL_SECONDS = 120;

export const TITLE_SECONDS = 8.5;
export const OUTRO_SECONDS = 13.9;

export const SCENES: readonly Scene[] = [
  {
    shot: "01-empty.png",
    voice: "01-empty",
    title: "A form nobody finishes",
    body: "Eight stages of questions. Most people give up partway.",
    seconds: 12.9,
    focus: [0.75, 0.4],
  },
  {
    shot: "02-story-typed.png",
    voice: "02-story-typed",
    title: "You just say what happened",
    body: "One sentence, in your own words.",
    seconds: 7.4,
    focus: [0.25, 0.9],
  },
  {
    shot: "03-form-filled.png",
    voice: "03-form-filled",
    title: "Eight fields, one sentence",
    body: "The firm, the date, the method, the service, the product, the issue — three stages at once.",
    seconds: 16.1,
    focus: [0.75, 0.55],
  },
  {
    shot: "05-draft-card.png",
    voice: "05-draft-card",
    title: "It writes the hardest box for you",
    body: "The box where people abandon the form, drafted in your words.",
    seconds: 8.4,
    focus: [0.75, 0.3],
  },
  {
    shot: "06-draft-approved.png",
    voice: "06-draft-approved",
    title: "Nothing lands without approval",
    body: "It reaches the form only when you approve it.",
    seconds: 10.8,
    focus: [0.3, 0.35],
  },
  {
    shot: "07-dont-know.png",
    voice: "07-dont-know",
    title: "\"I don't know\" is a real answer",
    body: "Marked unknown, dropped from the form, never asked again.",
    seconds: 10.7,
    focus: [0.4, 0.45],
  },
  {
    shot: "09-skipped.png",
    voice: "09-skipped",
    title: "Skip anything, come back later",
    body: "Every field is both a question it can ask and a box you can fill.",
    seconds: 9.4,
    focus: [0.75, 0.6],
  },
  {
    shot: "11-review.png",
    voice: "11-review",
    title: "The firm's details are never invented",
    body: "Member number 10657 — a directory lookup in code, not the model.",
    seconds: 14.4,
    focus: [0.78, 0.35],
  },
  {
    shot: "12-review-export.png",
    voice: "12-review-export",
    title: "Review, then take it with you",
    body: "Plain text, JSON, or print.",
    seconds: 7.5,
    focus: [0.72, 0.65],
  },
];
