import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const next = url.searchParams.get("next") || "/chat/new";
  if (code) { const supabase = await createClient(); const { error } = await supabase.auth.exchangeCodeForSession(code); const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/chat/new"; if (!error) return NextResponse.redirect(new URL(safeNext, url.origin)); }
  return NextResponse.redirect(new URL("/auth?error=link", url.origin));
}
