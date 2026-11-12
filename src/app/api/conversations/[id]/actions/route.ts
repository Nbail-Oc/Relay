import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { listPayPalActions } from "@/lib/assistant";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: conversation } = await auth.supabase.from("conversations").select("id").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  try { return NextResponse.json(await listPayPalActions({ userId: auth.user.id, conversationId: id })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load PayPal actions." }, { status: 500 }); }
}
