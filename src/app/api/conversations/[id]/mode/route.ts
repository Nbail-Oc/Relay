import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { validateChatMode } from "@/lib/paypal-workflows.js";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await auth.supabase.from("conversations").select("id,mode,workflow_state").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();
  if (!validateChatMode(body.mode)) return NextResponse.json({ error: "Choose a supported chat mode." }, { status: 400 });
  const { data: pending } = await auth.supabase.from("paypal_actions").select("id,status").eq("conversation_id", id).eq("owner_id", auth.user.id).in("status", ["awaiting_approval", "pending_confirmation", "executing", "reconciliation_required"]).limit(1).maybeSingle();
  if (pending) return NextResponse.json({ error: "Finish or cancel the pending PayPal action before changing modes." }, { status: 409 });
  const { data, error } = await auth.supabase.from("conversations").update({ mode: body.mode, workflow_state: {}, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", auth.user.id).select("id,mode,workflow_state").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json(data);
}
