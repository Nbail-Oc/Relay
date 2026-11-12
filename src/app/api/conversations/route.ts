import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateChatMode } from "@/lib/paypal-workflows.js";
export async function GET() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json(); const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "New conversation";
  const mode = "general";
  const { data, error } = await supabase.from("conversations").insert({ user_id: user.id, title: title || "New conversation", mode }).select("id,title,mode,updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
