import ChatSidebar from "@/components/chat-sidebar";
import VoiceChat from "@/components/voice-chat";
export default function NewChatPage() { return <div className="app-shell"><ChatSidebar/><VoiceChat initialMessages={[]}/></div>; }
