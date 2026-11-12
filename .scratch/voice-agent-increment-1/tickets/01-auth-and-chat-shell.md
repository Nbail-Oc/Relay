# 01 — Landing, auth, and protected chat shell

**Status:** Implemented locally  
**Blocked by:** None

## Scope

Create the simple landing CTA, Supabase email magic-link auth, auth callback/sign-out, protected `/chat/*` routes, and responsive chat shell with recent conversations.

## Acceptance

- `/` has one primary CTA to `/auth`.
- Magic link callback creates a session and redirects to `/chat/new`.
- Anonymous visits to `/chat/new` and `/chat/{id}` redirect to `/auth`.
- Signed-in user sees recent chats and can start a new one.
- Chat data access is owner-scoped through RLS.

## Verification

Run `npm run build`; manually complete a magic link and attempt an unauthenticated protected-route visit.
