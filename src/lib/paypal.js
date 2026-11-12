const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";
let tokenCache;

export class PayPalError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.details = details;
  }
}

async function accessToken(fetcher = fetch) {
  if (process.env.PAYPAL_ENV && process.env.PAYPAL_ENV !== "sandbox") {
    throw new Error("This increment supports PayPal sandbox only.");
  }
  const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: clientSecret } = process.env;
  if (!clientId || !clientSecret) throw new Error("Set PayPal sandbox client credentials in .env.local.");
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetcher(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new PayPalError(response.status, "PayPal sandbox authentication failed.", result);
  tokenCache = { value: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 300) * 1000 };
  return tokenCache.value;
}

export async function paypalRequest(path, { method = "GET", body, requestId, fetcher = fetch } = {}) {
  const token = await accessToken(fetcher);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" };
  if (requestId && method !== "GET") headers["PayPal-Request-Id"] = requestId;
  const response = await fetcher(`${PAYPAL_BASE}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(result.details) ? result.details.map((row) => row.description || row.issue).filter(Boolean).join("; ") : "";
    throw new PayPalError(response.status, detail || result.message || `PayPal returned ${response.status}.`, result);
  }
  return result;
}

export function createInvoiceDraft(input, requestId, fetcher) {
  const name = process.env.PAYPAL_INVOICER_NAME || "PayPal Copilot Demo";
  return paypalRequest("/v2/invoicing/invoices", { method: "POST", requestId, fetcher, body: {
    detail: { currency_code: "USD", payment_term: { term_type: "DUE_ON_RECEIPT" } },
    invoicer: { name: { given_name: name.slice(0, 140) } },
    primary_recipients: [{ billing_info: { email_address: input.recipientEmail } }],
    items: input.items.map(({ name: itemName, quantity, unitAmount }) => ({
      name: itemName, quantity: String(quantity), unit_amount: { currency_code: "USD", value: unitAmount },
    })),
  } });
}

export function sendInvoice(invoiceId, requestId, fetcher) {
  return paypalRequest(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`, { method: "POST", requestId, fetcher, body: {} });
}

export function getInvoice(invoiceId, fetcher) {
  return paypalRequest(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`, { fetcher });
}

export function createOrder(product, requestId, fetcher) {
  if (!product?.id || !product?.name || !/^\d{1,3}(\.\d{1,2})?$/.test(String(product.price)) || Number(product.price) <= 0 || Number(product.price) > 100 || product.currency && product.currency !== "USD") {
    throw new Error("Sandbox orders must be valid products priced at no more than USD 100.");
  }
  return paypalRequest("/v2/checkout/orders", { method: "POST", requestId, fetcher, body: {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: product.id, custom_id: product.id, description: product.name.slice(0, 127), amount: { currency_code: "USD", value: product.price } }],
    application_context: { brand_name: "PayPal Copilot Sandbox", user_action: "PAY_NOW", return_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000", cancel_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" },
  } });
}

export function getOrder(orderId, fetcher) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { fetcher });
}

export function captureOrder(orderId, requestId, fetcher) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", requestId, fetcher, body: {} });
}

export function getCapture(captureId, fetcher) {
  return paypalRequest(`/v2/payments/captures/${encodeURIComponent(captureId)}`, { fetcher });
}

export function refundCapture(captureId, amount, requestId, fetcher) {
  return paypalRequest(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: "POST", requestId, fetcher, body: amount ? { amount: { currency_code: "USD", value: amount } } : {} });
}
