import { Activity, Bell, ClipboardList, HeartPulse, LogOut, Mic, UsersRound } from "lucide-react";

export default function WorkerNavbar() {
  const path = window.location.pathname;
  const link = (to: string, label: string, Icon: typeof Activity) => <a className={path === to ? "active" : ""} href={to}><Icon size={16} /> {label}</a>;
  return <header className="app-navbar"><div className="nav-inner"><a className="brand-logo" href="/worker/home"><span className="logo-icon"><HeartPulse size={20} /></span><span>MaternaCare <b>AI</b></span></a><nav className="nav-links open">{link("/worker/home", "হোম", Activity)}{link("/worker/inbox", "নতুন intake", ClipboardList)}{link("/worker/notifications", "Notifications", Bell)}{link("/worker/follow-ups", "Follow-up", Activity)}{link("/worker/referrals", "Referral", Activity)}{link("/worker/patients", "Patient list", UsersRound)}{link("/worker/intake", "নতুন intake তৈরি", Mic)}<button className="nav-logout" onClick={() => { localStorage.removeItem("maternacare_token"); window.location.href = "/login"; }}><LogOut size={16} /> বের হোন</button></nav></div></header>;
}
