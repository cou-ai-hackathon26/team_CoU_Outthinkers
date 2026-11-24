import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import api from "./lib/api";

export default function FacilityWorkerNotifications() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (initial = false) => {
    try {
      const result = await api.get("/facility-worker/notifications");
      setItems(result.data.data || []);
      setError("");
    } catch (failure: any) {
      setError(failure.response?.data?.error || "Notification আনা যায়নি।");
    } finally {
      if (initial) setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const markRead = async (id: string) => {
    try {
      await api.patch(`/facility-worker/notifications/${id}/read`);
      await load();
    } catch (failure: any) {
      setError(failure.response?.data?.error || "Notification update করা যায়নি।");
    }
  };

  const unread = items.filter(item => !item.readAt).length;
  return <><div className="page-header"><div><span className="page-eyebrow">facility updates</span><h1>Notifications</h1><p>নতুন referral ও referral-এর status update এখানে দেখবেন।</p></div><span className="status-pill warning">না-পড়া {unread}</span></div>{error && <p className="inline-error">{error}</p>}<section className="notification-list">{loading && <div className="loading-card">Notification আনা হচ্ছে…</div>}{!loading && !error && items.length === 0 && <div className="empty-card"><Bell size={20} /><h3>এখনও কোনো notification নেই</h3><p>আপনার facility-তে referral পাঠানো হলে এখানে দেখা যাবে।</p></div>}{items.map(item => <article className={`notification-card ${item.readAt ? "read" : "unread"}`} key={item.id}><span className="notification-icon"><Bell size={17} /></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" })}</small></div>{!item.readAt && <button className="complete-button" onClick={() => void markRead(item.id)}><Check size={14} /> পড়েছি</button>}</article>)}</section></>;
}
