# Voice-First PayPal Copilot — Implementation Plan

Updated Nov 11, 2026. Planning reference for the full voice pipeline and three demo flows. Keep provider/model choices configurable; verify quotas, endpoints, and tool support during sandbox setup.

## Review update: reuse the Gnani voice-builder project

Reviewed `C:\Users\thang\Downloads\Gnani-AI-Internship` and its `/chat` screen. It is a Next.js app with a separate Python Pipecat runtime. Its browser client already handles SmallWebRTC, Gnani transcript/audio callbacks, interruption, mic/speaker selection, session status, and a custom WebGL orb with idle/animated states. The orb is in `components/ui/orb.tsx`; the agent chat uses it around assistant replies. Reuse that visual component and the proven Pipecat client/runtime patterns, not Bol's agent-builder screens or its local OpenCode/SQLite workspace model.

The existing builder starts a Python runtime as a local child process and returns a localhost endpoint. That is useful for development, but not a deployable session architecture. Keep Pipecat as a separate long-running Python service for voice sessions; Next.js owns auth, chat records, policy, PayPal calls, and UI. Use SmallWebRTC for local/self-hosted demo first. Keep API keys on the Pipecat/Next server. Add managed Daily transport only if real deployment/network testing shows it is needed.

**Two-increment model plan:** Increment 1 uses Groq GPT-OSS as the fast conversational LLM. Increment 2 adds OpenRouter as the stronger Reasoner for PayPal actions; Groq Talker narrates only from completed action state. Gnani performs STT and TTS. OpenRouter produces text/tool requests; it does not synthesize speech. Groq supports tool calling too, but OpenRouter is preferred for PayPal reasoning/model choice. The Talker must wait on money turns and never get ahead of PayPal state.

The connected Supabase project (`koyadwzzmunghplrigru`, Singapore) is active; its `public` schema is empty. Do not reuse Bol's SQLite database or local session folders. Use Supabase Auth, Postgres with RLS, and a private Storage bucket. Model only the app's data; PayPal remains source of truth for transaction state.

### Requested route and interaction shape

- `/`: very small ElevenLabs-style landing page with one primary CTA to `/auth`.
- `/auth`: Supabase sign-in/up; successful auth goes to `/chat/new`.
- `/chat/new`: blank voice-first composer. First submitted text creates a conversation row and navigates to `/chat/{id}`; starting voice creates the same row on connect/first final transcript.
- `/chat/{id}`: one persistent, accessible conversation with transcript, animated orb/status, text composer, file attach, and voice controls. No separate builder/dashboard for this demo.
- Spacebar can toggle mic only when focus is outside editable fields. The mic button remains the primary accessible control, with a visible shortcut hint; typing a literal space in the composer must always work. Support keyboard focus, screen-reader labels/status, visible mute/listening/speaking state, and reduced motion.

### V1 file and data scope

- Accept only `.md` and `.txt` initially. Validate extension, MIME, and a small size/character limit. Keep uploads private in Supabase Storage under the authenticated user and conversation; extract bounded text for model context. Treat file text as untrusted reference content, never as system instructions. Skip PDF/image parsing, embeddings, and RAG until needed.
- Minimal tables: `conversations` (owner, title, timestamps), `messages` (conversation, role, text, status), `attachments` (conversation/message, private object path, type/size, extracted text or extraction status), and `actions` (PayPal operation, sanitized parameters, confirmation state, idempotency key, external ID, status). Add a webhook/event table only when event ingestion is implemented; polling is enough for first demo.
- Enable RLS on all app tables; owner policies must follow `auth.uid()`. Storage policies must scope paths to that same owner. Keep service-role and PayPal/Gnani/OpenRouter/Groq keys server-side. Supabase docs recommend RLS for browser-accessible tables and keeping service-role keys server-side: https://supabase.com/docs/guides/getting-started/the-supabase-way-to-build.

### Revised two-increment build order

1. **Increment 1 — voice chat:** borrow orb, transcript, interruption, and SmallWebRTC patterns. Set up Supabase Auth and conversations/messages/attachments tables with RLS and private Storage. Build `/`, `/auth`, `/chat/new`, `/chat/[id]`; connect Pipecat + Gnani STT/TTS + Groq fast LLM. Add typed chat and `.md`/`.txt` attachments. Persist final transcripts, not raw audio. No PayPal credentials or tools required.
2. **Increment 2 — PayPal capability:** add OpenRouter Reasoner, server-side PayPal tools, deterministic policy gate, one-use confirmation, idempotency, and `actions` table. Add a flow-aware instruction/tool bundle for invoice, shopping, and refund. Connect flows one at a time and test in PayPal sandbox. Groq handles ordinary conversation; OpenRouter handles PayPal action planning; Talker narrates only verified outcomes.
3. **Flow sequence:** purchase (catalog → order → buyer approval → capture), invoice (attachment extraction → draft → preview → confirm → send), refund (find capture → read amount → confirm → refund → reconcile).
4. **Polish:** Ark UI primitives, ElevenLabs UI voice/chat components, design tokens, keyboard and screen-reader behavior. Add webhook later; poll PayPal for demo status first.

