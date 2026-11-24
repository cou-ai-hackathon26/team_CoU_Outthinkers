import { useEffect, useState } from "react";
import { Activity, MapPin, RefreshCw } from "lucide-react";
import api from "./lib/api";

const labels: Record<string, string> = {
  DRAFT: "তৈরি হচ্ছে", SENT: "Facility-তে পাঠানো হয়েছে", ACKNOWLEDGED: "Facility গ্রহণ করেছে", REJECTED: "Facility গ্রহণ করতে পারেনি",
  IN_TRANSIT: "যাওয়ার ব্যবস্থা চলছে", ARRIVED: "Facility-তে পৌঁছেছেন", ACCEPTED: "Facility আপনাকে গ্রহণ করেছে", TRANSFERRED: "স্থানান্তর নথিভুক্ত", COMPLETED: "সম্পন্ন", UNRESOLVED: "স্বাস্থ্যকর্মীর follow-up প্রয়োজন",
};

const hints: Record<string, string> = {
  DRAFT: "স্বাস্থ্যকর্মী referral প্রস্তুত করছেন।",
  SENT: "Facility-এর জবাবের অপেক্ষায়। আপনার স্বাস্থ্যকর্মীও এই অবস্থা দেখতে পারবেন।",
  ACKNOWLEDGED: "Facility referral পাওয়ার কথা নিশ্চিত করেছে।",
  REJECTED: "Facility referral গ্রহণ করতে পারেনি। আপনার স্বাস্থ্যকর্মী পরবর্তী ব্যবস্থা দেখবেন।",
  IN_TRANSIT: "Facility-তে যাওয়ার ব্যবস্থা নথিভুক্ত হয়েছে।",
  ARRIVED: "Facility-তে পৌঁছানোর তথ্য নথিভুক্ত হয়েছে।",
  ACCEPTED: "Facility আপনাকে গ্রহণ করেছে।",
  TRANSFERRED: "স্থানান্তরের তথ্য নথিভুক্ত হয়েছে।",
  COMPLETED: "Referral-এর outcome নথিভুক্ত হয়েছে।",
  UNRESOLVED: "স্বাস্থ্যকর্মীকে follow-up করতে হবে।",
};

export default function PatientReferrals() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (initial = false) => {
    try {
      const result = await api.get("/patient/referrals");
      setItems(result.data.data || []);
      setError("");
    } catch (failure: any) {
      setError(failure.response?.data?.error || "Referral-এর অবস্থা আনা যায়নি।");
    } finally {
      if (initial) setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, []);

  return <section className="patient-referrals">
    <div className="section-heading"><div><h2>Referral-এর অবস্থা</h2><p>স্বাস্থ্যকর্মী ও facility থেকে পাওয়া update এখানে দেখা যাবে।</p></div><button className="secondary-action" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> হালনাগাদ</button></div>
    {error && <p className="inline-error">{error}</p>}
    {loading && <div className="loading-card">Referral-এর অবস্থা আনা হচ্ছে…</div>}
    {!loading && !error && items.length === 0 && <div className="empty-card patient-referral-empty"><Activity size={19} /><strong>এখনও কোনো referral নেই</strong><span>স্বাস্থ্যকর্মী আপনার জন্য referral তৈরি করলে এখানে দেখা যাবে।</span></div>}
    <div className="patient-referral-list">{items.map(item => {
      const destination = item.facility?.nameBn || item.destinationName;
      const events = item.events || [];
      return <article className="patient-referral-card" key={item.id}>
        <div className="patient-referral-card-head"><div><span className={`status-pill ${["REJECTED", "UNRESOLVED"].includes(item.status) ? "rejected" : item.status === "COMPLETED" ? "success" : "warning"}`}>{labels[item.status] || item.status}</span><h3>{destination || "স্বাস্থ্যকেন্দ্রে referral"}</h3></div><time>{new Date(item.updatedAt).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" })}</time></div>
        <p className="patient-referral-reason">{item.reason}</p>
        {(item.facility?.addressBn || item.destinationContact || item.facility?.phone) && <div className="patient-referral-destination"><MapPin size={15} /><span>{item.facility?.addressBn || ""}{(item.destinationContact || item.facility?.phone) && <small>যোগাযোগ: {item.facility?.phone || item.destinationContact}</small>}</span></div>}
        <p className="patient-referral-hint">{hints[item.status] || "স্বাস্থ্যকর্মী referral-এর অবস্থা update করছেন।"}</p>
        {item.dueAt && <small className="patient-referral-due">পরবর্তী যোগাযোগের সময়: {new Date(item.dueAt).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" })}</small>}
        <ol className="patient-referral-timeline">{events.map((event: any) => <li key={event.id}><span className="timeline-dot" /><span>{labels[event.toStatus] || event.toStatus}</span><time>{new Date(event.createdAt).toLocaleString("bn-BD", { dateStyle: "short", timeStyle: "short" })}</time></li>)}</ol>
      </article>;
    })}</div>
  </section>;
}
