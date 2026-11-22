import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, HeartPulse } from "lucide-react";
import api from "./lib/api";

const priorityText: Record<string, string> = { NORMAL: "সাধারণ", HIGH: "জরুরি", URGENT: "অতি জরুরি" };

export default function PatientFollowUps() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/patient/follow-ups").then(r => setItems(r.data.data || [])).catch(e => setError(e.response?.data?.error || "Follow-up তথ্য লোড করা যায়নি।")); }, []);
  return <main className="role-app"><header className="app-navbar"><div className="nav-inner"><a className="brand-logo" href="/patient/home"><span className="logo-icon"><HeartPulse size={20} /></span><span>MaternaCare <b>AI</b></span></a><a className="nav-back" href="/patient/home"><ArrowLeft size={16} /> হোমে ফিরুন</a></div></header><div className="page-container"><div className="page-header"><div><span className="page-eyebrow">আপনার care journey</span><h1>আমার follow-up</h1><p>স্বাস্থ্যকর্মী যে পরবর্তী কাজ দিয়েছেন, তার সময় ও ফলাফল এখানে দেখতে পারবেন।</p></div></div>{error && <p className="inline-error">{error}</p>}{!error && items.length === 0 && <section className="empty-card"><CalendarClock size={22} /><h3>এখনও কোনো follow-up নেই</h3><p>আপনার care plan-এ follow-up যোগ হলে এখানে দেখা যাবে।</p></section>}<div className="task-list patient-task-list">{items.map(item => <article className="task-card" key={item.id}><div><span className={`priority-pill ${item.priority.toLowerCase()}`}>{priorityText[item.priority] || item.priority}</span><h3>{item.title}</h3><p>{item.reason}</p>{item.dueAt && <small>তারিখ: {new Date(item.dueAt).toLocaleDateString("bn-BD")}</small>}{item.outcome && <p className="request-note success"><CheckCircle2 size={15} /> ফলাফল: {item.outcome}</p>}{item.nextAction && <small>পরবর্তী করণীয়: {item.nextAction}</small>}</div><span className="status-pill">{item.status === "COMPLETED" ? "সম্পন্ন" : "চলমান"}</span></article>)}</div></div></main>;
}
