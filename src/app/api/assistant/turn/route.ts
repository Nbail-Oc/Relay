import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { createAssistantTurn, startAssistantTurn } from "@/lib/assistant";

export async function POST(request: Request) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body.conversationId !== "string") return NextResponse.json({ error: "Conversation is required." }, { status: 400 });
    const { data: conversation, error } = await auth.supabase.from("conversations").select("id,user_id,mode,workflow_state").eq("id", body.conversationId).eq("user_id", auth.user.id).maybeSingle();
    if (error || !conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const input = { supabase: auth.supabase, user: auth.user, conversation, text: body.text, attachmentIds: body.attachmentIds, messageId: body.messageId };
    if (body.waitForResponse === true) return NextResponse.json(await createAssistantTurn(input), { status: 201 });
    return NextResponse.json(await startAssistantTurn(input), { status: 202 });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Assistant is temporarily unavailable." }, { status });
  }
}
