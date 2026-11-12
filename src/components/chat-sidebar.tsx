import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
export default async function ChatSidebar({ activeId }: { activeId?: string }) {
  const supabase = await createClient(); const [{ data: { user } }, { data: chats }] = await Promise.all([
    supabase.auth.getUser(), supabase.from("conversations").select("id,title").order("updated_at", { ascending: false }).limit(25),
  ]);
  return <aside className="sidebar"><div className="side-top"><Link className="brand" href="/chat/new">Voice</Link><Link className="side-action" href="/chat/new">＋ New</Link></div><div><div className="recent-title">Recent conversations</div>{chats?.length ? chats.map(chat=><Link key={chat.id} className="chat-link" data-active={chat.id===activeId} href={`/chat/${chat.id}`}>{chat.title || "New conversation"}</Link>) : <p className="chat-link">Your conversations appear here.</p>}</div><div className="account">{user?.email}<form action="/auth/signout" method="post"><button className="side-action" style={{marginTop:12}}>Sign out</button></form></div></aside>;
}
