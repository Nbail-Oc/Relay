import { notFound } from "next/navigation";
import ChatSidebar from "@/components/chat-sidebar";
import VoiceChat from "@/components/voice-chat";
import { createClient } from "@/lib/supabase/server";
export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }=await params;const supabase=await createClient();
  const { data: chat }=await supabase.from("conversations").select("id").eq("id",id).single();if(!chat)notFound();
  const { data: messages }=await supabase.from("messages").select("id,role,content").eq("conversation_id",id).order("created_at");
  return <div className="app-shell"><ChatSidebar activeId={id}/><VoiceChat conversationId={id} initialMessages={messages||[]}/></div>;
}
