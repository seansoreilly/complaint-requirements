/**
 * Uploads the explainer to YouTube as an unlisted video.
 *
 * Uses the OAuth client gws already has at ~/.config/gws/client_secret.json,
 * on the project where the YouTube Data API is enabled. The YouTube upload
 * scope is a separate consent from the Workspace ones, so the first run opens
 * a browser for you to approve it; the refresh token is then cached in
 * ~/.config/gws/youtube_token.json and later runs need no browser.
 *
 *   node upload.mjs [path/to/video.mp4]
 *
 * Nothing is published publicly: the video is created with privacyStatus
 * "unlisted", which means anyone with the link can view it but it does not
 * appear in search, on the channel page, or in feeds.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const CLIENT_SECRET = join(homedir(), ".config", "gws", "client_secret.json");
const TOKEN_FILE = join(homedir(), ".config", "gws", "youtube_token.json");
// Upload, plus readonly so the result can be verified afterwards.
const SCOPE = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

const VIDEO = resolve(process.argv[2] ?? join(homedir(), "Videos", "complaint-concierge-explainer.mp4"));

const METADATA = {
  snippet: {
    title: "Complaint Concierge — a chat that fills in a form",
    description: [
      "A two-minute walkthrough of Complaint Concierge, a demo that turns the AFCA",
      "complaint form into a conversation.",
      "",
      "One sentence fills eight fields across three stages. The assistant drafts the",
      "hardest box for you, but the draft is held until you approve it. \"I don't know\"",
      "is a real answer. The firm's AFCA member number is resolved from a directory in",
      "code — the model never invents it.",
      "",
      "The screenshots are captured by driving the real app, not mocked up.",
      "",
      "Demonstration only — not affiliated with, endorsed by, or connected to the",
      "Australian Financial Complaints Authority. Nothing is submitted anywhere and the",
      "firm directory is fabricated. To make a real complaint, go to afca.org.au.",
    ].join("\n"),
    categoryId: "28", // Science & Technology
  },
  status: {
    privacyStatus: "unlisted",
    selfDeclaredMadeForKids: false,
  },
};

async function main() {
  if (!existsSync(VIDEO)) throw new Error(`No such video: ${VIDEO}`);
  if (!existsSync(CLIENT_SECRET)) throw new Error(`No OAuth client at ${CLIENT_SECRET}`);

  const { size } = statSync(VIDEO);
  console.log(`Uploading ${VIDEO} (${(size / 1024 / 1024).toFixed(1)} MB) as UNLISTED\n`);

  const token = await accessToken();

  // Resumable upload: start a session, then send the bytes to the URL it returns.
  const start = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Length": String(size),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(METADATA),
    },
  );
  if (!start.ok) throw new Error(`Could not start upload: ${start.status} ${await start.text()}`);

  const session = start.headers.get("location");
  if (!session) throw new Error("No upload session URL returned.");

  const upload = await fetch(session, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size) },
    body: createReadStream(VIDEO),
    duplex: "half",
  });
  if (!upload.ok) throw new Error(`Upload failed: ${upload.status} ${await upload.text()}`);

  const video = await upload.json();
  console.log(`\nDone. Unlisted link:\n  https://youtu.be/${video.id}`);
  console.log(`Manage it:\n  https://studio.youtube.com/video/${video.id}/edit`);
}

/** A YouTube-scoped access token, reusing the cached refresh token if there is one. */
async function accessToken() {
  const config = JSON.parse(readFileSync(CLIENT_SECRET, "utf8"));
  const client = config.installed ?? config.web;

  if (existsSync(TOKEN_FILE)) {
    const saved = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    const refreshed = await post("https://oauth2.googleapis.com/token", {
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: saved.refresh_token,
      grant_type: "refresh_token",
    });
    if (refreshed.access_token) return refreshed.access_token;
    console.log("Saved authorisation no longer works; asking again.\n");
  }

  return await consent(client);
}

/** One-time browser consent, catching the redirect on a local port. */
async function consent(client) {
  const { server, port, codePromise } = await listen();
  const redirect = `http://localhost:${port}`;
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirect,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
    });

  console.log("This needs your approval once, for permission to upload to your channel.");
  console.log("Opening your browser. If it does not open, visit:\n");
  console.log(`  ${url}\n`);
  open(url);

  const code = await codePromise;
  server.close();

  const token = await post("https://oauth2.googleapis.com/token", {
    client_id: client.client_id,
    client_secret: client.client_secret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirect,
  });
  if (!token.access_token) throw new Error(`Authorisation failed: ${JSON.stringify(token)}`);

  if (token.refresh_token) {
    writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: token.refresh_token }, null, 2), {
      mode: 0o600,
    });
    console.log(`Saved, so this is not needed again: ${TOKEN_FILE}\n`);
  }
  return token.access_token;
}

/** Serve the OAuth redirect on a free port and resolve with the code. */
function listen() {
  return new Promise((resolveListen) => {
    let settle;
    const codePromise = new Promise((r) => {
      settle = r;
    });
    const server = createServer((request, response) => {
      const code = new URL(request.url, "http://localhost").searchParams.get("code");
      response.end(
        code ? "Thanks — that worked. You can close this tab." : "No code in the redirect.",
      );
      if (code) settle(code);
    });
    server.listen(0, "127.0.0.1", () => {
      resolveListen({ server, port: server.address().port, codePromise });
    });
  });
}

function open(url) {
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], { stdio: "ignore", detached: true }).unref();
}

async function post(url, form) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  return response.json();
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
