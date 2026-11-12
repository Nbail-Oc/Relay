# 02 — Persistent text conversations

**Status:** Implemented locally  
**Blocked by:** 01 — Landing, auth, and protected chat shell

## Scope

Create the conversation on the first submitted text, call Groq GPT-OSS 20B, persist user and assistant turns, show history, and let users reopen chats after reload. Text never requests microphone access.

## Acceptance

- First message creates a single conversation and navigates to its `/chat/{id}` URL.
- Conversation title derives from the first message; transcript and answer survive reload.
- Recent chat list can reopen history.
- RLS prevents two authenticated users from listing, reading, or writing each other's data.
- One backup Groq key is attempted at most once after a provider error.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. With credentials, test first message, reload/reopen, two-user RLS, and backup-key bound.
