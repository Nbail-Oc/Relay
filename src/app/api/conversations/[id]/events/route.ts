import { getApiAuth } from "@/lib/api-auth";
import { openCodeEventStream } from "@/lib/opencode.js";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionIdFromEvent(event: unknown) {
  const raw = event as any;
  const payload = raw?.payload || raw?.event || raw?.data?.payload || raw;
  const fields = payload?.properties || payload?.data || {};
  return fields.sessionID || fields.sessionId || payload?.sessionID || payload?.sessionId;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const { id } = await params;
  const { data: conversation } = await auth.supabase.from("conversations").select("id").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const admin = createAdminClient();
  const { data: link } = await admin.from("opencode_sessions").select("session_id").eq("conversation_id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!link?.session_id) return Response.json({ error: "OpenCode session is not ready." }, { status: 409 });
  let upstream: Response;
  try { upstream = await openCodeEventStream(); }
  catch { return Response.json({ error: "OpenCode live updates are unavailable." }, { status: 503 }); }
  if (!upstream.ok || !upstream.body || !upstream.headers.get("content-type")?.includes("text/event-stream")) return Response.json({ error: "OpenCode returned no event stream." }, { status: 502 });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          pending += decoder.decode(value, { stream: true });
          const events = pending.split(/\r?\n\r?\n/);
          pending = events.pop() || "";
          for (const rawEvent of events) {
            const data = rawEvent.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
            if (!data) continue;
            try {
              const event = JSON.parse(data);
            if (sessionIdFromEvent(event) !== link.session_id) continue;
              controller.enqueue(new TextEncoder().encode(`${rawEvent}\n\n`));
            } catch {}
          }
          return;
        }
      } catch { controller.close(); }
    },
    async cancel() { await reader.cancel().catch(() => {}); },
  });
  request.signal.addEventListener("abort", () => { void reader.cancel().catch(() => {}); }, { once: true });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
