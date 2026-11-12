import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { listConversationAttachments, uploadAttachment } from "@/lib/assistant";
import { MAX_ATTACHMENT_BYTES, validateAttachment } from "@/lib/paypal-workflows.js";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: conversation } = await auth.supabase.from("conversations").select("id").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  try { return NextResponse.json(await listConversationAttachments({ userId: auth.user.id, conversationId: id })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load attachments." }, { status: 500 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const maxRequestBytes = MAX_ATTACHMENT_BYTES + 64 * 1024;
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
      return NextResponse.json({ error: "Attachment upload exceeds the 1 MiB limit." }, { status: 413 });
    }
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Choose a file to attach." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxRequestBytes) { await reader.cancel(); return NextResponse.json({ error: "Attachment upload exceeds the 1 MiB limit." }, { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const headers = new Headers(request.headers); headers.delete("content-length");
    const form = await new Request(request.url, { method: "POST", headers, body: bytes }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to attach." }, { status: 400 });
    const validation = validateAttachment({ name: file.name, type: file.type, size: file.size });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    const attachment = await uploadAttachment({ user: auth.user, conversationId: id, file });
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload attachment." }, { status: Number((error as { status?: number })?.status) || 500 });
  }
}
