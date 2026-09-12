/**
 * Parses SCRIPT.md — the editable source of truth for the video's words.
 *
 * SCRIPT.md is what a non-technical reviewer edits, so nothing here is
 * hand-copied into the code: voice.mjs takes its narration from this, and
 * scenes.ts takes its captions from it. Edit the markdown, rebuild, done.
 *
 * Each beat in the markdown looks like:
 *
 *   ## 3 — One sentence, eight answers
 *
 *   **Narration:**
 *   > line one
 *   > line two
 *
 *   **On screen:**
 *   - Title: `One sentence, eight answers`
 *   - Body: `The firm, the date, ...`
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Beats in video order, mapping each markdown heading to the clip id and the
 * screenshot it plays over. Headings are matched by their leading number, so
 * the prose after the em dash can be retitled freely.
 */
export const BEATS = [
  { heading: "Title card", id: "title", shot: null },
  { heading: "1", id: "01-empty", shot: "01-empty.png" },
  { heading: "2", id: "02-story-typed", shot: "02-story-typed.png" },
  { heading: "3", id: "03-form-filled", shot: "03-form-filled.png" },
  { heading: "Outro card", id: "outro", shot: null },
];

/** Every beat's narration and on-screen text, keyed by clip id. */
export function readScript() {
  const markdown = readFileSync(join(HERE, "SCRIPT.md"), "utf8");
  const sections = splitSections(markdown);
  const script = {};

  for (const beat of BEATS) {
    const body = findSection(sections, beat.heading);
    if (body === undefined) throw new Error(`SCRIPT.md has no section for "${beat.heading}".`);

    const narration = blockquote(body);
    if (!narration) throw new Error(`SCRIPT.md: "${beat.heading}" has no narration.`);

    script[beat.id] = {
      ...beat,
      narration,
      title: field(body, "Title"),
      body: field(body, "Body"),
      eyebrow: field(body, "Eyebrow"),
      subtitle: field(body, "Subtitle"),
      headline: field(body, "Headline"),
      button: field(body, "Button"),
      footnote: field(body, "Footnote"),
    };
  }
  return script;
}

/** Split on "## " headings into [heading, body] pairs. */
function splitSections(markdown) {
  const parts = markdown.split(/^## /m).slice(1);
  return parts.map((part) => {
    const newline = part.indexOf("\n");
    return [part.slice(0, newline).trim(), part.slice(newline)];
  });
}

/** Match a section by exact heading, or by its leading number ("3 — ..."). */
function findSection(sections, heading) {
  const numeric = /^\d+$/.test(heading);
  const match = sections.find(([title]) =>
    numeric ? new RegExp(`^${heading}\\b`).test(title) : title === heading,
  );
  return match?.[1];
}

/** The "> ..." block under **Narration:**, joined into one line. */
function blockquote(section) {
  const match = section.match(/\*\*Narration:\*\*\s*\n((?:>.*\n?)+)/);
  if (!match) return null;
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A "- Label: `value`" line from the On screen list. */
function field(section, label) {
  const match = section.match(new RegExp(`^- ${label}:\\s*\`([^\`]*)\``, "m"));
  return match?.[1];
}
