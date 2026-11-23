import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import api from "./lib/api";

export default function WorkerNotifications() {
  const [items, setItems] = useState<any[]>([]); const [error, setError] = useState("");
  const load = () => api.get("/staff/notifications").then(r => setItems(r.data.data || [])).catch(e => setError(e.response?.data?.error || "Notification লোড করা যায়নি।"));
  useEffect(() => { void load(); }, []);
  const markRead = async (id: string) => { try { await api.patch(`/staff/notifications/${id}/read`); await load(); } catch (e: any) { setError(e.response?.data?.error || "Notification update করা যায়নি।"); } };
  return <Layout><div className="page-header"><div><span className="page-eyebrow">in-app reminders</span><h1>Notifications</h1><p>নতুন task, referral update এবং operational reminder এখানে দেখা যাবে।</p></div></div>{error && <p className="inline-error">{error}</p>}<section className="notification-list">{items.length === 0 && <div className="loading-card">এখনও কোনো notification নেই।</div>}{items.map(item => <article className={`notification-card ${item.readAt ? "read" : "unread"}`} key={item.id}><span className="notification-icon"><Bell size={17} /></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString("bn-BD")}</small></div>{!item.readAt && <button className="complete-button" onClick={() => void markRead(item.id)}><Check size={14} /> পড়েছি</button>}</article>)}</section></Layout>;
}

function Layout({ children }: { children: React.ReactNode }) { return <main className="role-app"><header className="app-navbar"><div className="nav-inner"><a className="brand-logo" href="/worker/home"><span className="logo-icon">MC</span><span>MaternaCare <b>AI</b></span></a><nav className="nav-links open"><a href="/worker/home">হোম</a><a className="active" href="/worker/notifications">Notifications</a><a href="/worker/follow-ups">Follow-up</a><a href="/worker/referrals">Referral</a></nav></div></header><main className="page-container">{children}</main></main>;
}
