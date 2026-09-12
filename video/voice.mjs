/**
 * Generates the voiceover with ElevenLabs and measures each clip.
 *
 * Writes public/voice/<id>.mp3 and src/durations.json, which the storyboard
 * asserts against so a beat can never be shorter than its narration.
 *
 *   ELEVENLABS_API_KEY=... node voice.mjs          # only missing clips
 *   ELEVENLABS_API_KEY=... node voice.mjs --force  # regenerate everything
 *   ELEVENLABS_API_KEY=... node voice.mjs title    # just these ids
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const VOICE_DIR = join(HERE, "public", "voice");

// Jess — Australian, professional tier. The app is an Australian financial
// complaints demo, so the accent is part of getting the tone right.
const VOICE_ID = "ys3XeJJA4ArWMhRpcX1D";
const MODEL_ID = "eleven_multilingual_v2";

/**
 * The narration. Deliberately terser than the on-screen captions — hearing
 * and reading the same sentence word for word sounds like dictation, and the
 * beats do not have room for the captions read aloud.
 *
 * Two spellings are deliberate: "A F C A" as separate letters, because
 * "Afca" is read aloud as "Africa"; and the member number as words, so it is
 * not read as a quantity. Both were verified by transcribing the output.
 */
const SCRIPT = [
  {
    id: "title",
    text: "This is Complaint Concierge. The complaint form is the schema, and the conversation is the interface.",
  },
  {
    id: "01-empty",
    text: "A complaint to A F C A runs to eight stages of questions. Most people give up partway. The form is still here on the right — but you never have to fill it in yourself.",
  },
  {
    id: "02-story-typed",
    text: "Instead, you just say what happened, in one sentence, in your own words.",
  },
  {
    id: "03-form-filled",
    text: "That one paragraph filled eight fields at once — the firm, the date, how they were contacted, the type of service, the product, and the issue. By hand, that is three separate stages of the form.",
  },
  {
    id: "05-draft-card",
    text: "It also drafts the hardest box for you. Tell us about your complaint is where most people abandon the form.",
  },
  {
    id: "06-draft-approved",
    text: "But the draft is held, not written. Edit any line, then approve it. Only then does the text reach the form. You decide what it says.",
  },
  {
    id: "07-dont-know",
    text: "I don't know is a real answer. No account number? Say so. The field is marked unknown, drops off the form, and is never asked again.",
  },
  {
    id: "09-skipped",
    text: "You can skip anything and come back. Every field is both something the assistant can ask about, and something you can type in yourself.",
  },
  {
    id: "11-review",
    text: "And the firm's details are never invented. Member number one oh six five seven came from a directory lookup in code — not from the model. An unrecognised firm gets an honest not in the directory instead.",
  },
  {
    id: "12-review-export",
    text: "At the end, review it, then take it with you — as plain text, as JSON, or printed.",
  },
  {
    id: "outro",
    text: "The model never owns the state. It proposes a patch; code validates it and decides what to ask next. Swap the schema, and the same engine runs a different form entirely.",
  },
];

async function main() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((argument) => !argument.startsWith("--"));

  await mkdir(VOICE_DIR, { recursive: true });

  const durations = {};
  let generated = 0;
  let characters = 0;

  for (const [index, line] of SCRIPT.entries()) {
    const file = join(VOICE_DIR, `${line.id}.mp3`);
    const wanted = only.length === 0 || only.includes(line.id);
    const exists = await access(file).then(
      () => true,
      () => false,
    );

    if (wanted && (force || !exists)) {
      // previous_text / next_text keep prosody continuous across the cuts.
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: line.text,
            model_id: MODEL_ID,
            previous_text: SCRIPT[index - 1]?.text,
            next_text: SCRIPT[index + 1]?.text,
            voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.0 },
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`${line.id}: ${response.status} ${await response.text()}`);
      }
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      generated += 1;
      characters += line.text.length;
      console.log(`  generated ${line.id} (${line.text.length} chars)`);
    }

    const present = await access(file).then(
      () => true,
      () => false,
    );
    if (present) durations[line.id] = Number(await measure(file));
  }

  // Only rewrite durations.json once every clip exists, so a partial run
  // cannot leave the storyboard asserting against a half-filled map.
  if (Object.keys(durations).length === SCRIPT.length) {
    await writeFile(join(HERE, "src", "durations.json"), `${JSON.stringify(durations, null, 2)}\n`);
  } else {
    console.log(`(${Object.keys(durations).length}/${SCRIPT.length} clips present; durations.json not written)`);
  }

  const total = Object.values(durations).reduce((sum, value) => sum + value, 0);
  console.log(`\ngenerated ${generated} clip(s), ${characters} characters`);
  console.log(`speech total ${total.toFixed(2)}s across ${SCRIPT.length} clips`);
  for (const [id, seconds] of Object.entries(durations)) {
    console.log(`  ${id.padEnd(18)} ${seconds.toFixed(2)}s`);
  }
}

/** Clip length in seconds, via ffprobe. */
async function measure(file) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Number(Number(stdout.trim()).toFixed(3));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
