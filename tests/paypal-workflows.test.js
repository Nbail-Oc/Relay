import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_MODES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_CHARS,
  canSafelyReplayUncertainAction,
  refundableAmount,
  validateAttachment,
  validateChatMode,
  validateInvoice,
} from "../src/lib/paypal-workflows.js";

test("only supported chat modes are accepted", () => {
  assert.deepEqual(CHAT_MODES, ["general", "invoice", "shopping", "refund"]);
  assert.equal(validateChatMode("shopping"), true);
  assert.equal(validateChatMode("paypal-admin"), false);
});

test("attachment policy accepts small markdown and text files only", () => {
  assert.equal(validateAttachment({ name: "quote.md", type: "text/markdown", size: 100 }).ok, true);
  assert.equal(validateAttachment({ name: "quote.pdf", type: "application/pdf", size: 100 }).ok, false);
  assert.equal(validateAttachment({ name: "quote.txt", type: "text/plain", size: MAX_ATTACHMENT_BYTES + 1 }).ok, false);
  assert.equal(MAX_ATTACHMENT_CHARS, 20_000);
});

test("invoice input is USD and totals use cents", () => {
  const invoice = validateInvoice({
    recipientEmail: "buyer@example.com",
    currency: "USD",
    items: [
      { name: "Consulting", quantity: 2, unitAmount: "25.10" },
      { name: "Setup", quantity: 1, unitAmount: "9.99" },
    ],
  });
  assert.equal(invoice.total, "60.19");
  assert.throws(() => validateInvoice({ recipientEmail: "buyer@example.com", currency: "INR", items: [{ name: "x", quantity: 1, unitAmount: "1.00" }] }), /USD/);
});

test("refund amount cannot exceed remaining captured balance", () => {
  assert.equal(refundableAmount("100.00", ["30.00", "10.00"]), "60.00");
  assert.throws(() => refundableAmount("100.00", ["100.01"]), /exceed/);
});

test("uncertain PayPal writes replay only within conservative idempotency windows", () => {
  assert.equal(canSafelyReplayUncertainAction("order_create", 5 * 60 * 60 * 1000), true);
  assert.equal(canSafelyReplayUncertainAction("order_create", 5 * 60 * 60 * 1000 + 1), false);
  assert.equal(canSafelyReplayUncertainAction("refund", 40 * 24 * 60 * 60 * 1000), true);
  assert.equal(canSafelyReplayUncertainAction("refund", 40 * 24 * 60 * 60 * 1000 + 1), false);
  assert.equal(canSafelyReplayUncertainAction("invoice_send", -1), false);
});
