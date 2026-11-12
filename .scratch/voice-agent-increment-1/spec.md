# Increment 1 — Voice chat

## Goal

Ship a private browser chat where one signed-in user can start or reopen a conversation and switch between typed turns and live voice in that same conversation.

## User flow

`/` → `/auth` email magic link → `/chat/new` → first text or voice starts `/chat/{id}`. Chat pages show recent conversations. Text must work when microphone permission is denied.

## Behavior

- Supabase Auth magic link; chat pages and APIs require an authenticated user.
- Supabase Postgres stores conversation titles and user/assistant transcripts. RLS scopes both tables to the owner.
- Text uses Groq GPT-OSS 20B. Voice uses Pipecat SmallWebRTC with Gnani STT/TTS and Groq GPT-OSS 20B.
- Both paths share durable transcript history. A voice runtime loads up to 40 recent messages with the user's access token and persists final transcripts through authenticated app routes.
- Provider calls can use one configured backup key. Provider errors never expose API keys to the browser.
- Voice controls: accessible mic toggle, stop/disconnect, Pipecat barge-in, Space shortcut outside editable controls, reduced-motion orb, and text fallback on voice errors.
- Design uses the ElevenLabs editorial tokens in `elevenlabs.design.md`, a local orb inspired by Bol, and Ark UI Toggle for the accessible mic control.

## Data

- `conversations`: UUID, owner user ID, title (≤80 chars), created/updated times.
- `messages`: UUID, conversation ID, role (`user`/`assistant`), content (1–12,000 chars), created time.
- Cascading delete, owner policies, and indexes on owner/recent conversations and conversation/message order.

## Not in this increment

PayPal tools, invoice/shopping/refund flows, OpenRouter, attachments, storage buckets, raw audio retention, hosted voice infrastructure, and deployment.

## Acceptance checks

1. Email link completes sign-in and reaches `/chat/new`; unauthenticated `/chat/*` redirects to `/auth`.
2. First text creates one chat, saves the user turn and assistant answer, and appears after reload/reopen.
3. Two users cannot list/read/write each other's conversation data.
4. Voice starts on a new or existing chat, restores recent context, saves final transcripts, plays audio, and can be stopped/interrupted.
5. Mic denial/provider outage leaves typed chat available. Backup-key attempt is limited to one retry.
6. Space does not steal input while focus is in a text field; reduced-motion preference disables orb motion.

## Local verification status

Next production build, TypeScript check, Python syntax compilation, and provider failover unit tests pass. Magic-link inbox, two-user RLS integration, and live Gnani/Groq/WebRTC checks require configured email/provider credentials and are documented as manual ticket acceptance checks.
