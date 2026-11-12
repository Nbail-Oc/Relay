import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const host = "127.0.0.1";
const nextMode = process.argv[2] === "start" ? "start" : "dev";
const appPort = Number(process.env.PORT || 3000);
const appUrl = `http://${host}:${appPort}`;
const port = Number(process.env.OPENCODE_PORT || 4096);
const baseUrl = process.env.OPENCODE_BASE_URL || `http://${host}:${port}`;
const username = "opencode";
const password = process.env.OPENCODE_SERVER_PASSWORD || randomBytes(32).toString("hex");
const bridgeSecret = process.env.OPENCODE_BRIDGE_SECRET || randomBytes(32).toString("hex");
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const opencodeBin = process.platform === "win32"
  ? path.join(process.env.APPDATA || "", "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe")
  : "opencode";
let openCodeProcess;
let nextProcess;
let ownsOpenCode = false;

async function healthy() {
  for (const endpoint of ["/api/global/health", "/api/provider"]) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(800) });
      if (response.ok && response.headers.get("content-type")?.includes("application/json")) return true;
    } catch {}
  }
  return false;
}

async function appAlreadyRunning() {
  try {
    const response = await fetch(appUrl, { signal: AbortSignal.timeout(800) });
    return response.ok && (await response.text()).includes("PayPal Copilot");
  } catch {
    return false;
  }
}

async function waitForOpenCode() {
  for (let i = 0; i < 60; i += 1) {
    if (await healthy()) return;
    if (openCodeProcess?.exitCode !== null && openCodeProcess?.exitCode !== undefined) throw new Error(`OpenCode exited with code ${openCodeProcess.exitCode}.`);
    await delay(250);
  }
  throw new Error(`OpenCode did not become ready at ${baseUrl}.`);
}

function stop(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  if (process.platform === "win32" && child.pid) {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      killer.once("error", resolve); killer.once("exit", resolve);
    });
  }
  return new Promise((resolve) => { child.once("exit", resolve); child.kill("SIGTERM"); });
}

async function shutdown(code = 0) {
  await stop(nextProcess);
  if (ownsOpenCode) await stop(openCodeProcess);
  process.exitCode = code;
}

try {
  if (await appAlreadyRunning()) {
    console.log(`PAYPAL is already running at ${appUrl}.`);
    process.exit(0);
  }

  const existing = await healthy();
  if (!existing) {
    if (process.platform === "win32" && !existsSync(opencodeBin)) throw new Error("OpenCode CLI executable was not found. Install OpenCode or set OPENCODE_BIN.");
    openCodeProcess = spawn(opencodeBin, ["serve", "--hostname", host, "--port", String(port)], {
      stdio: "inherit", windowsHide: true, shell: false,
      env: { ...process.env, OPENCODE_SERVER_USERNAME: username, OPENCODE_SERVER_PASSWORD: password },
    });
    ownsOpenCode = true;
    openCodeProcess.once("error", (error) => console.error(`Could not start OpenCode: ${error.message}`));
    await waitForOpenCode();
  }

  nextProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", nextMode, "--port", String(appPort)], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, OPENCODE_BASE_URL: baseUrl, OPENCODE_SERVER_USERNAME: username, OPENCODE_SERVER_PASSWORD: password, OPENCODE_BRIDGE_SECRET: bridgeSecret, PAYPAL_APP_URL: `http://127.0.0.1:${appPort}` },
  });
  nextProcess.once("error", (error) => { console.error(`Could not start Next.js: ${error.message}`); void shutdown(1); });
  nextProcess.once("exit", (code) => { void shutdown(code ?? 0); });
  process.once("SIGINT", () => void shutdown(0));
  process.once("SIGTERM", () => void shutdown(0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (ownsOpenCode) await stop(openCodeProcess);
  process.exitCode = 1;
}
