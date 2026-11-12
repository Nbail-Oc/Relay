"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { Toggle } from "@ark-ui/react/toggle";
import { createClient as createSupabaseClient } from "@/lib/supabase/browser";
import { Orb } from "@/components/bol-orb";

type Message = { id: string; role: string; content: string; streaming?: boolean; thinking?: boolean; tools?: { id: string; name: string; status: string }[]; failed?: boolean };
type Action = { id: string; kind: string; status: string; amount?: string; currency?: string; recipient?: string; details?: Record<string, any>; confirmationToken?: string; expiresAt?: string; paypal_resource_id?: string; capture_id?: string };
type Card = { type: string; source?: string; items?: any[]; invoice?: any; amount?: string };
export default function VoiceChat({ conversationId, initialMessages }: { conversationId?: string; initialMessages: Message[] }) {
  const [id, setId] = useState(conversationId); const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [phase, setPhase] = useState("idle"); const [error, setError] = useState(""); const [muted, setMuted] = useState(false);
  const [animated, setAnimated] = useState(true); const [actions, setActions] = useState<Action[]>([]); const [attachments, setAttachments] = useState<{ id: string; file_name: string }[]>([]); const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const client = useRef<PipecatClient | null>(null); const eventStream = useRef<EventSource | null>(null); const audio = useRef<HTMLAudioElement>(null); const end = useRef<HTMLDivElement>(null); const input = useRef<HTMLTextAreaElement>(null); const fileInput = useRef<HTMLInputElement>(null); const conversationRef = useRef(conversationId); const micLevel = useRef(0); const speakerLevel = useRef(0);
  const backupAvailable = useRef(false); const backupAttempted = useRef(false);
  useEffect(() => { conversationRef.current = id; }, [id]);
  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setAnimated(!media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, actions]);
  const refreshActions = useCallback(async (chatId = id) => { if (!chatId) return; const r = await fetch(`/api/conversations/${chatId}/actions`); if (r.ok) setActions(await r.json()); }, [id]);
  const refreshWorkflow = useCallback(async (chatId = id) => { if (!chatId) return; const r = await fetch(`/api/conversations/${chatId}/mode`); if (!r.ok) return; const state = await r.json(); const workflow = state.workflow_state || {}; setCards(rows => [...rows.filter(card => !["products", "orders"].includes(card.type)), ...(Array.isArray(workflow.shoppingProducts) && workflow.shoppingProducts.length ? [{ type: "products", source: workflow.shoppingProducts[0]?.source || "demo", items: workflow.shoppingProducts }] : []), ...(Array.isArray(workflow.refundOrders) ? [{ type: "orders", items: workflow.refundOrders }] : [])]); }, [id]);
  const refreshMessages = useCallback(async (chatId = id) => { if (!chatId) return; const r = await fetch(`/api/conversations/${chatId}/messages`); if (r.ok) setMessages(await r.json()); }, [id]);
  useEffect(() => { if (id) { void refreshActions(id); fetch(`/api/conversations/${id}/attachments`).then(r => r.ok ? r.json() : []).then(setAttachments); } }, [id, refreshActions]);

  async function ensureConversation(title: string) {
    if (id) return id;
    const r = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.slice(0, 52) || "New conversation" }) });
    const row = await r.json(); if (!r.ok) throw new Error(row.error || "Could not create conversation.");
    setId(row.id); conversationRef.current = row.id; window.history.replaceState(null, "", `/chat/${row.id}`); return row.id as string;
  }
  function updateSelectedFiles(next: string[]) {
    if (next.length > 5) { setError("Attach at most five files per turn."); return; }
    setSelectedFiles(next);
    if (phase !== "idle" && phase !== "error") void stopVoice().then(() => startVoice(false, next));
  }
  function streamAssistantTurn(chatId: string, turnId: string, userId: string, placeholderId: string) {
    eventStream.current?.close();
    let settled = false;
    let checking = false;
    const deadline = Date.now() + 90_000;
    let pollTimer: ReturnType<typeof setTimeout>;
    const settle = async () => {
      if (settled || checking) return;
      checking = true;
      try {
        const response = await fetch(`/api/assistant/turns/${turnId}`, { cache: "no-store" });
        const result = await response.json();
        if (result.status === "running" && Date.now() < deadline) { checking = false; pollTimer = setTimeout(settle, 500); return; }
        if (result.status === "running") result.error = "OpenCode is taking longer than expected. Your message is saved; reload to check its status.";
        settled = true;
        eventStream.current?.close(); eventStream.current = null;
        if (result.status === "completed") {
          setMessages(rows => [...rows.filter(message => message.id !== placeholderId && message.id !== userId), result.userMessage, result.message].filter(Boolean));
          setCards(rows => [...rows, ...(result.cards || [])]);
          setSelectedFiles([]); void refreshActions(chatId);
        } else {
          setMessages(rows => rows.map(message => message.id === placeholderId ? { ...message, content: result.error || "OpenCode could not complete this response.", streaming: false, failed: true } : message));
          setError(result.error || "OpenCode could not complete this response. Your message is saved; you can retry it.");
        }
      } catch {
        checking = false;
        if (!settled && Date.now() < deadline) pollTimer = setTimeout(settle, 1000);
        else if (!settled) {
          settled = true;
          setMessages(rows => rows.map(message => message.id === placeholderId ? { ...message, content: "Could not check the assistant response. Your message is saved; reload to check its status.", streaming: false, failed: true } : message));
          setError("Could not check the assistant response. Your message is saved; reload to check its status.");
          setBusy(false);
        }
      } finally {
        checking = false;
        if (settled) setBusy(false);
      }
    };
    const stream = new EventSource(`/api/conversations/${chatId}/events`);
    eventStream.current = stream;
    const handle = (event: MessageEvent) => {
      let raw: any;
      try { raw = JSON.parse(event.data); } catch { return; }
      const payload = raw?.payload || raw?.event || raw?.data?.payload || raw;
      const fields = payload?.properties || payload?.data || {};
      const type = payload?.type || event.type;
      const assistantId = fields.assistantMessageID || (type === "message.part.delta" ? fields.messageID : null);
      if (assistantId) setMessages(rows => {
        const current = rows.find(message => message.id === placeholderId);
        const index = rows.findIndex(message => message.id === (current?.id || assistantId));
        const message = index >= 0 ? rows[index] : { id: placeholderId, role: "assistant", content: "", streaming: true, thinking: true, tools: [] };
        let next = { ...message, id: placeholderId, streaming: true };
        if (type === "session.next.text.delta" || (type === "message.part.delta" && fields.field === "text")) next.content += fields.delta || "";
        else if (type === "session.next.text.ended" && typeof fields.text === "string") next.content = fields.text;
        else if (["session.next.reasoning.started", "session.next.reasoning.delta", "session.next.step.started"].includes(type) || (type === "message.part.delta" && fields.field === "reasoning")) next.thinking = true;
        else if (["session.next.reasoning.ended", "session.next.step.ended"].includes(type)) next.thinking = false;
        else if (type === "session.next.tool.called") next.tools = [...(next.tools || []).filter(tool => tool.id !== fields.callID), { id: fields.callID || `${assistantId}-tool`, name: fields.tool || "PayPal workflow", status: "running" }];
        else if (["session.next.tool.success", "session.next.tool.failed"].includes(type)) next.tools = (next.tools || []).map(tool => tool.id === fields.callID ? { ...tool, status: type.endsWith("failed") ? "failed" : "done" } : tool);
        else if (type === "message.part.updated" && fields.part?.type === "tool") {
          const part = fields.part; const state = part.state?.status || "running";
          next.tools = [...(next.tools || []).filter(tool => tool.id !== part.callID), { id: part.callID || part.id, name: part.tool || "PayPal workflow", status: state === "completed" ? "done" : state === "error" ? "failed" : "running" }];
        }
        if (type === "session.status" && fields.status?.type === "busy") next.thinking = true;
        if (index >= 0) { const copy = [...rows]; copy[index] = next; return copy; }
        return [...rows, next];
      });
      if (type === "session.idle" || type === "session.error" || (type === "session.status" && fields.status?.type === "idle")) void settle();
    };
    stream.onmessage = handle;
    for (const name of ["session.next.text.delta", "session.next.text.ended", "session.next.reasoning.started", "session.next.reasoning.delta", "session.next.reasoning.ended", "session.next.tool.called", "session.next.tool.success", "session.next.tool.failed", "session.next.step.started", "session.next.step.ended", "session.idle", "session.error", "session.status", "session.turn.open", "message.part.delta", "message.part.updated"]) stream.addEventListener(name, handle as EventListener);
    pollTimer = setTimeout(settle, 500);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); const content = text.trim(); if (!content || busy) return; setText(""); setError(""); setBusy(true);
    const userId = crypto.randomUUID(); const placeholderId = `pending:${userId}`;
    const userMessage = { id: userId, role: "user", content };
    setMessages(rows => [...rows, userMessage, { id: placeholderId, role: "assistant", content: "", streaming: true, thinking: true, tools: [] }]);
    try {
      const chatId = await ensureConversation(content);
      if (client.current && phase !== "idle" && phase !== "error") { client.current.sendText(content); setMessages(rows => rows.filter(message => message.id !== placeholderId)); setBusy(false); }
      else {
        const response = await fetch("/api/assistant/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: chatId, text: content, messageId: userId, attachmentIds: selectedFiles }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not start the assistant turn.");
        if (result.userMessage?.id) setMessages(rows => rows.map(message => message.id === userId ? { ...result.userMessage } : message));
        streamAssistantTurn(chatId, result.turnId, result.userMessage?.id || userId, placeholderId);
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Message failed.";
      setMessages(rows => rows.map(message => message.id === placeholderId ? { ...message, content: detail, streaming: false, failed: true } : message));
      setError(detail); setText(content); setBusy(false);
    }
    input.current?.focus();
  }
  async function uploadFile(file?: File) { if (!file) return; try { const chatId = await ensureConversation(file.name); const body = new FormData(); body.set("file", file); const r = await fetch(`/api/conversations/${chatId}/attachments`, { method: "POST", body }); const result = await r.json(); if (!r.ok) throw new Error(result.error || "Upload failed."); setAttachments(rows => [...rows, result]); updateSelectedFiles([...selectedFiles, result.id]); } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); } }
  async function startVoice(backup = false, attachmentIds = selectedFiles) {
    setError(""); let chatId: string; try { chatId = await ensureConversation("Voice conversation"); } catch (e) { setError(e instanceof Error ? e.message : "Could not create conversation."); return; }
    if (!backup) { backupAttempted.current = false; backupAvailable.current = false; }
    setPhase("connecting"); let pc!: PipecatClient;
    const failVoice = async () => { if (!backup && backupAvailable.current && !backupAttempted.current) { backupAttempted.current = true; setError("Voice provider failed. Retrying once with the backup Gnani key…"); await pc.disconnect().catch(() => {}); if (client.current === pc) client.current = null; await startVoice(true); return; } setPhase("error"); setError("Voice connection failed after one configured backup attempt. Text chat remains available."); };
    pc = new PipecatClient({ transport: new SmallWebRTCTransport(), enableMic: true, enableCam: false, callbacks: {
      onConnected: () => setPhase("listening"), onDisconnected: () => setPhase("idle"), onTransportStateChanged: state => { if (state === "connected") setPhase("listening"); if (state === "error") void failVoice(); },
      onDeviceError: e => { setError(`${e.message || "Microphone access denied."} Text chat remains available.`); setPhase("error"); },
      onTrackStarted: (track, participant) => { if (track.kind === "audio" && !participant?.local && audio.current) { audio.current.srcObject = new MediaStream([track]); void audio.current.play().catch(() => setError("Audio playback was blocked. Use the browser play control.")); } },
      onLocalAudioLevel: level => { micLevel.current = level; }, onRemoteAudioLevel: level => { speakerLevel.current = level; },
      onUserStartedSpeaking: () => setPhase("listening"), onUserStoppedSpeaking: () => setPhase("thinking"),
      onUserInput: d => { if (d?.text && d.final) { setPhase("thinking"); setMessages(rows => rows.at(-1)?.role === "user" && rows.at(-1)?.content === d.text ? rows : [...rows, { id: crypto.randomUUID(), role: "user", content: d.text }]); } },
      onBotOutput: d => { if (d?.text && d.will_be_spoken !== false) setPhase("speaking"); },
      onBotStartedSpeaking: () => setPhase("speaking"), onBotStoppedSpeaking: () => { setPhase("listening"); void refreshMessages(chatId); void refreshActions(chatId); void refreshWorkflow(chatId); }, onBotInterrupted: () => { setPhase("listening"); void refreshMessages(chatId); void refreshActions(chatId); void refreshWorkflow(chatId); }, onError: () => { void failVoice(); },
    } }); client.current = pc;
    try {
      await pc.initDevices(); const response = await fetch("/api/voice-session", { method: "POST" }); const data = await response.json(); backupAvailable.current = Boolean(data.backupAvailable); if (!response.ok || !data.endpoint) throw new Error(data.error || "Voice runtime is not ready.");
      const { data: { session } } = await createSupabaseClient().auth.getSession(); if (!session) throw new Error("Your sign-in expired. Please sign in again.");
      await pc.startBotAndConnect({ endpoint: data.endpoint, requestData: { transport: "webrtc", conversation_id: chatId, attachment_ids: attachmentIds, access_token: session.access_token, key_index: backup ? 1 : 0 } }); setPhase("listening");
    } catch (e) { if (!backup && backupAvailable.current && !backupAttempted.current) { backupAttempted.current = true; await pc.disconnect().catch(() => {}); if (client.current === pc) client.current = null; await startVoice(true); } else { setError(e instanceof Error ? `${e.message} Text chat remains available.` : "Could not start voice."); setPhase("error"); await pc.disconnect().catch(() => {}); client.current = null; } }
  }
  async function stopVoice() { await client.current?.disconnect().catch(() => {}); client.current = null; if (audio.current) audio.current.srcObject = null; setPhase("idle"); setMuted(false); }
  useEffect(() => { const key = (e: KeyboardEvent) => { const target = e.target as HTMLElement; const editable = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName); const control = Boolean(target.closest("button,a,[role=button],[role=radio],[role=checkbox],[role=switch],[role=tab]")); if (e.code === "Space" && !e.repeat && !editable && !control) { e.preventDefault(); if (phase === "idle" || phase === "error") void startVoice(); else setMuted(value => { client.current?.enableMic(value); return !value; }); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [phase, id]);
  useEffect(() => () => { void client.current?.disconnect(); }, []);
  useEffect(() => () => { eventStream.current?.close(); }, []);
  async function act(action: Action, operation: "confirm" | "cancel" | "approve" | "reconcile") { setError(""); try { const path = operation === "approve" ? "approve" : operation; const body = operation === "confirm" ? { confirmationToken: action.confirmationToken } : operation === "approve" ? { orderId: action.paypal_resource_id } : {}; const r = await fetch(`/api/actions/${action.id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await r.json(); if (!r.ok) throw new Error(result.error || "Action failed."); await refreshActions(); await refreshWorkflow(); if (result.summary) setMessages(rows => [...rows, { id: crypto.randomUUID(), role: "assistant", content: result.summary }]); } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); await refreshActions(); } }
  const orbState = phase === "speaking" ? "talking" : phase === "listening" ? "listening" : phase === "thinking" || phase === "connecting" ? "thinking" : null;
  return <div className="chat-main">
    <header className="chat-head"><span className="chat-status"><Orb className="orb orb-status" colors={["#a7e5d3", "#c8b8e0"]} agentState={orbState} volumeMode="manual" inputVolumeRef={micLevel} outputVolumeRef={speakerLevel} animated={animated} aria-hidden="true"/>{phase === "idle" ? "Voice chat" : phase[0].toUpperCase() + phase.slice(1)}</span><span>Space {phase === "idle" ? "to speak" : "to mute / unmute"}</span></header>
    <div className="mode-bar"><span className="eyebrow">Assistant</span><span className="mode-description">Chat, invoices, shopping, and refunds · PayPal sandbox actions require your confirmation</span></div>
    <section className="chat-scroll" aria-live="polite"><div className="messages">{messages.length === 0 && <div className="empty-state"><Orb className="orb" colors={["#a7e5d3", "#c8b8e0"]} agentState={orbState} volumeMode="manual" inputVolumeRef={micLevel} outputVolumeRef={speakerLevel} animated={animated} aria-hidden="true"/><span className="eyebrow">A conversation, at your pace</span><h1>What’s on your mind?</h1><p>Chat, create invoices, find products, or manage sandbox refunds in one conversation.</p></div>}{messages.map(m => <article key={m.id} className={`message ${m.role} ${m.failed ? "message-failed" : ""}`}><span className="eyebrow">{m.role === "user" ? "You" : "Assistant"}</span><div>{m.content || (m.thinking ? "Thinking…" : m.streaming ? "Preparing a response…" : "")}</div>{m.tools?.map(tool => <small key={tool.id} className="tool-status">{tool.name.replaceAll("_", " ")} · {tool.status}</small>)}</article>)}
      {attachments.length > 0 && <div className="workflow-card"><strong>Attached reference files</strong><div className="attachment-list">{attachments.map(file => <label key={file.id}><input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={e => updateSelectedFiles(e.target.checked ? [...selectedFiles, file.id] : selectedFiles.filter(id => id !== file.id))}/>{file.file_name}</label>)}</div><small>Selected files are treated as untrusted reference data, not instructions. Changing files restarts an active voice session.</small></div>}
      {cards.map((card, index) => card.type === "products" ? <div className="product-grid" key={`products-${index}`}><span className="eyebrow">{card.source === "channel3" ? "Channel3 results" : "Demo catalog"}</span>{(card.items || []).map(product => <article className="workflow-card product-card" key={product.id}>{product.image && <img src={product.image} alt=""/>}<strong>{product.name}</strong><p>{product.description}</p><b>USD {Number(product.price).toFixed(2)}</b><button className="side-action" onClick={() => { setText(`I want to order product ${product.name} (ID: ${product.id}).`); input.current?.focus(); }}>Choose</button></article>)}</div> : card.type === "orders" ? <div className="workflow-card" key={`orders-${index}`}><strong>Eligible sandbox purchases</strong>{(card.items || []).length ? (card.items || []).map(order => <div className="action-buttons" key={order.id}><span>{order.product} · {order.currency} {order.amount}</span><button className="side-action" onClick={() => { setText(`Request a full refund for order action ${order.id}.`); input.current?.focus(); }}>Request refund</button></div>) : <p>No completed purchases are eligible for a refund.</p>}</div> : card.type === "invoice" ? <div className="workflow-card" key={`invoice-${index}`}><strong>Invoice draft preview</strong><p>To: {card.invoice?.recipientEmail}<br/>Total: USD {card.amount || card.invoice?.total}</p>{(card.invoice?.items || []).map((item: any, i: number) => <div key={i}>{item.quantity} × {item.name} · USD {item.unitAmount}</div>)}</div> : null)}
      {actions.map(action => <div className="workflow-card" key={action.id}><strong>{action.kind.replaceAll("_", " ")}</strong><p>{action.recipient && <>Recipient: {action.recipient}<br/></>}Amount: {action.currency || "USD"} {action.amount || "—"}<br/>{(action.paypal_resource_id || action.capture_id) && <>PayPal resource: {action.capture_id || action.paypal_resource_id}<br/></>}Status: {action.status.replaceAll("_", " ")}</p>{action.details?.product?.name && <p>{action.details.product.name}</p>}{["order_create", "order_capture"].includes(action.kind) && <small>Sandbox purchase goes to the demo merchant. It does not buy from the retailer.</small>}{action.details?.invoice?.items?.map((item: any, i: number) => <div key={i}>{item.quantity} × {item.name} · USD {item.unitAmount}</div>)}{action.status === "awaiting_approval" && <div className="action-buttons"><a className="pill" target="_blank" rel="noreferrer" href={action.details?.approvalUrl}>Approve in PayPal</a><button className="side-action" onClick={() => void act(action, "approve")}>I approved in PayPal</button><button className="side-action" onClick={() => void act(action, "cancel")}>Cancel order</button></div>}{action.status === "pending_confirmation" && <><small>This confirmation expires in two minutes. Review the amount and PayPal resource above.</small><div className="action-buttons"><button className="pill" onClick={() => void act(action, "confirm")}>Confirm {action.kind === "invoice_send" ? "send" : action.kind === "refund" ? "refund" : "capture"}</button><button className="side-action" onClick={() => void act(action, "cancel")}>Cancel</button></div></>}{action.status === "reconciliation_required" && <><p role="alert">PayPal reported an uncertain result. Reconcile checks existing status and may repeat only the same idempotent request.</p><button className="pill" onClick={() => void act(action, "reconcile")}>Reconcile status</button></>}{action.status === "succeeded" && <p>Completed</p>}</div>)}
      <div ref={end}/></div></section>
    {error && <p className="error" role="alert" style={{ textAlign: "center", padding: "0 20px" }}>{error}</p>}
    <form className="composer" onSubmit={submit}><textarea ref={input} aria-label="Your message" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Write a message…" maxLength={12000}/><div className="compose-row"><span className="compose-hint">Text works without microphone access · attach .md or .txt context</span><div className="compose-tools"><button type="button" className="icon-button" aria-label="Attach Markdown or text file" onClick={() => fileInput.current?.click()}>＋</button><input ref={fileInput} hidden type="file" accept=".md,.txt,text/plain,text/markdown" onChange={e => { void uploadFile(e.target.files?.[0]); e.currentTarget.value = ""; }}/><Toggle.Root className="icon-button" pressed={phase !== "idle" && phase !== "error" && !muted} aria-label={phase === "idle" || phase === "error" ? "Start voice" : "Toggle microphone"} onPressedChange={pressed => { if (phase === "idle" || phase === "error") { if (pressed) void startVoice(); } else { setMuted(!pressed); client.current?.enableMic(pressed); } }}>♩</Toggle.Root>{phase !== "idle" && phase !== "error" && <button type="button" className="icon-button" aria-label="Stop voice session" onClick={() => void stopVoice()}>■</button>}<button className="send-button" aria-label="Send message" disabled={!text.trim() || busy}>{busy ? "…" : "↑"}</button></div></div><audio ref={audio} autoPlay playsInline/></form>
  </div>;
}
