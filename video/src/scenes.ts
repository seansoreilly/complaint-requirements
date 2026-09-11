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
  readonly title: string;
  readonly body: string;
  readonly seconds: number;
  /** Normalised focal point the slow zoom pushes toward, 0–1 in each axis. */
  readonly focus?: readonly [number, number];
};

export const FPS = 30;
export const TOTAL_SECONDS = 120;

export const TITLE_SECONDS = 7;
export const OUTRO_SECONDS = 9;

export const SCENES: readonly Scene[] = [
  {
    shot: "01-empty.png",
    title: "A form nobody finishes",
    body: "The AFCA complaint form is eight stages of fields. Most people give up partway. Here the form is still on the right — but you never have to fill it in directly.",
    seconds: 11,
    focus: [0.75, 0.4],
  },
  {
    shot: "02-story-typed.png",
    title: "You just say what happened",
    body: "One sentence, in your own words: the firm, the date, what went wrong, and that nobody replied.",
    seconds: 10,
    focus: [0.25, 0.9],
  },
  {
    shot: "03-form-filled.png",
    title: "Eight fields, one sentence",
    body: "That paragraph filled the firm, the date, the contact method, the service type, the product and the issue — across three of the form's eight stages at once.",
    seconds: 14,
    focus: [0.75, 0.55],
  },
  {
    shot: "05-draft-card.png",
    title: "It writes the hardest box for you",
    body: "\"Tell us about your complaint\" is where people abandon the form. The assistant drafts it in your words — and the draft is held, not written.",
    seconds: 13,
    focus: [0.75, 0.3],
  },
  {
    shot: "06-draft-approved.png",
    title: "Nothing lands without approval",
    body: "Edit any line, then approve. Only then does the text reach the form. You are always the one who decides what it says.",
    seconds: 11,
    focus: [0.3, 0.35],
  },
  {
    shot: "07-dont-know.png",
    title: "\"I don't know\" is a real answer",
    body: "No account number? Say so. The field is recorded as unknown, disappears from the form, and is never asked again.",
    seconds: 11,
    focus: [0.4, 0.45],
  },
  {
    shot: "09-skipped.png",
    title: "Skip anything, come back later",
    body: "\"I'd rather not say right now\" moves the conversation on. Every field is both something the assistant can ask about and something you can type in yourself.",
    seconds: 11,
    focus: [0.75, 0.6],
  },
  {
    shot: "11-review.png",
    title: "The firm's details are never invented",
    body: "AFCA member number 10657 came from a directory lookup in code, not from the model. An unknown firm gets an honest \"not in the directory\" instead of a plausible-looking number.",
    seconds: 14,
    focus: [0.78, 0.35],
  },
  {
    shot: "12-review-export.png",
    title: "Review, then take it with you",
    body: "The summary mirrors the real form's final step. Copy it as plain text, download it as JSON, or print the form on its own.",
    seconds: 9,
    focus: [0.72, 0.65],
  },
];
