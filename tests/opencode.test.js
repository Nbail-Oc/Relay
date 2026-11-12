import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOpenCodeMessages } from "../src/lib/opencode.js";

test("OpenCode transcript becomes ordered app messages with completion state", () => {
  const messages = normalizeOpenCodeMessages([
    { info: { id: "assistant-1", role: "assistant", time: { created: 2, completed: 3 } }, parts: [{ type: "text", text: "Hello" }] },
    { info: { id: "user-1", role: "user", time: { created: 1 } }, parts: [{ type: "text", text: "Hi" }] },
    { info: { id: "tool-1", role: "tool", time: { created: 2 } }, parts: [] },
  ]);
  assert.deepEqual(messages.map(({ id, role, text, completed }) => ({ id, role, text, completed })), [
    { id: "user-1", role: "user", text: "Hi", completed: false },
    { id: "assistant-1", role: "assistant", text: "Hello", completed: true },
  ]);
});

test("OpenCode 2.x message shapes normalize user text and finished assistant content", () => {
  const messages = normalizeOpenCodeMessages([
    { id: "assistant-2", type: "assistant", time: { created: 20 }, finish: "stop", content: [{ type: "text", text: "Draft is ready." }] },
    { id: "user-2", type: "user", time: { created: 10 }, text: "Draft an invoice." },
  ]);
  assert.deepEqual(messages.map(({ role, text, completed }) => ({ role, text, completed })), [
    { role: "user", text: "Draft an invoice.", completed: false },
    { role: "assistant", text: "Draft is ready.", completed: true },
  ]);
});
