export const CHAT_MODES = ["general", "invoice", "shopping", "refund"];
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_ATTACHMENT_CHARS = 20_000;

export function canSafelyReplayUncertainAction(kind, ageMs) {
  const windowMs = kind === "refund" ? 40 * 24 * 60 * 60 * 1000 : 5 * 60 * 60 * 1000;
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= windowMs;
}

export function validateChatMode(mode) {
  return CHAT_MODES.includes(mode);
}

export function validateAttachment(file) {
  const name = typeof file?.name === "string" ? file.name : "";
  const extension = name.toLowerCase().slice(name.lastIndexOf("."));
  const mime = file?.type || "";
  if (!([".md", ".txt"].includes(extension) && ["", "text/plain", "text/markdown", "text/x-markdown"].includes(mime))) {
    return { ok: false, error: "Attach a Markdown (.md) or text (.txt) file." };
  }
  if (!Number.isInteger(file.size) || file.size < 1 || file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "Attachment must be between 1 byte and 1 MiB." };
  }
  return { ok: true, extension };
}

function cents(value) {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid amount.");
  const text = String(value ?? "").trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new Error("Amounts must be positive USD values with at most two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
  return amount;
}

function dollars(amount) {
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

export function validateInvoice(input) {
  const email = String(input?.recipientEmail ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid recipient email is required.");
  if ((input?.currency ?? "USD") !== "USD") throw new Error("Only USD invoices are supported.");
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) throw new Error("Invoice needs 1 to 50 line items.");
  const items = input.items.map((item) => {
    const name = String(item?.name ?? "").trim();
    const quantity = Number(item?.quantity);
    if (!name || name.length > 200 || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error("Invoice line item is invalid.");
    const unitCents = cents(item.unitAmount);
    return { name, quantity, unitAmount: dollars(unitCents), lineCents: unitCents * quantity };
  });
  const totalCents = items.reduce((total, item) => total + item.lineCents, 0);
  if (!Number.isSafeInteger(totalCents)) throw new Error("Invoice total is too large.");
  return { recipientEmail: email, currency: "USD", items, total: dollars(totalCents), totalCents };
}

export function refundableAmount(captured, refunds = []) {
  const total = cents(captured);
  const refunded = refunds.reduce((sum, amount) => sum + cents(amount), 0);
  if (refunded > total) throw new Error("Recorded refunds exceed captured amount.");
  return dollars(total - refunded);
}

export function validateRefundAmount(requested, remaining) {
  const amount = cents(requested);
  if (amount > cents(remaining)) throw new Error("Refund amount exceeds remaining captured balance.");
  return dollars(amount);
}

export function truncateAttachmentText(text) {
  return String(text ?? "").slice(0, MAX_ATTACHMENT_CHARS);
}
