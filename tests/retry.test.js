import test from "node:test";
import assert from "node:assert/strict";
import { isRetryableProviderError, withOneBackup } from "../src/lib/retry.js";

test("provider errors get one backup attempt", async () => {
  const tried = [];
  const result = await withOneBackup(["primary", "backup"], async (key) => {
    tried.push(key);
    if (key === "primary") throw Object.assign(new Error("empty completion"), { status: 502 });
    return "ok";
  });
  assert.equal(result, "ok");
  assert.deepEqual(tried, ["primary", "backup"]);
});

test("backup is bounded and final error is preserved", async () => {
  const tried = [];
  await assert.rejects(() => withOneBackup(["one", "two", "three"], async (key) => {
    tried.push(key);
    throw new Error(key);
  }), /two/);
  assert.deepEqual(tried, ["one", "two"]);
});

test("bad request and unsupported model errors do not retry backup key", async () => {
  const tried = [];
  await assert.rejects(() => withOneBackup(["primary", "backup"], async (key) => {
    tried.push(key);
    throw Object.assign(new Error("bad request"), { status: 404 });
  }), /bad request/);
  assert.deepEqual(tried, ["primary"]);
  assert.equal(isRetryableProviderError({ status: 429 }), true);
});
