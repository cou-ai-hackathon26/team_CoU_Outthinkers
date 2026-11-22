import { useEffect, useState } from "react";
import { Check, FileText, X } from "lucide-react";
import api from "./lib/api";

type DocumentItem = { index: number; title?: string; publisher?: string; published?: string; url?: string; file?: string; review_status?: string; reviewed_by?: string; reviewed_at?: string; review_notes?: string };

export default function AdminKnowledgeReview() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => api.get("/admin/knowledge-documents").then(r => setDocuments(r.data.data || [])).catch(e => setError(e.response?.data?.error || "Document লোড করা যায়নি।"));
  useEffect(() => { void load(); }, []);
  const review = async (document: DocumentItem, status: "APPROVED" | "REJECTED") => {
    if (!reviewer.trim()) { setError("আগে reviewer-এর নাম লিখুন।"); return; }
    setBusy(document.index); setError("");
    try { await api.patch(`/admin/knowledge-documents/${document.index}`, { status, reviewer, notes: notes[document.index] || "" }); await load(); }
    catch (e: any) { setError(e.response?.data?.error || "Review সংরক্ষণ করা যায়নি।"); }
    finally { setBusy(null); }
  };
  return <div className="admin-knowledge"><div className="knowledge-review-toolbar"><div><h2>AI knowledge documents</h2><p>শুধু APPROVED document patient chatbot ব্যবহার করতে পারবে।</p></div><input className="plain-input" placeholder="Reviewer-এর নাম" value={reviewer} onChange={e => setReviewer(e.target.value)} /></div>{error && <p className="inline-error">{error}</p>}<div className="knowledge-list">{documents.map(document => <article className="knowledge-card" key={document.index}><div className="knowledge-card-head"><span className="knowledge-icon"><FileText size={18} /></span><div><h3>{document.title || document.file}</h3><small>{document.publisher || "Source"} · {document.published || "তারিখ নেই"}</small></div><span className={`status-pill ${document.review_status === "REJECTED" ? "rejected" : ""}`}>{document.review_status || "REVIEW_REQUIRED"}</span></div>{document.url && <a href={document.url} target="_blank" rel="noreferrer">Official source খুলুন</a>}<textarea className="review-textarea" rows={2} placeholder="Review notes" value={notes[document.index] ?? document.review_notes ?? ""} onChange={e => setNotes({ ...notes, [document.index]: e.target.value })} /><div className="review-actions"><button className="secondary-action" disabled={busy === document.index} onClick={() => void review(document, "REJECTED")}><X size={15} /> Reject</button><button className="primary-action" disabled={busy === document.index} onClick={() => void review(document, "APPROVED")}><Check size={15} /> Approve</button></div>{document.reviewed_at && <small className="review-meta">শেষ review: {document.reviewed_by} · {new Date(document.reviewed_at).toLocaleString("bn-BD")}</small>}</article>)}</div></div>;
}