Do not create extra databases, vector infrastructure, a separate Talker service, or PDF/OCR pipeline for V1. Add each only when working demo exposes a concrete need.

## Product and build order

One web app, one voice/persona, three flows:

1. **Invoice:** attach `.md`/`.txt` quote or type details, extract line items, create invoice draft, preview, confirm, send. Add PDF/image parsing only if time permits.
2. **Shopping:** collect preferences, search products, show cards, create sandbox order, buyer approves in PayPal, capture after explicit confirmation.
3. **Refund:** find the captured order, read item and amount back, confirm, refund, report status.

Build shared state, policy gate, and typed path first. Voice uses same turn and action pipeline. Do not build three agents or separate databases.

## Voice and reasoning pipeline

```text
Browser mic + text
  ↔ Pipecat WebRTC runtime (Python)
      Gnani streaming STT
      final transcript + session context
      Groq fast conversational LLM (increment 1)
      OpenRouter tool-calling Reasoner (increment 2, PayPal turns)
      deterministic policy gate in Next.js backend (increment 2)
      PayPal / catalog APIs (increment 2)
      Gnani streaming TTS
  ↔ browser transcript + speaker + animated orb
        Supabase Auth / Postgres / private Storage
```

- **STT/TTS:** reuse Pipecat Gnani services from Bol; confirm current Gnani streaming formats and available credits. Keep final transcripts and user turns in the same conversation. Do not retain raw audio by default.
- **LLM, increment 1:** Groq GPT-OSS 20B for responsive conversation; keep provider/model configurable and use 120B only if quality/latency checks support it.
- **LLMs, increment 2:** OpenRouter Reasoner receives PayPal tool definitions and handles money-related turns. Groq Talker handles ordinary turns and voices only server-confirmed outcomes for PayPal turns. A short static wait line covers Reasoner latency.
- **TTS:** Gnani receives assistant text and returns audio. OpenRouter is an LLM provider, not a TTS provider. Pipecat streams sentence text/audio as available.
- **Turns:** Pipecat handles VAD, turn boundaries, and barge-in. Interim transcripts may update UI; only final transcript can reach tools. Keep text input on the same server-side orchestration path.
- **Money turns:** use short static wait audio/text while Reasoner and policy checks run. Show the exact pending action in UI; require explicit confirmation token before any send, capture, cancel, or refund.
- **State:** Supabase conversation + messages + actions is source of durable truth. Talker narration may say an action completed only after the ledger is marked done from a PayPal result/reconciliation.

## Provider and API-key failover

Configure primary and backup credentials per provider in server-side environment variables. Never expose keys to browser or commit them. Prefer one bounded fallback per capability, with provider/model metadata in logs.

- Use another key for key/account-specific errors; use backup provider/model for rate limits, unavailable model/routes (including 404), timeouts, and transient 5xx responses. OpenRouter can route across eligible providers for one model.
- Do not retry malformed requests, unsupported parameters, or policy denials unchanged. Keep fallback bounded so voice does not stall.
- **Money safety:** provider retry applies only before any external write. Every PayPal write gets a stable idempotency/request ID and ledger entry. On timeout after a write, query PayPal by known ID/state before retrying; never send the same invoice, capture, or refund blindly through another provider.
- Show a clear text-mode response if all voice providers fail. Provider outage must never bypass confirmation or policy checks.

## State, database, and files

**Use Supabase for the shared database and durable file storage:** Postgres for users/sessions/actions and Supabase Storage for attachments. Keep only temporary processing files on local disk; do not treat server disk as durable storage.

Minimum records:

- `sessions`: user/session ID, current mode, constraints/budget, timestamps.
- `messages`: transcript, speaker, status; avoid retaining raw audio by default.
- `attachments`: storage path, type, size, parsed result, retention/deletion time.
- `actions`: flow, PayPal operation, sanitized arguments, amount/currency/recipient, confirmation token state, idempotency key, external ID, status, timestamps, plain-English reason.
- `events`: verified webhook/poller updates linked to action/order/invoice.

Keep PayPal secrets in server environment, not database rows. Store only necessary extracted file data; validate file type/size, use private buckets and signed access, and delete temporary files after parsing. Use a repo migration for schema and apply it to the connected Supabase project; do not maintain a second persistence implementation.

Suggested project shape (adapt to existing repo):

```text
src/
  app/                 web screens and API routes
  components/          chat, voice controls, cards, confirmation UI
  lib/supabase/        server/client helpers
voice_runtime/         Python Pipecat pipeline (Gnani + OpenRouter)
supabase/
  migrations/
  storage-policy.sql
.env.example           variable names only; no real credentials
```

Keep policy and PayPal tools in authenticated Next.js server routes/actions or a small server module callable by the voice runtime over an authenticated internal endpoint. Do not spawn one permanent Python process per user from serverless Next.js routes.

## UI component direction

