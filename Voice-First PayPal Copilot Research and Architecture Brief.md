# Voice-First PayPal Copilot: Research and Architecture Brief

Prepared Nov 11, 2026 for the PayPal AI Hackathon. Submission closes Nov 12, 2026, 12:00 pm PT (about 1:30 am IST on Nov 13). Official PayPal sources are marked ★; everything else is third party and should be verified before you rely on it.

## 1. Summary

- **Product:** one browser-based voice agent that acts as a PayPal copilot. Two modes under one voice: (a) business tasks (create and send invoices from attached files, check payments, refunds) and (b) a guided buying assistant (ask questions, show products on screen, buy with a PayPal sandbox order).
- **PayPal surface to use:** the ★ [Agent Toolkit](https://github.com/paypal/agent-toolkit/blob/main/README.md) (TypeScript, AI SDK adapter) for tool calls, ★ Orders v2 and Payments v2 for checkout and refunds, ★ Invoicing, and webhooks for payment events. PayPal’s ★ [MCP server](https://developer.paypal.com/ai-tools/mcp-server.md) is the alternative route to the same tools.
- **Architecture:** a Talker–Reasoner design. A fast LLM speaks (STT, Talker LLM, TTS) while a stronger tool-calling Reasoner listens to the same conversation, decides on actions, and writes to a shared state that the Talker is only allowed to speak from. The user hears one agent.
- **Key findings that change the plan:**
  1. A buyer must approve a PayPal order in PayPal’s checkout before funds can be captured. The agent cannot silently charge a buyer, which gives you human-in-the-loop for free.
  2. PayPal’s agentic commerce services (Agent Ready, Store Sync) are merchant-side and require requesting access, so they are not usable in a one-day build.
  3. The MCP and toolkit tool lists differ across sources. Payouts, dispute offers and balances appear to be outside the official MCP tools, so verify with a live tools/list call before promising them.
  4. Product search should come from a catalog API (Channel3 is a hackathon sponsor). Real retailer checkout cannot run in the sandbox, so purchases settle as sandbox orders to your own test merchant.

## 2. Product definition

**One agent, three demo scenes.**

1. **Invoice from an attachment (business).** The user uploads a quote or notes, says “bill Acme for this, half upfront.” The Reasoner extracts line items, drafts the invoice, the UI shows a preview, the user confirms, and the invoice is sent.
2. **Buying assistant (consumer).** “I want shoes.” The agent asks two or three short questions (budget, color, size), shows options as cards while speaking, and the user says “get the second one.” The agent creates a PayPal order, the user approves in the PayPal popup, and the agent captures it.
3. **Refund (post-purchase).** “The shoes don’t fit, refund me.” The agent finds the order and capture, states the amount, asks for confirmation, and refunds through PayPal.

The common thread for judges: voice is the interface, PayPal actions are real sandbox calls, and every money action is gated by visible rules.

## 3. What PayPal gives us (research)

### 3.1 Three ways in

| Route | What it is | When to use |
| --- | --- | --- |
| ★ [Agent Toolkit](https://github.com/paypal/agent-toolkit/blob/main/README.md) | Open-source SDK (TypeScript and Python) that exposes PayPal APIs as function-calling tools for frameworks such as OpenAI, LangChain, Vercel AI SDK and MCP | Best default: one npm package, per-tool allowlist, works inside your own backend |
| ★ [MCP server](https://developer.paypal.com/ai-tools/mcp-server.md) | PayPal-hosted remote server (sandbox: mcp.sandbox.paypal.com, paths /sse and /http) or local server (@paypal/mcp) | Use if you want the “MCP” story, or to connect MCP-capable LLM APIs directly |
| ★ REST APIs | Orders v2, Payments v2, Invoicing v2, Webhooks, Payouts | Needed for anything the toolkit does not expose |

The toolkit’s configuration object lets you switch individual actions on or off per resource (for example invoices.create, invoices.send, orders.create, disputes.list). That is your first, code-level guardrail: only enabled tools are ever offered to the model ([README](https://github.com/paypal/agent-toolkit/blob/main/README.md)).

```typescript
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
const paypal = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET,
  configuration: { actions: {
    invoices: { create: true, list: true, send: true, sendReminder: true },
    orders: { create: true, get: true },
    disputes: { list: true, get: true },
  }},
});
```

PayPal also documents wiring its remote MCP server into Anthropic and OpenAI model APIs with a bearer token ([LLM integration guide](https://developer.paypal.com/ai-tools/build-with-llm.md)).

### 3.2 Tool inventory (and where sources disagree)

From the ★ [agent tools reference](https://developer.paypal.com/ai-tools/agent-tools), the ★ [toolkit README and PROMPTS.md](https://github.com/paypal/agent-toolkit/blob/main/PROMPTS.md) and the ★ [AI Toolkit MCP tools reference](https://github.com/paypal/ai-toolkit/blob/main/skills/paypal-best-practices/references/mcp-tools.md):

| Area | Tools |
| --- | --- |
| Invoices | create\_invoice, list\_invoices, get\_invoice, send\_invoice, send\_invoice\_reminder, cancel and QR-code generation (config also lists update, delete, recordPayment, recordRefund) |
| Orders and payments | create\_order, get\_order, pay\_order (capture an authorized order), create\_refund (capture\_id, optional amount and currency), get\_refund |
| Disputes | list\_disputes, get\_dispute (accept\_dispute\_claim appears in some lists) |
| Catalog and subscriptions | create/list/update product, create/list/show plans, subscriptions |
| Shipment | create and show tracking |
| Reporting | list\_transactions, merchant insights |

**Discrepancies to resolve on day one.** Google’s [ADK integration page](https://google.github.io/adk-docs/integrations/paypal) lists disputes.create; a third-party analysis ([Scalekit](https://www.scalekit.com/blog/paypal-mcp-vs-api)) says there are no payout tools, no dispute offers or escalation, no balances and no event triggers in PayPal’s MCP; Merge’s connector docs ([Merge](https://docs.merge.dev/merge-workforce/connectors/pay-pal.md)) list create\_payout and make\_dispute\_offer, but that is Merge’s own connector, not PayPal’s. **Action:** call tools/list on the real sandbox server or inspect the installed toolkit, and build only on what actually appears. Use REST directly for anything missing.

### 3.3 Authentication and environments

- Sandbox REST base: https://api-m.sandbox.paypal.com. Get a token with OAuth 2.0 client credentials (client ID and secret as HTTP Basic, grant\_type=client\_credentials) against /v1/oauth2/token ([Scalekit summary](https://www.scalekit.com/blog/paypal-mcp-vs-api)).
- Remote MCP sandbox: https://mcp.sandbox.paypal.com/sse or /http, either through PayPal login and consent or with an Authorization: Bearer header; production replaces the host with mcp.paypal.com ([MCP quickstart](https://developer.paypal.com/ai-tools/mcp-server.md)).
- The local MCP server (@paypal/mcp) reads a PAYPAL\_ACCESS\_TOKEN ([ADK page](https://google.github.io/adk-docs/integrations/paypal)).
- PayPal’s own docs warn that MCP clients can come with performance issues or other challenges initially, and neither server is labeled GA or beta ([Scalekit](https://www.scalekit.com/blog/paypal-mcp-vs-api)). For a live demo, prefer the in-process toolkit so a flaky remote connection cannot sink the video.

### 3.4 Orders v2 and Payments v2: the buying and refund flow

Source: ★ [What’s an order](https://developer.paypal.com/whats-an-order), ★ [Authorize and capture](https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture/), ★ [Orders/Payments v1 to v2 notes](https://developer.paypal.com/api/rest/integration/payments-api/v1-v2-migration).

1. **Create order** (POST /v2/checkout/orders) with intent CAPTURE (charge immediately after approval) or AUTHORIZE (hold funds, capture later). The response status is PAYER\_ACTION\_REQUIRED and includes an approve link.
2. **Buyer approves** in PayPal checkout (popup or redirect). Orders cannot be authorized until the status is APPROVED.
3. **Capture** (POST /v2/checkout/orders/{id}/capture) or **authorize** then capture later (POST /v2/payments/authorizations/{id}/capture). An authorization places a hold valid for 29 days, with a 3-day honor period recommended for capture.
4. **Refund** a captured payment through the Payments API (POST /v2/payments/captures/{id}/refund); this is what create\_refund wraps.

**Design consequences.**

- The approval step is your “confirm purchase” moment. The agent speaks “I’ve prepared the order for $54; approve it in the PayPal window,” the user approves, and the agent captures.
- AUTHORIZE then capture is a good fit for an agent: hold first, capture only when the user confirms, and void or let it lapse if they cancel.
- Store the capture ID returned by capture; refunds need it.

### 3.5 Invoicing

The Invoicing v2 endpoint list includes generate invoice number, create draft, show, list, send, send reminder, cancel, delete, search, record payment, generate QR code and record refund (see the [API reference mirror](https://jt97ovxf53.apifox.cn/api-103384697); confirm against the ★ official reference). The toolkit’s create\_invoice takes a recipient email and a list of items (name, quantity, unit\_price) per the ★ [tools reference](https://developer.paypal.com/ai-tools/agent-tools), and a draft must be sent separately with send\_invoice. That draft-then-send split is ideal for confirmation gating.

For the demo, send invoices to a sandbox personal account email so you can open the invoice and pay it as the buyer.

### 3.6 Webhooks

- Useful events: PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, CHECKOUT.ORDER.APPROVED, CUSTOMER.DISPUTE.CREATED, BILLING.SUBSCRIPTION.ACTIVATED ([Pinggy guide](https://pinggy.io/amp/blog/how_to_set_up_and_test_paypal_webhook_locally/), [Hookdeck](https://hookdeck.com/webhooks/skills/paypal-webhooks.md)). Check the official event list for invoice events such as paid and refunded.
- PayPal does not use a shared-secret HMAC; verify through the postback endpoint /v1/notifications/verify-webhook-signature or offline certificate verification ([Hookdeck](https://hookdeck.com/webhooks/skills/paypal-webhooks.md)).
- The Webhook Simulator’s mock events use a placeholder webhook ID and cannot be cryptographically verified; real sandbox transactions are needed for end-to-end tests ([Pinggy](https://pinggy.io/amp/blog/how_to_set_up_and_test_paypal_webhook_locally/)).
- Webhooks need a public URL; use a tunnel (Hookdeck CLI, Pinggy or ngrok) during development.
- **Fallback:** if the tunnel is a time sink, poll get\_order or get\_invoice every few seconds and feed the result to the same event bus. The demo looks identical.

### 3.7 PayPal’s agentic commerce services (context, not build material)

PayPal’s Agent Ready (accept payments from AI shopping assistants) and Store Sync (make merchant catalogs discoverable to AI platforms) are merchant-side services; PayPal’s docs state merchants must submit a form and request access ([docs.paypal.ai](https://docs.paypal.ai/limited-release/agentic-commerce/overview), [Digital Commerce 360](https://www.digitalcommerce360.com/2025/10/28/paypal-agentic-commerce-ai-driven-shopping-services/amp/)). They sit on protocols such as ACP and UCP, and PayPal is reported to support AP2 signed mandates ([Nevermined](https://nevermined.ai/blog/paypal-review)). **Use in the pitch:** your app is the consumer-side counterpart that Agent Ready and Store Sync make possible, built so merchants can later accept it without changes. Do not claim integration with them.

## 4. Product data for the buying mode

Channel3 (hackathon sponsor) provides a product search API with an x-api-key header; the free tier is 1,000 credits per month (about 1,000 searches), with text search, image search, an agentic search mode for longer shopping requests, filters for brand, category and attributes, and an MCP server ([search guide](https://docs.trychannel3.com/guides/make-a-search), [llms.txt](https://trychannel3.com/llms.txt)). It also exposes a UCP catalog endpoint ([UCP overview](https://docs.trychannel3.com/ucp)).

- **Use it for:** finding products, prices and images to show as cards while the agent speaks.
- **Be transparent:** buy links point to real retailers, which the PayPal sandbox cannot charge. The demo purchase is a sandbox order created by your backend for the selected item and paid to your test merchant. Say this in the README and video.
- **Fallback:** a hand-made JSON catalog of 20 products so the demo never depends on an external API.

## 5. System architecture

### 5.1 Why two agents

The Talker–Reasoner paper splits an agent into a fast Talker (System 1) that produces conversational replies and a slower Reasoner (System 2) that plans and calls tools; the Talker keeps responding while the Reasoner works, and a variable lets the Talker wait for the Reasoner when a turn needs deliberation ([Christakopoulou et al., 2024](https://arxiv.org/abs/2410.08328)). A 2026 SIGDIAL paper (Ping-Ponder) has a conversational agent and a planning agent run concurrently through a shared belief state, and reports a large cut in planning-phase latency against a synchronous baseline ([ACL Anthology](https://aclanthology.org/2026.sigdial-1.14.pdf)). It also notes the related chat-supervisor pattern in OpenAI’s Realtime Agents demos, where a heavier text model is called on reasoning-heavy turns. Your design combines both: concurrent by default, synchronous when money is involved.

### 5.2 Component diagram

```text
Browser (mobile + laptop)
  mic ──► WebSocket ──────────────────────────────┐
  speaker ◄── streamed TTS audio                   │
  UI: transcript, product cards, rules panel,      │
      approval card, action log, PayPal popup      │
                                                   ▼
                                        Voice gateway (Node)
   STT (streaming) ──► final transcript ──┬──► TALKER LLM (fast, no tools)
                                          │        │ speaks only from Shared State
                                          │        ▼
                                          │     TTS ──► audio to browser
                                          │
                                          └──► REASONER LLM (strong, tool calling)
                                                   │ reads transcript + state + files
                                                   │ writes directives and pending actions
                                                   ▼
                                         Shared State store
                                   (intent, plan, pending_actions,
                                    action_ledger, ui_cards, budget)
                                                   ▲
                          Policy gate  ◄───────────┤ every tool call passes here
                             │ allowlist, tiers, caps, confirm token
                             ▼
                   PayPal Agent Toolkit / REST (sandbox)
                   Channel3 search (or mock catalog)
                             ▲
                  Webhook endpoint or poller ──► event bus ──► Shared State
```

### 5.3 Making it feel like one agent

Your requirement: the Talker must only say what the Reasoner is actually doing. Enforce it structurally, not just with prompting.

1. **No tools for the Talker.** It cannot claim to have done anything on its own.
2. **Shared State is the only source of facts.** Each turn the Talker prompt is built from state: what the user wants, what is pending, what has completed. Rule: describe an action as done only if action\_ledger shows status done; otherwise use future or pending phrasing (“I’m preparing that invoice”).
3. **Reasoner emits directives**, not prose: for example {say: ‘ask for shoe size’, ui\_cards: \[…\], pending\_action: {tool, args, tier}}. The Talker turns directives into natural speech.
4. **Two latency modes.**
   - *Concurrent:* chit-chat, clarifying questions, product browsing. The Talker answers immediately; the Reasoner updates state in parallel.
   - *Synchronous (gated):* any turn that may trigger a money tool. The Talker says a short filler (“one moment, checking that order”), waits for the Reasoner’s directive, then speaks it.
5. **Override.** If the Reasoner’s result contradicts what the Talker already said, it sets state.correction and the gateway stops TTS (barge-in), and the Talker opens with the correction.
6. **Single voice and persona** for both; the user never sees two agents. Show only one avatar and one transcript.
7. **Event narration.** Webhook or poll results update state and trigger a Talker line such as “Priya just paid invoice 0042.”

### 5.4 Policy gate (the “rules” in agentic commerce)

This layer is deterministic code, not an LLM. The model can request a tool call, but the gate decides.

| Tier | Examples | Rule |
| --- | --- | --- |
| Read | list\_invoices, get\_invoice, get\_order, list\_disputes, get\_dispute, get\_refund, list\_transactions | Run immediately |
| Draft | create\_invoice (draft), create\_order (unapproved), create\_product | Run, then show a preview card |
| Confirm | send\_invoice, send\_invoice\_reminder, pay\_order (capture), create\_refund, cancel invoice, accept\_dispute\_claim | Blocked until the UI issues a confirmation token for that exact action, amount and recipient; the agent reads these back aloud |
| Blocked | Anything not enabled in the toolkit actions config; amounts above your configured cap; unknown recipients | Refuse and explain |

Third-party risk labels agree with this split: PolicyLayer rates create\_refund as Critical and treats send\_invoice, pay\_order, accept\_dispute\_claim and cancel\_sent\_invoice as financial or destructive ([PolicyLayer](https://policylayer.com/tools/paypal/create-refund.md)).

Additional rules to implement and show on screen: per-session spend cap, per-purchase cap, allowed currency, a budget set by voice at the start (“budget ₹2,000 equivalent”), idempotency for every write (reuse a request ID on retry; check the ★ docs for the PayPal-Request-Id header), an append-only action log with a plain-English reason for each call, and a visible “stop” button that cancels pending actions.

### 5.5 Voice pipeline notes

- **STT:** streaming speech-to-text with interim results (Deepgram Nova-3 is a reasonable choice; browser Web Speech API as a fallback). Send only final transcripts to the Reasoner, but let the Talker react to interim ones if latency matters.
- **Talker:** a small, fast model on a low-latency host, streaming tokens; start TTS on the first full sentence.
- **TTS:** any streaming TTS; keep browser speechSynthesis as an emergency fallback.
- **Reasoner:** any strong tool-calling model through the Vercel AI SDK, since PayPal ships an AI SDK adapter ([README](https://github.com/paypal/agent-toolkit/blob/main/README.md)). It also reads attached PDFs or images for the invoice scene.
- **Barge-in:** stop TTS when the user starts speaking; cancel any unspoken directive.
- **Text mode:** a typed input path that uses the same pipeline. Judges must be able to run the project without a microphone.
- **Latency targets (design goals, not measured facts):** Talker first audio under about 1.5 seconds; Reasoner directive under about 4 seconds; filler phrase whenever the gap exceeds about 2 seconds.

## 6. Flows

### 6.1 Invoice from an attachment

1. User attaches a PDF or image and says “invoice Acme for this, 50 percent upfront.”
2. Reasoner extracts client, line items and amounts; asks for a missing recipient email through the Talker.
3. Gate runs create\_invoice (draft tier); UI shows a preview card.
4. Talker: “Draft is ready for $450, due on receipt. Send it?” User: “yes.” UI issues confirmation token.
5. Gate runs send\_invoice. Webhook or poll later reports payment; Talker announces it.

### 6.2 Buying assistant

1. “I want shoes.” Reasoner sets intent, budget and constraints in state; Talker asks one question at a time.
2. Reasoner queries the catalog; UI shows three to four cards with a reasons line (“fits budget, white, returnable”).
3. “Get the second one.” Gate runs create\_order with intent AUTHORIZE; UI opens the PayPal approval popup.
4. After approval, Talker confirms the amount aloud; on “yes,” the gate runs capture; the receipt card appears with the capture ID.

### 6.3 Refund

1. “These don’t fit, refund me.” Reasoner finds the order and capture ID in the ledger.
2. Talker reads back item and amount; gate requires a confirmation token.
3. create\_refund runs; webhook or poll confirms; Talker: “Refunded $54, you’ll see it in your balance.”

## 7. Build plan (about 1.5 days left)

| Block | Hours | Output |
| --- | --- | --- |
| 0. Sandbox setup | 1 | Developer account, sandbox business and personal accounts, credentials, one invoice created through the toolkit; run tools/list and record the real tool names |
| 1. Reasoner and gate (text only) | 3 | Tool calling over the three flows, tiers, confirmation tokens, action log |
| 2. Voice pipeline | 3 | STT, Talker, TTS, shared state, filler and barge-in |
| 3. Buying mode | 2 | Catalog search, cards, order create, PayPal popup approval, capture |
| 4. Refund and events | 2 | create\_refund, webhook or poller, narration |
| 5. Packaging | 3 | README with run steps, MIT or Apache-2.0 license, text-mode demo, video under 3 minutes, submit at least 3 hours before the deadline |

Cut order if time runs out: webhooks (use polling), invoice file parsing (use pasted text), Channel3 (use mock catalog), barge-in. Never cut the policy gate or the text-mode fallback.

## 8. Risks and open questions

- **Sandbox from India.** Confirm today that a developer account works from India and that USD flows end to end; design the demo in USD (\[PayPal’s sandbox is global, but verify\]).
- **Tool list drift.** Verify exact tool names and parameters with a live tools/list before writing prompts.
- **Invoice sandbox quirks.** Invoices require a business account and a valid recipient email; test sending and paying in the first hours.
- **Webhook tunnel.** Needs a public URL; have the polling fallback ready.
- **Voice reliability.** Mic permissions and noise can break a live demo; record the video with a scripted run and keep text mode available.
- **Overclaiming.** Do not say the agent buys from real stores or integrates Agent Ready or Store Sync; say it settles sandbox orders and is designed to plug into them.
- **Judging fit.** Technological Implementation rewards non-trivial work, so the policy gate, shared state and event handling are your differentiators, not the tool wrapper.

## 9. Submission checklist (from the hackathon page)

- Meaningful PayPal and AI integration; working prototype.
- Public repository on GitHub, GitLab or Bitbucket with all source and a license file visible in the About section.
- Functional demo: clear run instructions in the repo or a hosted URL (a mockup or non-functional demo does not count).
- Text description of features, and which AI tools were used and how.
- Demo video under 3 minutes, public on YouTube, showing the project working on its intended device, with no third-party trademarks or copyrighted music.
- All materials in English. Judging criteria are equally weighted: technological implementation, design, potential impact, innovation, presentation. Prize categories include Best Use of Agentic Commerce and Best Use of PayPal + AI.

## 10. Sources

★ Official

- [PayPal MCP server quickstart](https://developer.paypal.com/ai-tools/mcp-server.md) and [docs.paypal.ai version](https://docs.paypal.ai/developer/tools/ai/mcp-quickstart.md)
- [PayPal agent tools reference](https://developer.paypal.com/ai-tools/agent-tools)
- [LLM integration guide](https://developer.paypal.com/ai-tools/build-with-llm.md)
- [Agent Toolkit README](https://github.com/paypal/agent-toolkit/blob/main/README.md), [PROMPTS.md](https://github.com/paypal/agent-toolkit/blob/main/PROMPTS.md), [AI Toolkit MCP tools reference](https://github.com/paypal/ai-toolkit/blob/main/skills/paypal-best-practices/references/mcp-tools.md)
- [What’s an order](https://developer.paypal.com/whats-an-order), [Authorize and capture](https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture/), [Orders and Payments v2 notes](https://developer.paypal.com/api/rest/integration/payments-api/v1-v2-migration)
- [Agentic commerce overview](https://docs.paypal.ai/limited-release/agentic-commerce/overview)

Third party

- [Scalekit: PayPal MCP vs API](https://www.scalekit.com/blog/paypal-mcp-vs-api), [PolicyLayer create\_refund](https://policylayer.com/tools/paypal/create-refund.md), [Google ADK PayPal page](https://google.github.io/adk-docs/integrations/paypal), [Merge connector docs](https://docs.merge.dev/merge-workforce/connectors/pay-pal.md)
- [Hookdeck PayPal webhooks](https://hookdeck.com/webhooks/skills/paypal-webhooks.md), [Pinggy webhook guide](https://pinggy.io/amp/blog/how_to_set_up_and_test_paypal_webhook_locally/)
- [Channel3 search guide](https://docs.trychannel3.com/guides/make-a-search), [Channel3 UCP](https://docs.trychannel3.com/ucp), [Channel3 llms.txt](https://trychannel3.com/llms.txt)
- [Talker-Reasoner (arXiv)](https://arxiv.org/abs/2410.08328), [Ping-Ponder (SIGDIAL 2026)](https://aclanthology.org/2026.sigdial-1.14.pdf)
- [Digital Commerce 360](https://www.digitalcommerce360.com/2025/10/28/paypal-agentic-commerce-ai-driven-shopping-services/amp/), [Nevermined PayPal review](https://nevermined.ai/blog/paypal-review)
