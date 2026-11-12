import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { executePayPalTool } from "@/lib/assistant";

const AVAILABLE_TOOLS = new Set(["create_invoice_draft", "search_products", "create_order", "list_my_orders", "request_refund"]);

function validSecret(received: string | null) {
  const expected = process.env.OPENCODE_BRIDGE_SECRET || "";
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!validSecret(request.headers.get("x-paypal-opencode-secret"))) return NextResponse.json({ error: "Unauthorized tool request." }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body.sessionId !== "string" || !AVAILABLE_TOOLS.has(body.tool) || !body.arguments || typeof body.arguments !== "object") {
      return NextResponse.json({ error: "Invalid workflow tool request." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: link } = await admin.from("opencode_sessions").select("owner_id,conversation_id,active_turn_id").eq("session_id", body.sessionId).maybeSingle();
    if (!link?.active_turn_id) return NextResponse.json({ error: "This OpenCode session has no active authorized turn." }, { status: 403 });
    const { data: conversation } = await admin.from("conversations").select("id,user_id,mode,workflow_state,title").eq("id", link.conversation_id).eq("user_id", link.owner_id).maybeSingle();
    const { data: turn } = await admin.from("assistant_turns").select("id,user_message_id,status,response").eq("id", link.active_turn_id).eq("owner_id", link.owner_id).eq("conversation_id", link.conversation_id).maybeSingle();
    if (!conversation || !turn || turn.status !== "running") return NextResponse.json({ error: "This workflow turn is no longer active." }, { status: 403 });
    const result = await executePayPalTool({ user: { id: link.owner_id }, conversation, messageId: turn.user_message_id, tool: body.tool, args: body.arguments });
    if (result.cards.length) {
      const cards = [...(Array.isArray(turn.response?.cards) ? turn.response.cards : []), ...result.cards];
      const { error } = await admin.from("assistant_turns").update({ response: { ...(turn.response || {}), cards }, updated_at: new Date().toISOString() }).eq("id", turn.id).eq("status", "running");
      if (error) throw new Error("PayPal action was prepared, but its review card could not be recorded. Refresh the chat before retrying.");
    }
    return NextResponse.json({ result: result.result });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow tool failed." }, { status });
  }
}
