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
import { BEATS, readScript } from "./script.mjs";

const run = promisify(execFile);
const SOURCE = readScript();
const HERE = dirname(fileURLToPath(import.meta.url));
const VOICE_DIR = join(HERE, "public", "voice");

// Jess — Australian, professional tier. The app is an Australian financial
// complaints demo, so the accent is part of getting the tone right.
const VOICE_ID = "ys3XeJJA4ArWMhRpcX1D";
const MODEL_ID = "eleven_multilingual_v2";

/**
 * The narration comes from SCRIPT.md, which is the editable source of truth —
 * nothing is retyped here, so an edit to the markdown is an edit to the video.
 *
 * Two spellings in that file are deliberate: "A F C A" as separate letters,
 * because "Afca" is read aloud as "Africa"; and numbers as words, so they are
 * not read as quantities. Both were verified by transcribing the output.
 */
const SCRIPT = BEATS.map((beat) => ({ id: beat.id, text: SOURCE[beat.id].narration }));

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
