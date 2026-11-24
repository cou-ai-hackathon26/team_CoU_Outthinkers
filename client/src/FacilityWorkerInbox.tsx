import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import api from "./lib/api";

const statusLabels: Record<string, string> = { DRAFT: "খসড়া", SENT: "গ্রহণের অপেক্ষায়", REJECTED: "Facility reject করেছে", ACKNOWLEDGED: "গ্রহণ করা হয়েছে", IN_TRANSIT: "পথে", ARRIVED: "পৌঁছেছে", ACCEPTED: "সেবা গ্রহণ করেছে", TRANSFERRED: "স্থানান্তরিত", COMPLETED: "সম্পন্ন", UNRESOLVED: "অমীমাংসিত" };

export default function FacilityWorkerInbox() {
  const [facility, setFacility] = useState<any>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get("/facility-worker/referrals");
      setFacility(result.data.data.facility);
      setItems(result.data.data.referrals || []);
    } catch (failure: any) {
      setError(failure.response?.data?.error || "Referral inbox আনা যায়নি।");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const decide = async (item: any, decision: "ACKNOWLEDGE" | "REJECT") => {
    const notes = decision === "REJECT" ? window.prompt("Referral reject করার কারণ লিখুন:")?.trim() : "";
    if (decision === "REJECT" && !notes) return;
    setBusy(item.id);
    setError("");
    setMessage("");
    try {
      await api.patch(`/facility-worker/referrals/${item.id}/decision`, { decision, notes });
      setMessage(decision === "ACKNOWLEDGE" ? "Referral গ্রহণ করা হয়েছে; প্রেরককে জানানো হয়েছে।" : "Reject করার কারণ নথিভুক্ত করে প্রেরককে জানানো হয়েছে।");
      await load();
    } catch (failure: any) {
      setError(failure.response?.data?.error || "Referral update করা যায়নি।");
    } finally {
      setBusy("");
    }
  };

  const pending = items.filter(item => item.status === "SENT").length;
  return <>
    <div className="page-header"><div><span className="page-eyebrow">facility referral handover</span><h1>{facility?.nameBn || "Referral inbox"}</h1><p>আপনার facility-তে পাঠানো referral দেখুন, গ্রহণ করুন অথবা কারণসহ reject করুন। প্রতিটি সিদ্ধান্ত timeline-এ সংরক্ষিত হবে।</p></div><button className="secondary-action" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button></div>
    <div className="stats-grid"><div className="stat-card"><span className="stat-icon"><CheckCircle2 size={19} /></span><div><small>গ্রহণের অপেক্ষায়</small><strong>{pending}</strong></div></div><div className="stat-card"><span className="stat-icon"><XCircle size={19} /></span><div><small>মোট referral</small><strong>{items.length}</strong></div></div></div>
    {facility?.status === "DRAFT" && <div className="facility-review-notice"><strong>Facility admin verification-এর অপেক্ষায়</strong><p>এই Google Maps result দিয়ে আপনার account যুক্ত হয়েছে। Admin যাচাই সম্পন্ন না করা পর্যন্ত facility-টি trusted referral suggestion হিসেবে দেখানো হবে না।</p></div>}
    {error && <p className="inline-error">{error}</p>}{message && <p className="success-message">{message}</p>}
    <section className="inbox-list">{loading && <div className="loading-card">Referral আনা হচ্ছে…</div>}{!loading && !error && items.length === 0 && <div className="empty-card"><span className="empty-icon"><CheckCircle2 size={21} /></span><h3>এখনও referral আসেনি</h3><p>আপনার facility-তে nurse referral পাঠালে এখানে দেখা যাবে।</p></div>}{items.map(item => <article className="intake-card" key={item.id}><div className="intake-card-top"><div><span className={`status-pill ${item.status === "REJECTED" ? "rejected" : ""}`}>{statusLabels[item.status] || item.status}</span><h3>{item.patientName}</h3><small>Patient ID: {item.patientId} · {item.patient?.patientProfile?.contactNumber || "যোগাযোগ নম্বর নেই"}</small></div><time>{new Date(item.createdAt).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" })}</time></div><div className="intake-transcript"><small>Referral-এর কারণ</small><p>{item.reason}</p></div><div className="referral-destination"><strong>প্রেরক: {item.ownerStaff?.staffProfile?.name || "স্বাস্থ্যকর্মী"}</strong><small>{item.ownerStaff?.staffProfile?.employeeId || item.ownerStaff?.email || item.ownerStaff?.phone || "যোগাযোগ তথ্য নেই"}</small></div>{item.status === "SENT" && <div className="referral-actions"><button className="complete-button" disabled={busy === item.id} onClick={() => void decide(item, "ACKNOWLEDGE")}><CheckCircle2 size={15} /> Referral গ্রহণ করুন</button><button className="danger-action" disabled={busy === item.id} onClick={() => void decide(item, "REJECT")}><XCircle size={15} /> কারণসহ reject</button></div>}<details className="referral-timeline"><summary>হস্তান্তরের history ({item.events.length})</summary>{item.events.map((event: any) => <div className="referral-event" key={event.id}><CheckCircle2 size={14} /><div><strong>{statusLabels[event.toStatus] || event.toStatus}</strong><small>{new Date(event.createdAt).toLocaleString("bn-BD")} · {event.source || "নথিভুক্ত"}</small>{event.notes && <p>{event.notes}</p>}</div></div>)}</details></article>)}</section>
  </>;
}
