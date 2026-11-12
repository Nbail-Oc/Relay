import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("dev startup reuses an already responding PAYPAL app", { timeout: 10_000 }, async () => {
  const app = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("PayPal Copilot · voice first");
  });
  const occupiedOpenCodePort = createServer();
  const appPort = await listen(app);
  const openCodePort = await listen(occupiedOpenCodePort);
  const env = { ...process.env, PORT: String(appPort), OPENCODE_PORT: String(openCodePort) };
  delete env.OPENCODE_BASE_URL;

  try {
    const child = spawn(process.execPath, ["scripts/dev.mjs", "dev"], { cwd: process.cwd(), env, windowsHide: true });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    assert.equal(code, 0, output);
    assert.match(output, /PAYPAL is already running/i);
  } finally {
    await close(app);
    await close(occupiedOpenCodePort);
  }
});
