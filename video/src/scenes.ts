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

export const TITLE_SECONDS = 6.7;
export const OUTRO_SECONDS = 7.2;

export const SCENES: readonly Scene[] = [
  {
    shot: "01-empty.png",
    voice: "01-empty",
    title: "Eight stages of questions",
    body: "A lot to face when you're already frustrated.",
    seconds: 12.2,
    focus: [0.75, 0.4],
  },
  {
    shot: "02-story-typed.png",
    voice: "02-story-typed",
    title: "It listens first",
    body: "One sentence, in your own words.",
    seconds: 8.9,
    focus: [0.25, 0.9],
  },
  {
    shot: "03-form-filled.png",
    voice: "03-form-filled",
    title: "One sentence, eight answers",
    body: "The firm, the date, the service, the product, what went wrong.",
    seconds: 15.9,
    focus: [0.75, 0.55],
  },
  {
    shot: "05-draft-card.png",
    voice: "05-draft-card",
    title: "The part people stall on",
    body: "Written from what was already said.",
    seconds: 11.4,
    focus: [0.75, 0.3],
  },
  {
    shot: "06-draft-approved.png",
    voice: "06-draft-approved",
    title: "It waits to be approved",
    body: "Easy to fill in automatically. It asks first instead.",
    seconds: 12.8,
    focus: [0.3, 0.35],
  },
  {
    shot: "07-dont-know.png",
    voice: "07-dont-know",
    title: "\"I don't have one\" is an answer",
    body: "Marked, and not asked again.",
    seconds: 11.2,
    focus: [0.4, 0.45],
  },
  {
    shot: "09-skipped.png",
    voice: "09-skipped",
    title: "Leave anything for later",
    body: "Or type any answer in directly.",
    seconds: 10.5,
    focus: [0.75, 0.6],
  },
  {
    shot: "11-review.png",
    voice: "11-review",
    title: "The member number isn't guessed",
    body: "Looked up, not invented.",
    seconds: 14.8,
    focus: [0.78, 0.35],
  },
  {
    shot: "12-review-export.png",
    voice: "12-review-export",
    title: "Yours to check and keep",
    body: "Check it over, print it, take it to AFCA.",
    seconds: 8.4,
    focus: [0.72, 0.65],
  },
];
