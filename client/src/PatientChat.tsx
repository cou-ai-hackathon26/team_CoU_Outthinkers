import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Bot, CheckCircle2, HeartPulse, Home, LogOut, MessageCircle, Mic, UserRound, X } from "lucide-react";
import api from "./lib/api";

type ChatMessage = { id?: string; role: "USER" | "ASSISTANT"; content: string; urgency?: string | null };

function logout() { localStorage.removeItem("maternacare_token"); window.location.href = "/login"; }

export default function PatientChat() {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [suggestedAction, setSuggestedAction] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await api.get("/patient/chat/sessions");
        const latest = list.data.data?.[0];
        const session = latest ? await api.get(`/patient/chat/sessions/${latest.id}`) : await api.post("/patient/chat/sessions");
        if (!active) return;
        const data = session.data.data;
        setSessionId(data.id);
        setMessages(data.messages || []);
      } catch (e: any) { if (active) setError(e.response?.data?.error || "সহায়তা সেবা লোড করা যায়নি।"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || !sessionId || busy) return;
    setBusy(true); setError(""); setText("");
    setMessages(current => [...current, { role: "USER", content }]);
    const streamingId = `streaming-${Date.now()}`;
    try {
      const token = localStorage.getItem("maternacare_token");
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
      const result = await fetch(`${baseUrl}/patient/chat/sessions/${sessionId}/messages/stream`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ content }) });
      if (!result.ok || !result.body) { const body = await result.json().catch(() => ({})); throw new Error(body.error || "উত্তর পাওয়া যায়নি।"); }
      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const processEvent = (event: string) => {
        const line = event.split(/\r?\n/).find(item => item.startsWith("data:"));
        if (!line) return;
        const data = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; urgency?: string; red_flags?: string[]; suggested_action?: string; message?: string };
        if (data.type === "delta" && data.text) { const delta = data.text; setMessages(current => { const last = current[current.length - 1]; if (last?.id === streamingId) return [...current.slice(0, -1), { ...last, content: last.content + delta }]; return [...current, { id: streamingId, role: "ASSISTANT", content: delta }]; }); }
        if (data.type === "done") { setRedFlags(data.red_flags || []); setSuggestedAction(data.suggested_action || ""); }
        if (data.type === "error") throw new Error(data.message || "Chat service unavailable");
      };
      while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); const events = buffer.split(/\r?\n\r?\n/); buffer = events.pop() || ""; events.forEach(processEvent); }
      if (buffer.trim()) processEvent(buffer);
    } catch (e: any) {
      setMessages(current => current.filter(message => message.id !== streamingId));
      setText(content);
      setError(e.message || e.response?.data?.error || "উত্তর পাওয়া যায়নি। আবার চেষ্টা করুন।");
    } finally { setBusy(false); }
  };

  return <div className="role-app patient-chat-page">
    <header className="app-navbar"><div className="nav-inner"><a className="brand-logo" href="/patient/home"><span className="logo-icon"><HeartPulse size={20} /></span><span>MaternaCare <b>AI</b></span></a><nav className="nav-links"><a href="/patient/home"><Home size={17} /> আমার হোম</a><a href="/patient/voice-intake"><Mic size={17} /> কথা বলে তথ্য দিন</a><a className="active" href="/patient/chat"><MessageCircle size={17} /> AI সহায়তা</a><a href="/patient/requests"><CheckCircle2 size={17} /> আমার অনুরোধ</a><a href="/patient/profile"><UserRound size={17} /> আমার প্রোফাইল</a><button className="nav-logout" onClick={logout}><LogOut size={17} /> বের হোন</button></nav></div></header>
    <main className="page-container">
      <div className="page-header"><div><span className="page-eyebrow">Bengali health assistant</span><h1>আপনার কথা বলুন</h1><p>আপনার সমস্যা সহজ ভাষায় লিখুন। আমি সাধারণ তথ্য ও পরবর্তী নিরাপদ পদক্ষেপ জানাতে পারি।</p></div><a className="secondary-action" href="/patient/voice-intake"><Mic size={16} /> voice intake</a></div>
      <section className="chat-shell"><div className="chat-intro"><span className="chat-avatar"><Bot size={24} /></span><div><h2>MaternaCare সহায়তা</h2><p>বাংলায় প্রশ্ন করুন · আপনার তথ্য গোপনীয়ভাবে সংরক্ষিত</p></div></div>
        <div className="chat-disclaimer">এটি চিকিৎসা নির্ণয় বা প্রেসক্রিপশন নয়। জরুরি লক্ষণ থাকলে AI-এর উত্তরের জন্য অপেক্ষা না করে নিকটস্থ হাসপাতাল বা স্বাস্থ্যকেন্দ্রে যোগাযোগ করুন।</div>
        <div className="chat-messages">{loading && <div className="loading-card">সহায়তা প্রস্তুত হচ্ছে…</div>}{!loading && messages.length === 0 && <div className="chat-empty"><MessageCircle size={28} /><strong>কী জানতে চান?</strong><span>যেমন: গর্ভাবস্থায় কোমর ব্যথা হলে কী করা উচিত?</span></div>}{messages.map((message, index) => <div className={`chat-bubble ${message.role === "USER" ? "user" : "assistant"}`} key={message.id || `${message.role}-${index}`}><small>{message.role === "USER" ? "আপনি" : "MaternaCare AI"}</small><p>{message.content}</p></div>)}</div>
        {(redFlags.length > 0 || suggestedAction) && <div className="chat-alert"><div><X size={19} /><strong>জরুরি সতর্কতা</strong></div><p>{redFlags.length ? `উল্লেখিত লক্ষণ: ${redFlags.join(", ")}` : "আপনার কথায় সতর্কতার প্রয়োজন হতে পারে।"}</p><strong>{suggestedAction}</strong></div>}
        {error && <p className="inline-error">{error}</p>}
        <form className="chat-composer" onSubmit={send}><textarea value={text} onChange={event => setText(event.target.value)} placeholder="আপনার সমস্যা বা প্রশ্ন লিখুন…" rows={2} maxLength={4000} disabled={loading || busy} /><button className="primary-action" disabled={loading || busy || !text.trim()}>{busy ? "উত্তর তৈরি হচ্ছে…" : "পাঠান"} <ArrowRight size={16} /></button></form>
      </section>
    </main><footer className="app-footer">© ২০২৬ MaternaCare AI · নিরাপদ মাতৃ ও নবজাতকের যত্ন</footer>
  </div>;
}
