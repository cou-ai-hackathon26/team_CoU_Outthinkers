import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import api from "./lib/api";

export default function PasswordReset() {
  const resetMode = window.location.pathname === "/reset-password";
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (resetMode) { await api.post("/auth/staff/reset-password", { token, password }); setMessage("পাসওয়ার্ড পরিবর্তন হয়েছে। এখন নতুন password দিয়ে লগইন করুন।"); }
      else { await api.post("/auth/staff/forgot-password", { identifier }); setMessage("যদি account থাকে, reset link email-এ পাঠানো হয়েছে।"); }
    } catch (e: any) { setError(e.response?.data?.error || "অনুরোধটি সম্পন্ন করা যায়নি।"); }
    finally { setBusy(false); }
  };
  return <main className="auth-layout"><section className="auth-visual"><span className="brand-logo"><span className="logo-icon">MC</span><span>MaternaCare <b>AI</b></span></span><span className="page-eyebrow">নিরাপদ account recovery</span><h1>আবার<br /><em>শুরু করুন।</em></h1><p>আপনার account নিরাপদে ফিরে পেতে নিচের তথ্য দিন।</p></section><section className="auth-content"><div className="auth-box"><a className="plain-link" href="/login">← লগইন পেজে ফিরুন</a><span className="page-eyebrow">Password recovery</span><h2>{resetMode ? "নতুন password দিন" : "Password ভুলে গেছেন?"}</h2>{resetMode && !token && <p className="inline-error">Reset link সঠিক নয়।</p>}{!message && <form onSubmit={submit}>{resetMode ? <><label>নতুন password</label><input className="large-input" type="password" minLength={12} value={password} onChange={e => setPassword(e.target.value)} required /><small>কমপক্ষে ১২ অক্ষর</small></> : <><label>ইমেইল অথবা কর্মী ID</label><input className="large-input" value={identifier} onChange={e => setIdentifier(e.target.value)} required /></>}<button className="full-button" disabled={busy || (resetMode && !token)}>{busy ? "অপেক্ষা করুন…" : resetMode ? "Password পরিবর্তন করুন" : "Reset link পাঠান"} <ArrowRight /></button></form>}{message && <p className="success-message"><CheckCircle2 size={17} /> {message} <a className="plain-link" href="/login">লগইন করুন</a></p>}{error && <p className="inline-error">{error}</p>}</div></section></main>;
}
