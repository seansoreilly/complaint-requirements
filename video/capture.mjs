/**
 * Drives the running Complaint Concierge app through the walkthrough in
 * docs/demo-script.md and saves a numbered screenshot at each beat.
 *
 * The app must already be running (npm run dev) at BASE_URL. The offline
 * extractor (mock mode) covers every step, so no API key is needed and the
 * shots are reproducible.
 *
 *   node capture.mjs
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Must be localhost, not 127.0.0.1: next dev serves the page from either, but
// only hydrates on the origin it was started with. On the wrong origin you get
// static SSR HTML — clicks do nothing and Send stays disabled. Chrome is given
// a resolver rule below so localhost reaches the IPv6-bound server.
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "public", "shots");

let index = 0;

async function main() {
  await mkdir(SHOTS, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    // MAP localhost 127.0.0.1 so the localhost origin resolves to the running
    // server under WSL2, where Chrome's own lookup is refused.
    args: ["--no-sandbox", "--host-resolver-rules=MAP localhost 127.0.0.1"],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  /** Screenshot the viewport as the next numbered shot. */
  const shot = async (name) => {
    index += 1;
    const file = join(SHOTS, `${String(index).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: file });
    console.log(`  → ${file.replace(SHOTS, "shots")}`);
  };

  /**
   * Type into the chat box and Send, then wait for the reply to land.
   * The textarea is a controlled React input, so the text has to arrive as
   * real keystrokes — page.fill() leaves Send disabled.
   */
  const say = async (text) => {
    await type(page, text);
    await send(page);
    await waitForReply(page);
  };

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForHydration(page);

  console.log("1. Empty state");
  await shot("empty");

  console.log("2. One paragraph fills the form");
  // The same sentence the "Paste the demo story" shortcut inserts; typed out
  // so the shot shows it sitting in the composer.
  await type(
    page,
    "I emailed AustralianSuper on 3 Sept about my insurance being cancelled " +
      "without warning and they still haven't replied to me about it at all.",
  );
  await shot("story-typed");
  await send(page);
  await waitForReply(page);
  await page.waitForTimeout(900);
  await shot("form-filled");

  // The member number is resolved in code from data/firms.json, never by the
  // model — worth its own shot because it is the point of that constraint.
  await scrollFormTo(page, 0);
  await shot("member-number");

  console.log("3. The drafted complaint card");
  await shot("draft-card");
  const useThis = page.getByRole("button", { name: "Use this" });
  if (await useThis.count()) {
    await useThis.first().click();
    await page.waitForTimeout(900);
  }
  await shot("draft-approved");

  console.log("4. 'I don't know' is a real answer");
  await say("I don't have an account number");
  await page.waitForTimeout(700);
  await shot("dont-know");

  // The mock brain asks about an open AFCA complaint next; answering it keeps
  // the conversation moving rather than looping on the same question.
  await say("No, this is the first time");
  await page.waitForTimeout(600);

  console.log("5. Coaching a vague wish into an outcome");
  const seeking = page.getByRole("button", { name: /Seeking compensation/i });
  if (await seeking.count()) {
    await seeking.first().click();
    await page.waitForTimeout(400);
    await say("not sure");
    await page.waitForTimeout(600);
  }
  await say("I just want it fixed");
  await page.waitForTimeout(900);
  await shot("outcome-draft");

  console.log("6. Skip and come back");
  await say("I'd rather not say right now");
  await page.waitForTimeout(700);
  await shot("skipped");

  const dob = page.getByRole("button", { name: /Date of birth/i });
  if (await dob.count()) {
    await dob.first().click();
    await page.waitForTimeout(500);
    await shot("field-focus");
  }

  console.log("7. Review and export");
  await page.getByRole("button", { name: /^Review/ }).first().click();
  await page.waitForTimeout(1000);
  // The review panel renders above the form in the same scrolling column.
  await scrollFormTo(page, 0);
  await shot("review");
  await scrollFormTo(page, 620);
  await shot("review-export");

  await browser.close();
  console.log(`\nCaptured ${index} shots into public/shots/`);
}

/** Type into the chat composer as real keystrokes, so React's onChange fires. */
async function type(page, text) {
  const box = page.getByPlaceholder("Tell me what happened…");
  await box.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type(text, { delay: 6 });
  await page.waitForTimeout(250);
}

/** Block until React has attached, so clicks and typing actually register. */
async function waitForHydration(page) {
  await page.waitForFunction(
    () =>
      Object.keys(document.querySelector("textarea") ?? {}).some((key) => key.startsWith("__reactFiber")),
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);
}

/** Click Send once it is enabled. */
async function send(page) {
  const button = page.getByRole("button", { name: "Send", exact: true });
  await button.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Send");
      return b instanceof HTMLButtonElement && !b.disabled;
    },
    { timeout: 10000 },
  );
  await button.click();
}

/** Wait for the pending turn to finish: Send re-enables once the reply lands. */
async function waitForReply(page) {
  // The turn is in flight while the app has a request open; settle on the
  // network going quiet rather than on button state, which flickers.
  await page.waitForTimeout(400);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1400);
}

/** Scroll the right-hand form column, which is the page's scrolling region. */
async function scrollFormTo(page, top) {
  await page.evaluate((y) => {
    const panes = [...document.querySelectorAll("*")].filter(
      (el) => el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 300,
    );
    const pane = panes[panes.length - 1];
    if (pane) pane.scrollTop = y;
    else window.scrollTo(0, y);
  }, top);
  await page.waitForTimeout(500);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
