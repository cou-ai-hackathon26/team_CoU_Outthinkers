import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Building2, UserPlus } from "lucide-react";
import api from "./lib/api";

type FacilityOption = { id: string; nameBn: string; addressBn: string };

export default function AdminFacilityWorkerForm() {
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", facilityId: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api.get("/admin/facility-worker-options")
      .then(result => setFacilities(result.data.data || []))
      .catch(result => setError(result.response?.data?.error || "Facility list আনা যায়নি।"))
      .finally(() => setLoading(false));
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.post("/admin/facility-workers", form);
      setSuccess(`Facility worker account তৈরি হয়েছে · কর্মী ID: ${result.data.account.employeeId}`);
      setForm({ name: "", email: "", phone: "", password: "", facilityId: "" });
    } catch (failure: any) {
      setError(failure.response?.data?.error || "Facility worker account তৈরি করা যায়নি।");
    } finally {
      setBusy(false);
    }
  };

  return <section className="review-panel admin-facility-worker-form">
    <h2 className="section-title"><Building2 size={18} /> Facility worker account তৈরি করুন</h2>
    <p className="muted-copy">শুধু admin-verified facility নির্বাচন করা যাবে।</p>
    {error && <p className="inline-error">{error}</p>}
    {success && <p className="success-message">{success}</p>}
    <form className="task-form" onSubmit={create}>
      <input className="plain-input" placeholder="কর্মীর পূর্ণ নাম" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required />
      <input className="plain-input" type="email" placeholder="ইমেইল" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required />
      <input className="plain-input" type="tel" placeholder="মোবাইল নম্বর" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} required />
      <input className="plain-input" type="password" minLength={12} placeholder="কমপক্ষে ১২ অক্ষরের password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required />
      <select className="plain-input" value={form.facilityId} onChange={event => setForm({ ...form, facilityId: event.target.value })} disabled={loading || facilities.length === 0} required>
        <option value="">{loading ? "Facility আনা হচ্ছে…" : facilities.length ? "Verified facility নির্বাচন করুন" : "কোনো verified facility নেই"}</option>
        {facilities.map(facility => <option key={facility.id} value={facility.id}>{facility.nameBn} · {facility.addressBn}</option>)}
      </select>
      <button className="primary-action" type="submit" disabled={busy || loading || facilities.length === 0}><UserPlus size={16} /> {busy ? "তৈরি হচ্ছে…" : "Facility worker তৈরি করুন"}</button>
    </form>
  </section>;
}
