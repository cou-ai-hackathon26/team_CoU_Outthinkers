import { Activity, Bell, ClipboardList, HeartPulse, LogOut, UsersRound } from "lucide-react";

export default function WorkerNavbar() {
  return <header className="app-navbar"><div className="nav-inner"><a className="brand-logo" href="/worker/home"><span className="logo-icon"><HeartPulse size={20} /></span><span>MaternaCare <b>AI</b></span></a><nav className="nav-links open"><a href="/worker/home">হোম</a><a href="/worker/inbox"><ClipboardList size={16} /> নতুন intake</a><a href="/worker/notifications"><Bell size={16} /> Notifications</a><a href="/worker/follow-ups"><Activity size={16} /> Follow-up</a><a href="/worker/referrals"><Activity size={16} /> Referral</a><a href="/worker/patients"><UsersRound size={16} /> Patient list</a><button className="nav-logout" onClick={() => { localStorage.removeItem("maternacare_token"); window.location.href = "/login"; }}><LogOut size={16} /> বের হোন</button></nav></div></header>;
}
