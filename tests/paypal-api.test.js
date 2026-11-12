import test from "node:test";
import assert from "node:assert/strict";

test("sandbox order uses the sandbox host and PayPal request id", async () => {
  process.env.PAYPAL_CLIENT_ID = "sandbox-client";
  process.env.PAYPAL_CLIENT_SECRET = "sandbox-secret";
  process.env.PAYPAL_ENV = "sandbox";
  const { createOrder } = await import(`../src/lib/paypal.js?order-test=${Date.now()}`);
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-token", expires_in: 1 });
    return Response.json({ id: "ORDER-1", links: [{ rel: "approve", href: "https://sandbox.paypal.com/approve" }] });
  };
  const order = await createOrder({ id: "demo-lamp", name: "Desk lamp", price: "38.00" }, "stable-request-id", fetcher);
  assert.equal(order.id, "ORDER-1");
  assert.equal(calls[1].url, "https://api-m.sandbox.paypal.com/v2/checkout/orders");
  assert.equal(calls[1].options.headers["PayPal-Request-Id"], "stable-request-id");
  assert.equal(JSON.parse(calls[1].options.body).purchase_units[0].amount.currency_code, "USD");
});

test("PayPal order adapter rejects prices over the sandbox cap before a request", async () => {
  const { createOrder } = await import(`../src/lib/paypal.js?cap-test=${Date.now()}`);
  let called = false;
  assert.throws(() => createOrder({ id: "too-expensive", name: "Item", price: "100.01" }, "key", async () => { called = true; }), /USD 100/);
  assert.equal(called, false);
});
