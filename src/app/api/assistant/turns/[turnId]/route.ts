import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { getAssistantTurn } from "@/lib/assistant";

export async function GET(request: Request, { params }: { params: Promise<{ turnId: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const { turnId } = await params;
  const turn = await getAssistantTurn({ supabase: auth.supabase, user: auth.user, turnId });
  if (!turn) return NextResponse.json({ error: "Turn not found." }, { status: 404 });
  return NextResponse.json(turn, { headers: { "Cache-Control": "no-store" } });
}
