import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to start voice." }, { status: 401 });
  const endpoint = process.env.NEXT_PUBLIC_VOICE_RUNTIME_URL;
  if (!endpoint) return NextResponse.json({ error: "Voice runtime is not configured. You can keep chatting by text." }, { status: 503 });
  return NextResponse.json({ endpoint: `${endpoint.replace(/\/$/, "")}/start`, backupAvailable: Boolean(process.env.GNANI_API_KEY_BACKUP) });
}
