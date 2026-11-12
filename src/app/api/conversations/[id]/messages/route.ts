import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { createAssistantTurn } from "@/lib/assistant";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await auth.supabase.from("messages").select("id,role,content,created_at").eq("conversation_id", id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
// Compatibility path; all typed turns still use the centralized mode-aware handler.
export async function POST(request: Request, { params }: Context) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const { data: conversation } = await auth.supabase.from("conversations").select("id,user_id,mode,workflow_state").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const result = await createAssistantTurn({ supabase: auth.supabase, user: auth.user, conversation, text: body.content, messageId: body.messageId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Assistant is temporarily unavailable." }, { status: Number((error as { status?: number })?.status) || 502 });
  }
}
