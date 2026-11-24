import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Building2, MapPin, UserPlus } from "lucide-react";
import api from "./lib/api";

type AreaOption = { id: string; nameBn: string };
type FacilityOption = { id: string; nameBn: string; addressBn: string; phone?: string | null; distanceKm: number; verifiedAt?: string | null };
type GoogleHospital = { placeId: string; name: string; address: string; googleMapsUri?: string | null; distanceKm: number };

export default function AdminFacilityWorkerForm() {
  const [areas, setAreas] = useState<{ divisions: AreaOption[]; districts: AreaOption[]; upazilas: AreaOption[] }>({ divisions: [], districts: [], upazilas: [] });
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [googleHospitals, setGoogleHospitals] = useState<GoogleHospital[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [areaLabel, setAreaLabel] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", divisionId: "", districtId: "", upazilaId: "", facilityId: "" });

  useEffect(() => {
    api.get("/locations/divisions")
      .then(result => setAreas(current => ({ ...current, divisions: result.data.data || [] })))
      .catch(result => setError(result.response?.data?.error || "বিভাগের তালিকা আনা যায়নি।"))
      .finally(() => setLoadingAreas(false));
  }, []);

  useEffect(() => {
    if (!form.divisionId) return;
    api.get(`/locations/districts?divisionId=${encodeURIComponent(form.divisionId)}`)
      .then(result => setAreas(current => ({ ...current, districts: result.data.data || [] })))
      .catch(result => setError(result.response?.data?.error || "জেলার তালিকা আনা যায়নি।"));
  }, [form.divisionId]);

  useEffect(() => {
    if (!form.districtId) return;
    api.get(`/locations/upazilas?districtId=${encodeURIComponent(form.districtId)}`)
      .then(result => setAreas(current => ({ ...current, upazilas: result.data.data || [] })))
      .catch(result => setError(result.response?.data?.error || "উপজেলার তালিকা আনা যায়নি।"));
  }, [form.districtId]);

  useEffect(() => {
    if (!form.upazilaId) { setFacilities([]); setGoogleHospitals([]); setAreaLabel(""); return; }
    setLoadingHospitals(true);
    setError("");
    setForm(current => ({ ...current, facilityId: "" }));
    api.get(`/admin/facility-worker-options?upazilaId=${encodeURIComponent(form.upazilaId)}`)
      .then(result => {
        setFacilities(result.data.data.verifiedFacilities || []);
        setGoogleHospitals(result.data.data.googleSuggestions || []);
        setAreaLabel(result.data.data.area?.nameBn || "");
      })
      .catch(result => setError(result.response?.data?.error || "এলাকার hospital suggestion আনা যায়নি।"))
      .finally(() => setLoadingHospitals(false));
  }, [form.upazilaId]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.post("/admin/facility-workers", form);
      setSuccess(`Facility worker account তৈরি হয়েছে · কর্মী ID: ${result.data.account.employeeId}`);
      setForm({ name: "", email: "", phone: "", password: "", divisionId: "", districtId: "", upazilaId: "", facilityId: "" });
      setFacilities([]);
      setGoogleHospitals([]);
    } catch (failure: any) {
      setError(failure.response?.data?.error || "Facility worker account তৈরি করা যায়নি।");
    } finally {
      setBusy(false);
    }
  };

  return <section className="review-panel admin-facility-worker-form">
    <h2 className="section-title"><Building2 size={18} /> Facility worker account তৈরি করুন</h2>
    <p className="muted-copy">এলাকা নির্বাচন করলে Google Maps কাছের হাসপাতাল দেখাবে। account শুধু verified facility-তে যুক্ত হবে।</p>
    {error && <p className="inline-error">{error}</p>}
    {success && <p className="success-message">{success}</p>}
    <form className="task-form" onSubmit={create}>
      <input className="plain-input" placeholder="কর্মীর পূর্ণ নাম" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required />
      <input className="plain-input" type="email" placeholder="ইমেইল" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required />
      <input className="plain-input" type="tel" placeholder="মোবাইল নম্বর" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} required />
      <input className="plain-input" type="password" minLength={12} placeholder="কমপক্ষে ১২ অক্ষরের password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required />
      <select className="plain-input" value={form.divisionId} disabled={loadingAreas} onChange={event => setForm({ ...form, divisionId: event.target.value, districtId: "", upazilaId: "", facilityId: "" })} required>
        <option value="">{loadingAreas ? "বিভাগ আনা হচ্ছে…" : "বিভাগ নির্বাচন করুন"}</option>{areas.divisions.map(area => <option key={area.id} value={area.id}>{area.nameBn}</option>)}
      </select>
      <select className="plain-input" value={form.districtId} disabled={!form.divisionId} onChange={event => setForm({ ...form, districtId: event.target.value, upazilaId: "", facilityId: "" })} required>
        <option value="">জেলা নির্বাচন করুন</option>{areas.districts.map(area => <option key={area.id} value={area.id}>{area.nameBn}</option>)}
      </select>
      <select className="plain-input" value={form.upazilaId} disabled={!form.districtId} onChange={event => setForm({ ...form, upazilaId: event.target.value, facilityId: "" })} required>
        <option value="">উপজেলা নির্বাচন করুন</option>{areas.upazilas.map(area => <option key={area.id} value={area.id}>{area.nameBn}</option>)}
      </select>
      {areaLabel && <p className="success-message"><MapPin size={15} /> আনুমানিক এলাকা: {areaLabel}</p>}
      <div className="search-results">
        <strong>এই এলাকার verified facility {loadingHospitals ? "খোঁজা হচ্ছে…" : `(${facilities.length})`}</strong>
        {facilities.map(facility => <button type="button" key={facility.id} className={`patient-result ${form.facilityId === facility.id ? "selected" : ""}`} onClick={() => setForm({ ...form, facilityId: facility.id })}>
          <span><MapPin size={16} /></span><span><strong>{facility.nameBn}</strong><small>{facility.addressBn} · প্রায় {facility.distanceKm} km · Admin verified</small></span>
        </button>)}
        {!loadingHospitals && form.upazilaId && facilities.length === 0 && <small className="search-empty">এই এলাকার আশেপাশে directory-তে verified facility নেই।</small>}
      </div>
      {googleHospitals.length > 0 && <div className="unverified-facilities"><h4>Google Maps hospital suggestions <span>যাচাই হয়নি</span></h4><p>এগুলো directory-তে verified নয়; account-এ যুক্ত করার আগে Admin → Facilities থেকে যাচাই করুন।</p>{googleHospitals.map(hospital => <div className="unverified-facility-row" key={hospital.placeId}><div><strong>{hospital.name}</strong><small>{hospital.address} · প্রায় {hospital.distanceKm} km</small></div>{hospital.googleMapsUri && <a href={hospital.googleMapsUri} target="_blank" rel="noreferrer">Maps-এ দেখুন</a>}</div>)}</div>}
      <button className="primary-action" type="submit" disabled={busy || loadingHospitals || !form.facilityId}><UserPlus size={16} /> {busy ? "তৈরি হচ্ছে…" : "Facility worker তৈরি করুন"}</button>
    </form>
  </section>;
}
