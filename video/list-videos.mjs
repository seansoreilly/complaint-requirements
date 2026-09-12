/**
 * Lists recent videos on the channel, including unlisted and private ones,
 * so an upload can be confirmed without hunting through YouTube Studio.
 *
 *   node list-videos.mjs
 *
 * Read-only: it never uploads or changes anything. It asks for its own consent
 * (youtube.readonly) and caches that separately from the upload token, so
 * running it cannot disturb an upload in progress.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CLIENT_SECRET = join(homedir(), ".config", "gws", "client_secret.json");
const TOKEN_FILE = join(homedir(), ".config", "gws", "youtube_readonly_token.json");
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

async function main() {
  const config = JSON.parse(readFileSync(CLIENT_SECRET, "utf8"));
  const client = config.installed ?? config.web;
  const token = await accessToken(client);

  const channels = await get(
    "https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true",
    token,
  );
  if (channels.error) throw new Error(JSON.stringify(channels.error, null, 2));

  const channel = channels.items?.[0];
  if (!channel) throw new Error("This Google account has no YouTube channel.");
  console.log(`Channel: ${channel.snippet.title}\n`);

  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  const items = await get(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=10&playlistId=${uploads}`,
    token,
  );
  const ids = (items.items ?? []).map((item) => item.contentDetails.videoId);
  if (ids.length === 0) {
    console.log("No videos on this channel at all.");
    return;
  }

  const videos = await get(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,contentDetails,processingDetails&id=${ids.join(",")}`,
    token,
  );
  for (const video of videos.items ?? []) {
    console.log(`${video.snippet.title}`);
    console.log(`  privacy:    ${video.status.privacyStatus}`);
    console.log(`  upload:     ${video.status.uploadStatus}`);
    console.log(`  processing: ${video.processingDetails?.processingStatus ?? "n/a"}`);
    console.log(`  duration:   ${video.contentDetails?.duration}`);
    console.log(`  published:  ${video.snippet.publishedAt}`);
    console.log(`  link:       https://youtu.be/${video.id}\n`);
  }
}

async function accessToken(client) {
  if (existsSync(TOKEN_FILE)) {
    const saved = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    const refreshed = await post("https://oauth2.googleapis.com/token", {
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: saved.refresh_token,
      grant_type: "refresh_token",
    });
    if (refreshed.access_token) return refreshed.access_token;
  }

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

  console.log("Approve read-only access so this can list your videos.");
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
  }
  return token.access_token;
}

function listen() {
  return new Promise((resolveListen) => {
    let settle;
    const codePromise = new Promise((r) => {
      settle = r;
    });
    const server = createServer((request, response) => {
      const code = new URL(request.url, "http://localhost").searchParams.get("code");
      response.end(code ? "Thanks — you can close this tab." : "No code in the redirect.");
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

async function get(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return response.json();
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
  console.error(error.message);
  process.exit(1);
});
