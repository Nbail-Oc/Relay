# 03 — Pipecat voice chat

**Status:** Implemented locally; provider smoke test pending credentials  
**Blocked by:** 02 — Persistent text conversations

## Scope

Add local Pipecat SmallWebRTC runtime, Gnani STT/TTS, Groq GPT-OSS 20B, shared recent conversation context, transcript persistence, animated orb, and accessible voice controls.

## Acceptance

- Voice can start from a new or existing conversation.
- Voice loads recent messages via the user's Supabase access token and RLS.
- Final user/assistant transcripts persist into the existing conversation; typed turns during an active voice session use Pipecat `sendText()`.
- Audio can be heard, interrupted by speech, or stopped/disconnected.
- Microphone denial/runtime/provider failure leaves text available with a clear error.
- Space toggles the mic only outside editable fields; reduced motion is respected.

## Verification

With Gnani/Groq credentials, smoke-test voice and text turns, final transcript reload, audio, interruption, stop, mic denial, and backup-key bounds. Without credentials, run Python syntax compilation and the Next build.
