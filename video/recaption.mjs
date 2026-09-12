/**
 * Rewrites the on-screen captions in scenes.ts from SCRIPT.md, so the markdown
 * stays the one place the video's words are edited.
 *
 *   node recaption.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BEATS, readScript } from "./script.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const script = readScript();
const file = join(HERE, "src", "scenes.ts");

let source = readFileSync(file, "utf8");
for (const beat of BEATS.filter((b) => b.shot)) {
  const entry = script[beat.id];
  source = replaceField(source, beat.id, "title", entry.title);
  source = replaceField(source, beat.id, "body", entry.body);
  console.log(`${beat.id}: ${entry.title} — ${entry.body}`);
}
writeFileSync(file, source);

/** Replace one field of the scene whose voice id matches. */
function replaceField(source, id, field, value) {
  const pattern = new RegExp(`(voice: "${id}",[\\s\\S]*?\\n    ${field}: )"(?:[^"\\\\]|\\\\.)*"`);
  if (!pattern.test(source)) throw new Error(`Could not find ${field} for ${id}`);
  return source.replace(pattern, `$1${JSON.stringify(value)}`);
}
