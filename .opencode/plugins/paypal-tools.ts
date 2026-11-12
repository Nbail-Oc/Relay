import { Plugin } from "@opencode/plugin";

const string = { type: "string" };
const money = { type: "string", pattern: "^[0-9]{1,8}(\\.[0-9]{1,2})?$" };

const definitions = [
  { name: "paypal_create_invoice_draft", toolName: "create_invoice_draft", description: "Create a USD invoice draft with exact recipient, items, and total for review. Never sends it.", properties: { recipient_email: string, items: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: false, required: ["name", "quantity", "unit_amount"], properties: { name: string, quantity: { type: "integer", minimum: 1, maximum: 999 }, unit_amount: money } } } }, required: ["recipient_email", "items"] },
  { name: "paypal_search_products", toolName: "search_products", description: "Search available Channel3 or demo catalog products. Returns actual product IDs and USD prices.", properties: { query: { type: "string", minLength: 1, maxLength: 500 } }, required: ["query"] },
  { name: "paypal_create_order", toolName: "create_order", description: "Create a sandbox order for an item returned by product search. Does not capture it.", properties: { product_id: string }, required: ["product_id"] },
  { name: "paypal_list_my_orders", toolName: "list_my_orders", description: "List this user's completed sandbox purchases eligible for refund.", properties: {}, required: [] },
  { name: "paypal_request_refund", toolName: "request_refund", description: "Prepare a full remaining or specified partial refund for an eligible app-created capture. Does not issue it.", properties: { order_action_id: string, amount: money }, required: ["order_action_id"] },
];

export default Plugin.define({
  id: "paypal-tools",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      for (const definition of definitions) editor.add({
        name: definition.name,
        description: definition.description,
        input: { type: "object", additionalProperties: false, properties: definition.properties, required: definition.required },
        options: { codemode: false },
        async execute(input, context) {
          const response = await fetch(`${process.env.PAYPAL_APP_URL || "http://127.0.0.1:3000"}/api/internal/opencode/tool`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-paypal-opencode-secret": process.env.OPENCODE_BRIDGE_SECRET || "" },
            body: JSON.stringify({ sessionId: context.sessionID, tool: definition.toolName, arguments: input }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "PAYPAL workflow tool failed.");
          return { content: JSON.stringify(result.result) };
        },
      });
    });
  },
});