- Use **Ark UI** for accessible interaction primitives (dialogs, tabs, select, menu, toast, file upload where supported). Consult its MCP (`@ark-ui/mcp`) for component list, examples, and styling guidance; install only components the screens need. Ark UI is primitive-level, not a finished voice interface.
- Use **ElevenLabs UI** prebuilt components for voice/audio/chat surfaces where they fit (setup and components docs: https://ui.elevenlabs.io/docs/setup and https://ui.elevenlabs.io/docs/components). Treat these as visual components only: Gnani remains the selected STT/TTS provider. Confirm package compatibility and styling before integrating; wrap or restyle where Ark UI owns accessible interaction behavior.
- Keep product cards, invoice preview, action log, and PayPal approval state purpose-built. Every consequential action has a visible amount/recipient summary and explicit confirm/cancel controls. Text input must remain available without a microphone.
- Existing `elevenlabs.design.md` is a visual reference, not a requirement to use ElevenLabs APIs: warm off-white/ink, restrained type, soft cards, accessible contrast.

## Three end-to-end flows

### 1. Invoice from attachment

Upload → validate/store private file → extract text/data → Reasoner identifies recipient/items/amounts and asks for missing fields → create PayPal draft → show editable preview → user confirms exact recipient/amount → issue one-use confirmation token → send invoice → ledger/event update → narrate only confirmed status.

### 2. Product purchase

Ask preferences one at a time → Channel3 search or deterministic local catalog → show 3–4 product cards with price and match reasons → user selects → create sandbox order → open PayPal approval UI → verify buyer approval → read amount and ask confirmation → capture with idempotency key → show receipt. State clearly that sandbox purchase pays the test merchant, not retailer.

### 3. Refund

Find order/capture from user/session ledger → fetch current PayPal status → read item, capture, and exact refund amount → explicit UI + spoken confirmation → issue one-use token → refund → reconcile response/webhook/poll → narrate confirmed result. Never infer capture ID or refund amount from model text alone.

## Deterministic policy gate

- **Read:** allowlisted lookups run immediately.
- **Draft:** create invoice draft/order; return preview, no send/capture.
- **Confirm:** send invoice, capture payment, refund, cancel. Require a one-use token bound to exact operation, amount, currency, recipient/resource, and session; expire it quickly.
- **Block:** disabled tools, unknown recipient, over-cap amount, unsupported currency, stale/ambiguous state.
- Add per-session and per-purchase caps, allowed currency, append-only action ledger, stable idempotency IDs, and visible stop/cancel for pending actions. LLM never decides whether confirmation is sufficient.

## Delivery sequence

1. Finish increment 1 and verify voice, text, chat persistence, and typed fallback.
2. Add sandbox credentials and one PayPal flow end to end before exposing all tools.
3. Add invoice, shopping, and refund tool schemas/instructions; verify each confirmation and error path.
4. Package README and scripted demo after all flows work. Defer webhooks, PDF/image parsing, and managed WebRTC until needed.

## PayPal requirements for increment 2

- Create/use a PayPal Developer account and a **sandbox REST app**. Needed server secrets: `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`; set sandbox base URL. Never put client secret in browser or chat. PayPal uses OAuth 2.0 to exchange these credentials for access tokens.
- Keep sandbox **business/merchant** and **personal/buyer** accounts for invoice and checkout tests. Buyer logs in and approves checkout; backend captures only after explicit confirmation. For a test integration from outside the US, PayPal's current getting-started docs say a PayPal Business account is required.
- Configure `PAYPAL_WEBHOOK_ID` only if/when webhook verification is added. Polling needs no webhook ID. No live credentials needed for hackathon demo.
- We do not need card data, PayPal account password, or credentials pasted into this chat. Add secrets locally in `.env.local` / runtime `.env`.
- Implement server-side operations: create/show/send invoice; create/show order; capture approved order; find capture and create refund. Product search uses Channel3 key or mock catalog; PayPal does not supply retailer product discovery.
- OpenRouter instructions alone do not grant access: code must expose typed tool definitions and implement each function. PayPal execution stays in our server behind amount/recipient checks, confirmation tokens, idempotency, and action logging.

## Checks before committing to provider choices

- Gnani: credentials, API formats, streaming support, supported accent/language, quota, latency, TTS voice quality.
- Groq: current GPT-OSS model availability, quota, tool/streaming behavior if Talker changes roles, measured latency.
- OpenRouter: tool-call support and parameter compatibility of chosen model/provider, fallback routing, spend limits and privacy settings.
- Supabase: project ready, keys, private bucket/policies, schema migrations. If setup costs more time than it saves, use SQLite/local uploads for the demo.
- Ark MCP and ElevenLabs UI: retrieve current examples/setup, check React/framework compatibility and package install instructions before building screens.

## References

- Project research: `Voice-First PayPal Copilot Research and Architecture Brief.md`
- Existing visual reference: `elevenlabs.design.md`
- [Gnani API repository](https://gnani-ai.github.io/API-service/)
- [Groq tool use](https://console.groq.com/docs/tool-use/overview) · [Groq models](https://console.groq.com/docs/models)
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Ark UI MCP](https://ark-ui.com/docs/overview/installation) — use `@ark-ui/mcp` as requested; verify current endpoint/docs on setup
- [ElevenLabs UI setup](https://ui.elevenlabs.io/docs/setup) · [components](https://ui.elevenlabs.io/docs/components)
