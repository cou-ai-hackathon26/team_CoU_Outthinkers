import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Eye, EyeOff, HeartPulse, LockKeyhole, Mail, MapPin, MessageCircle, Phone, ShieldCheck, UserPlus, UserRound, UsersRound, UserCog, LogOut, RefreshCw } from "lucide-react";
import api from "./lib/api";

type Role = "patient" | "staff";
type Screen = "login" | "otp" | "forgot" | "reset" | "register" | "admin";
type LocationOption = { id: string; nameBn: string; nameEn: string };

  const roleCopy = {
  patient: { label: "রোগী", hint: "Patient ID, মোবাইল বা ইমেইল দিয়ে প্রবেশ করুন" },
  staff: { label: "নার্স / কমিউনিটি হেলথ ওয়ার্কার", hint: "কর্মী আইডি বা ইমেইল দিয়ে প্রবেশ করুন" },
};

const emptyRegistration = { name: "", email: "", dateOfBirth: "", phone: "", emergencyContactNumber: "", divisionId: "", districtId: "", upazilaId: "", address: "" };
const emptyManagedAccount = { name: "", email: "", phone: "", password: "", address: "", divisionId: "", districtId: "", upazilaId: "" };

function App() {
  const tokenFromUrl = new URLSearchParams(window.location.search).get("token") || "";
  const [screen, setScreen] = useState<Screen>(tokenFromUrl ? "reset" : "login");
  const [role, setRole] = useState<Role>("patient");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken] = useState(tokenFromUrl);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registration, setRegistration] = useState(emptyRegistration);
  const [managedType, setManagedType] = useState<"NURSE" | "ADMIN">("NURSE");
  const [managedAccount, setManagedAccount] = useState(emptyManagedAccount);
  const [divisions, setDivisions] = useState<LocationOption[]>([]);
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [upazilas, setUpazilas] = useState<LocationOption[]>([]);
  const [overview, setOverview] = useState<{ counts: { patients: number; nurses: number; admins: number }; recentPatients: Array<{ id: string; name: string; createdAt: string }>; recentStaff: Array<{ id: string; name: string; email: string | null; createdAt: string }> } | null>(null);

  const clearFeedback = () => { setMessage(""); setError(""); };
  const clearForms = () => {
    setIdentifier(""); setPassword(""); setOtp("");
    setRegistration(emptyRegistration); setManagedAccount(emptyManagedAccount);
  };
  const goLogin = () => { clearFeedback(); clearForms(); setScreen("login"); };

  useEffect(() => {
    // Do not keep sensitive form values after a browser refresh.
    clearForms();
  }, []);

  useEffect(() => {
    if (screen !== "register" && screen !== "admin") return;
    api.get("/locations/divisions").then((result) => setDivisions(result.data.data)).catch(() => setError("এলাকার তথ্য আনা যায়নি।"));
  }, [screen]);

  useEffect(() => {
    const divisionId = screen === "admin" ? managedAccount.divisionId : registration.divisionId;
    if (!divisionId) { setDistricts([]); setUpazilas([]); return; }
    api.get("/locations/districts", { params: { divisionId } }).then((result) => setDistricts(result.data.data)).catch(() => setError("জেলার তথ্য আনা যায়নি।"));
  }, [screen, registration.divisionId, managedAccount.divisionId]);

  useEffect(() => {
    const districtId = screen === "admin" ? managedAccount.districtId : registration.districtId;
    if (!districtId) { setUpazilas([]); return; }
    api.get("/locations/upazilas", { params: { districtId } }).then((result) => setUpazilas(result.data.data)).catch(() => setError("উপজেলার তথ্য আনা যায়নি।"));
  }, [screen, registration.districtId, managedAccount.districtId]);

  useEffect(() => {
    if (screen !== "admin") return;
    api.get("/admin/overview", { headers: { Authorization: `Bearer ${localStorage.getItem("maternacare_token")}` } }).then((result) => setOverview(result.data.data)).catch((requestError) => setError(requestError.response?.data?.error || "ড্যাশবোর্ডের তথ্য আনা যায়নি।"));
  }, [screen]);

  async function submitLogin(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setBusy(true);
    try {
      if (role === "patient") {
        const result = await api.post("/auth/patient/request-otp", { identifier });
        setChallengeId(result.data.challengeId || ""); setScreen("otp");
        setMessage("আপনার নিবন্ধিত যোগাযোগ মাধ্যমে OTP পাঠানো হয়েছে।");
      } else {
        const result = await api.post("/auth/staff/login", { identifier, password });
        localStorage.setItem("maternacare_token", result.data.token);
        if (result.data.role === "ADMIN") setScreen("admin"); else setMessage("লগইন সফল হয়েছে।");
      }
    } catch (requestError: any) { setError(requestError.response?.data?.error || "দুঃখিত, অনুরোধটি সম্পন্ন করা যায়নি।"); }
    finally { setBusy(false); }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setBusy(true);
    try {
      const result = await api.post("/auth/patient/verify-otp", { challengeId, code: otp });
      localStorage.setItem("maternacare_token", result.data.token); setMessage(`স্বাগতম। Patient ID: ${result.data.patientId || ""}`);
    } catch (requestError: any) { setError(requestError.response?.data?.error || "OTP সঠিক নয়। আবার চেষ্টা করুন।"); }
    finally { setBusy(false); }
  }

  async function requestReset(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setBusy(true);
    try { const result = await api.post("/auth/staff/forgot-password", { identifier }); setMessage(result.data.message); }
    catch (requestError: any) { setError(requestError.response?.data?.error || "অনুরোধটি সম্পন্ন করা যায়নি।"); }
    finally { setBusy(false); }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setBusy(true);
    try { const result = await api.post("/auth/staff/reset-password", { token: resetToken, password }); setMessage(result.data.message); setScreen("login"); setPassword(""); }
    catch (requestError: any) { setError(requestError.response?.data?.error || "পাসওয়ার্ড পরিবর্তন করা যায়নি।"); }
    finally { setBusy(false); }
  }

  async function registerPatient(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setBusy(true);
    try {
      const result = await api.post("/auth/patients/register", registration);
      setIdentifier(result.data.patientId || registration.phone); setRole("patient"); setScreen("login");
      setMessage(`নিবন্ধন সফল হয়েছে। আপনার Patient ID: ${result.data.patientId}`);
    } catch (requestError: any) { setError(requestError.response?.data?.error || "নিবন্ধন সম্পন্ন করা যায়নি।"); }
    finally { setBusy(false); }
  }

  async function createManagedAccount(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setBusy(true);
    try {
      const result = await api.post(`/admin/${managedType === "NURSE" ? "nurses" : "admins"}`, managedAccount, { headers: { Authorization: `Bearer ${localStorage.getItem("maternacare_token")}` } });
      setMessage(`${result.data.message} ${result.data.account.employeeId ? `Employee ID: ${result.data.account.employeeId}` : ""}`);
      setManagedAccount({ name: "", email: "", phone: "", password: "", address: "", divisionId: "", districtId: "", upazilaId: "" });
    } catch (requestError: any) { setError(requestError.response?.data?.error || "অ্যাকাউন্ট তৈরি করা যায়নি।"); }
    finally { setBusy(false); }
  }

  const title = screen === "otp" ? "আপনার OTP দিন" : screen === "forgot" ? "পাসওয়ার্ড ফিরে পান" : screen === "reset" ? "নতুন পাসওয়ার্ড দিন" : screen === "register" ? "নতুন patient account" : screen === "admin" ? "অ্যাডমিন কন্ট্রোল সেন্টার" : "আপনার যত্ন, আরও সহজে";
  const intro = screen === "login" ? "আপনার পরিচয় নির্বাচন করে শুরু করুন" : screen === "otp" ? "আপনার ফোন বা ইমেইলে পাঠানো ৬ সংখ্যার কোডটি লিখুন" : screen === "forgot" ? "আপনার ইমেইল বা কর্মী আইডি দিন" : screen === "register" ? "কয়েকটি সহজ তথ্য দিয়ে নিবন্ধন সম্পন্ন করুন" : screen === "admin" ? "নিরাপদভাবে নতুন team member তৈরি করুন" : "নিরাপদ একটি নতুন পাসওয়ার্ড তৈরি করুন";

  return <main className="app-shell">
    <section className="brand-panel"><div className="brand-mark"><HeartPulse size={25} strokeWidth={2.5} /></div><p className="eyebrow">মাতৃ ও নবজাতকের যত্ন</p><h1>আপনার পাশে,<br /><span>প্রতিটি ধাপে।</span></h1><p className="brand-description">সহজে তথ্য দিন, প্রয়োজনীয় সহায়তা পান এবং আপনার যত্নের যাত্রা এক জায়গায় রাখুন।</p><div className="trust-row"><ShieldCheck size={18} /><span>নিরাপদ ও গোপনীয়</span><span className="dot">•</span><span>বাংলাদেশের জন্য তৈরি</span></div><div className="soft-orb orb-one" /><div className="soft-orb orb-two" /></section>
    <section className="auth-panel"><div className="auth-card">
      {screen !== "login" && <button className="back-button" onClick={goLogin}><ArrowLeft size={18} /> ফিরে যান</button>}
      <div className="mobile-brand"><div className="brand-mark"><HeartPulse size={22} /></div><span>MaternaCare</span></div>
      <p className="eyebrow teal">MaternaCare AI</p><h2>{title}</h2><p className="form-intro">{intro}</p>
      {screen === "login" && <form onSubmit={submitLogin} autoComplete="off">
        <label className="field-label" htmlFor="role">আপনি কে?</label><div className="role-switch" id="role">{(Object.keys(roleCopy) as Role[]).map((item) => <button type="button" key={item} className={role === item ? "role-option selected" : "role-option"} onClick={() => { setRole(item); clearFeedback(); }}><span className="role-icon">{item === "patient" ? <UserRound size={19} /> : <ShieldCheck size={19} />}</span><span><strong>{roleCopy[item].label}</strong><small>{roleCopy[item].hint}</small></span></button>)}</div>
        <label className="field-label" htmlFor="identifier">{role === "patient" ? "Patient ID অথবা ইমেইল" : "কর্মী ID বা ইমেইল"}</label><div className="input-wrap"><UserRound size={19} /><input id="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={role === "patient" ? "যেমন: 00000001 বা email@example.com" : "আপনার ID বা ইমেইল লিখুন"} autoComplete="off" required /></div>
        {role === "staff" && <><label className="field-label" htmlFor="password">পাসওয়ার্ড</label><div className="input-wrap"><LockKeyhole size={19} /><input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="পাসওয়ার্ড লিখুন" autoComplete="off" required /><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label="পাসওয়ার্ড দেখুন">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><button type="button" className="text-link forgot-link" onClick={() => { clearFeedback(); setScreen("forgot"); }}>পাসওয়ার্ড ভুলে গেছেন?</button></>}
        <button className="primary-button" disabled={busy}>{busy ? "অপেক্ষা করুন…" : role === "patient" ? "OTP পাঠান" : "নিরাপদে প্রবেশ করুন"}<span>→</span></button>{role === "patient" && <><p className="support-note"><MessageCircle size={16} /> OTP দিয়ে নিরাপদে প্রবেশ করুন—পাসওয়ার্ড মনে রাখার প্রয়োজন নেই।</p><button type="button" className="register-card" onClick={() => { clearFeedback(); setScreen("register"); }}><span className="register-card-icon"><UserPlus size={21} /></span><span><strong>নতুন patient account খুলুন</strong><small>কয়েক মিনিটে নিবন্ধন সম্পন্ন করুন</small></span><span className="register-card-arrow">→</span></button></>}
      </form>}
      {screen === "register" && <form onSubmit={registerPatient} className="registration-form" autoComplete="off">
        <div className="form-grid"><div><label className="field-label" htmlFor="patient-name">পূর্ণ নাম</label><div className="input-wrap"><UserRound size={18} /><input id="patient-name" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} placeholder="আপনার নাম" required /></div></div><div><label className="field-label" htmlFor="patient-dob">জন্মতারিখ</label><div className="input-wrap"><CalendarDays size={18} /><input id="patient-dob" type="date" value={registration.dateOfBirth} onChange={(event) => setRegistration({ ...registration, dateOfBirth: event.target.value })} required /></div></div></div>
        <label className="field-label" htmlFor="patient-phone">নিজের মোবাইল নম্বর</label><div className="input-wrap"><Phone size={18} /><input id="patient-phone" type="tel" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} placeholder="01XXXXXXXXX" required /></div>
        <label className="field-label" htmlFor="patient-email">ইমেইল <span className="optional">(ঐচ্ছিক)</span></label><div className="input-wrap"><Mail size={18} /><input id="patient-email" type="email" value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} placeholder="আপনার ইমেইল" /></div>
        <label className="field-label" htmlFor="emergency-phone">জরুরি যোগাযোগের নম্বর</label><div className="input-wrap"><Phone size={18} /><input id="emergency-phone" type="tel" value={registration.emergencyContactNumber} onChange={(event) => setRegistration({ ...registration, emergencyContactNumber: event.target.value })} placeholder="স্বামী, বাবা-মা বা অভিভাবকের নম্বর" required /></div>
        <div className="form-grid"><div><label className="field-label" htmlFor="division">বিভাগ</label><div className="select-wrap"><MapPin size={18} /><select id="division" value={registration.divisionId} onChange={(event) => setRegistration({ ...registration, divisionId: event.target.value, districtId: "", upazilaId: "" })} required><option value="">বিভাগ নির্বাচন করুন</option>{divisions.map((item) => <option key={item.id} value={item.id}>{item.nameBn}</option>)}</select></div></div><div><label className="field-label" htmlFor="district">জেলা</label><div className="select-wrap"><MapPin size={18} /><select id="district" value={registration.districtId} onChange={(event) => setRegistration({ ...registration, districtId: event.target.value, upazilaId: "" })} disabled={!registration.divisionId} required><option value="">জেলা নির্বাচন করুন</option>{districts.map((item) => <option key={item.id} value={item.id}>{item.nameBn}</option>)}</select></div></div></div>
        <label className="field-label" htmlFor="upazila">উপজেলা</label><div className="select-wrap"><MapPin size={18} /><select id="upazila" value={registration.upazilaId} onChange={(event) => setRegistration({ ...registration, upazilaId: event.target.value })} disabled={!registration.districtId} required><option value="">উপজেলা নির্বাচন করুন</option>{upazilas.map((item) => <option key={item.id} value={item.id}>{item.nameBn}</option>)}</select></div>
        <label className="field-label" htmlFor="patient-address">বিস্তারিত ঠিকানা</label><textarea id="patient-address" value={registration.address} onChange={(event) => setRegistration({ ...registration, address: event.target.value })} placeholder="গ্রাম, বাড়ি/রোড, ইউনিয়ন" rows={3} required />
        <button className="primary-button" disabled={busy}>{busy ? "নিবন্ধন হচ্ছে…" : "নিবন্ধন সম্পন্ন করুন"}<span>→</span></button>
      </form>}
      {screen === "admin" && <>
        <div className="admin-toolbar"><span className="admin-status"><ShieldCheck size={16} /> অ্যাডমিন মোড</span><button type="button" className="logout-button" onClick={() => { localStorage.removeItem("maternacare_token"); clearForms(); setOverview(null); setScreen("login"); }}> <LogOut size={15} /> লগআউট</button></div>
        <div className="overview-grid"><div className="overview-card"><span className="overview-icon patients"><UsersRound size={19} /></span><small>সক্রিয় patient</small><strong>{overview?.counts.patients ?? "—"}</strong></div><div className="overview-card"><span className="overview-icon nurses"><UserCog size={19} /></span><small>নার্স / CHW</small><strong>{overview?.counts.nurses ?? "—"}</strong></div><div className="overview-card"><span className="overview-icon admins"><ShieldCheck size={19} /></span><small>অ্যাডমিন</small><strong>{overview?.counts.admins ?? "—"}</strong></div></div>
        <div className="admin-section-heading"><div><strong>দ্রুত কাজ</strong><small>নতুন team member যোগ করুন</small></div><button type="button" className="refresh-button" onClick={() => setScreen("admin")}><RefreshCw size={15} /> Refresh</button></div>
        <form onSubmit={createManagedAccount} className="registration-form" autoComplete="off">
        <div className="admin-tabs"><button type="button" className={managedType === "NURSE" ? "admin-tab active" : "admin-tab"} onClick={() => setManagedType("NURSE")}>নার্স / CHW</button><button type="button" className={managedType === "ADMIN" ? "admin-tab active" : "admin-tab"} onClick={() => setManagedType("ADMIN")}>নতুন অ্যাডমিন</button></div>
        {managedType === "NURSE" && <><label className="field-label" htmlFor="managed-name">পূর্ণ নাম</label><div className="input-wrap"><UserRound size={18} /><input id="managed-name" value={managedAccount.name} onChange={(event) => setManagedAccount({ ...managedAccount, name: event.target.value })} placeholder="কর্মীর নাম" required /></div><div className="form-grid"><div><label className="field-label" htmlFor="managed-email">ইমেইল</label><div className="input-wrap"><Mail size={18} /><input id="managed-email" type="email" value={managedAccount.email} onChange={(event) => setManagedAccount({ ...managedAccount, email: event.target.value })} placeholder="কর্মীর ইমেইল" required /></div></div><div><label className="field-label" htmlFor="managed-phone">মোবাইল</label><div className="input-wrap"><Phone size={18} /><input id="managed-phone" value={managedAccount.phone} onChange={(event) => setManagedAccount({ ...managedAccount, phone: event.target.value })} placeholder="01XXXXXXXXX" required /></div></div></div><label className="field-label" htmlFor="managed-address">ঠিকানা</label><textarea id="managed-address" value={managedAccount.address} onChange={(event) => setManagedAccount({ ...managedAccount, address: event.target.value })} placeholder="ঠিকানা" rows={2} required /><div className="form-grid"><div><label className="field-label" htmlFor="managed-division">বিভাগ</label><div className="select-wrap"><MapPin size={18} /><select id="managed-division" value={managedAccount.divisionId} onChange={(event) => setManagedAccount({ ...managedAccount, divisionId: event.target.value, districtId: "", upazilaId: "" })} required><option value="">বিভাগ নির্বাচন করুন</option>{divisions.map((item) => <option key={item.id} value={item.id}>{item.nameBn}</option>)}</select></div></div><div><label className="field-label" htmlFor="managed-district">জেলা</label><div className="select-wrap"><MapPin size={18} /><select id="managed-district" value={managedAccount.districtId} onChange={(event) => setManagedAccount({ ...managedAccount, districtId: event.target.value, upazilaId: "" })} disabled={!managedAccount.divisionId} required><option value="">জেলা নির্বাচন করুন</option>{districts.map((item) => <option key={item.id} value={item.id}>{item.nameBn}</option>)}</select></div></div></div><label className="field-label" htmlFor="managed-upazila">উপজেলা</label><div className="select-wrap"><MapPin size={18} /><select id="managed-upazila" value={managedAccount.upazilaId} onChange={(event) => setManagedAccount({ ...managedAccount, upazilaId: event.target.value })} disabled={!managedAccount.districtId} required><option value="">উপজেলা নির্বাচন করুন</option>{upazilas.map((item) => <option key={item.id} value={item.id}>{item.nameBn}</option>)}</select></div></>}
        <label className="field-label" htmlFor="managed-password">অস্থায়ী পাসওয়ার্ড</label><div className="input-wrap"><LockKeyhole size={18} /><input id="managed-password" type="password" minLength={12} value={managedAccount.password} onChange={(event) => setManagedAccount({ ...managedAccount, password: event.target.value })} placeholder="কমপক্ষে ১২ অক্ষর" required /></div><button className="primary-button" disabled={busy}>{busy ? "তৈরি হচ্ছে…" : managedType === "NURSE" ? "কর্মী account তৈরি করুন" : "অ্যাডমিন account তৈরি করুন"}<span>→</span></button>
        </form>
        {overview && <div className="recent-panel"><div className="admin-section-heading"><div><strong>সাম্প্রতিক patient</strong><small>সর্বশেষ ৫টি registration</small></div></div>{overview.recentPatients.length ? overview.recentPatients.map((patient) => <div className="recent-row" key={patient.id}><span className="recent-avatar">{patient.name.slice(0, 1)}</span><span><strong>{patient.name}</strong><small>Patient ID: {patient.id}</small></span></div>) : <p className="empty-state">এখনও কোনো patient registration নেই।</p>}</div>}
      </>}
      {screen === "otp" && <form onSubmit={verifyOtp}><div className="otp-destination"><div className="mini-icon"><Mail size={20} /></div><div><strong>কোড পাঠানো হয়েছে</strong><span>{identifier}</span></div></div><label className="field-label" htmlFor="otp">৬ সংখ্যার OTP</label><input className="otp-input" id="otp" inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="••••••" autoComplete="one-time-code" required /><button className="primary-button" disabled={busy}>{busy ? "যাচাই হচ্ছে…" : "OTP যাচাই করুন"}<span>→</span></button><button type="button" className="text-link centered-link" onClick={goLogin}>অন্য তথ্য দিয়ে চেষ্টা করুন</button></form>}
      {screen === "forgot" && <form onSubmit={requestReset}><div className="info-box"><Mail size={19} /><span>আপনার নিবন্ধিত email-এ একটি নিরাপদ reset link পাঠানো হবে।</span></div><label className="field-label" htmlFor="reset-identifier">ইমেইল বা কর্মী ID</label><div className="input-wrap"><Mail size={19} /><input id="reset-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="আপনার ইমেইল বা কর্মী ID" required /></div><button className="primary-button" disabled={busy}>{busy ? "পাঠানো হচ্ছে…" : "Reset link পাঠান"}<span>→</span></button></form>}
      {screen === "reset" && <form onSubmit={resetPassword}><label className="field-label" htmlFor="new-password">নতুন পাসওয়ার্ড</label><div className="input-wrap"><LockKeyhole size={19} /><input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="কমপক্ষে ১২ অক্ষর" minLength={12} required /><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label="পাসওয়ার্ড দেখুন"><Eye size={18} /></button></div><button className="primary-button" disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে…" : "নতুন পাসওয়ার্ড সংরক্ষণ করুন"}<span>→</span></button></form>}
      {message && <div className="feedback success"><CheckCircle2 size={18} /><span>{message}</span></div>}{error && <div className="feedback error"><span>{error}</span></div>}<p className="privacy-note">আপনার তথ্য নিরাপদে রাখা হয়। সাহায্য প্রয়োজন হলে স্থানীয় স্বাস্থ্যকর্মীর সঙ্গে যোগাযোগ করুন।</p>
    </div><footer>© ২০২৬ MaternaCare AI <span>•</span> সহায়তা কেন্দ্র</footer></section>
  </main>;
}

export default App;
