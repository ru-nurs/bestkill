import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.PORT || 3000);
const origin = `http://localhost:${port}`;
const seedPaths = [
  "/",
  "/store",
  "/balance",
  "/rules_public",
  "/news",
  "/bans",
  "/banlist",
  "/admins",
  "/users",
  "/support",
  "/forum",
  "/chat",
  "/stats",
  "/privacy-policy",
  "/processing-of-personal-data"
];

let server;

async function isServerRunning() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 700);
  try {
    const response = await fetch(origin + "/__mirror/status", { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureServer() {
  if (await isServerRunning()) {
    console.log(`Using running site at ${origin}`);
    return;
  }

  server = spawn(process.execPath, ["server.js"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port) }
  });

  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await delay(900);
}

async function fetchPage(path) {
  const response = await fetch(origin + path, { redirect: "manual" });
  await response.arrayBuffer();
  console.log(`${response.status} ${path}`);
}

try {
  await ensureServer();
  for (const path of seedPaths) {
    await fetchPage(path);
  }
  const status = await fetch(origin + "/__mirror/status").then((res) => res.text());
  console.log(status);
} finally {
  if (server) server.kill();
}
