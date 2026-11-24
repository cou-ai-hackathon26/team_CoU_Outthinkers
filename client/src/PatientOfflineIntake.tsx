import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Mic } from "lucide-react";
import api from "./lib/api";
import { getOfflineIntakes, saveOfflineIntake, type OfflineIntake, type OfflineStatus } from "./offline-intake";

const labels: Record<OfflineStatus, string> = {
  SAVED_OFFLINE: "অফলাইনে সংরক্ষিত",
  WAITING_TO_SYNC: "সংযোগ ফিরে এলে পাঠানো হবে",
  UPLOADING: "পাঠানো হচ্ছে…",
  TRANSCRIBED: "লিখিত রূপ তৈরি · পাঠানোর আগে দেখে নিন",
  PROCESSED: "পাঠানো হয়েছে",
  SYNC_FAILED: "পাঠানো যায়নি · আবার চেষ্টা করুন",
};
const manualId = crypto.randomUUID();

function retryDeadline(error: any): number | undefined {
  if (error.response?.status !== 429) return undefined;
  const retryAfterSeconds = Number(error.response.headers?.["retry-after"]);
  if (retryAfterSeconds > 0) return Date.now() + retryAfterSeconds * 1000;
  const resetAtSeconds = Number(error.response.headers?.["x-ratelimit-reset"]);
  return resetAtSeconds > 0 ? resetAtSeconds * 1000 : Date.now() + 60_000;
}

export default function PatientOfflineIntake() {
  const [mode, setMode] = useState<"VOICE" | "MANUAL">("VOICE");
  const [online, setOnline] = useState(navigator.onLine);
  const [recording, setRecording] = useState(false);
  const [form, setForm] = useState({ problem: "", duration: "", feeling: "", extra: "" });
  const [items, setItems] = useState<OfflineIntake[]>([]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const syncLock = useRef(false);
  const busy = items.some((item) => item.status === "UPLOADING");
  const refresh = useCallback(async () => setItems(await getOfflineIntakes()), []);

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncLock.current) return;
    syncLock.current = true;
    try {
      const queue = await getOfflineIntakes();
      for (const savedItem of queue) {
        const oldUploadFailures = new Set([
          "Audio file is required",
          "সার্ভারে একটি সমস্যা হয়েছে।",
          "অনেকবার অনুরোধ করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
        ]);
        const recoverOldVoice = savedItem.status === "SYNC_FAILED"
          && savedItem.sourceType === "VOICE"
          && Boolean(savedItem.audio)
          && !savedItem.automaticRetryAttempted
          && oldUploadFailures.has(savedItem.error || "");
        // A tab/device may close while a request is in flight. Restore its
        // durable item to the queue on the next online sync attempt.
        const item = savedItem.status === "UPLOADING"
          ? { ...savedItem, status: "WAITING_TO_SYNC" as const, error: "আগের চেষ্টা শেষ হয়নি; আবার প্রক্রিয়া করা হচ্ছে।" }
          : recoverOldVoice
            ? { ...savedItem, status: "WAITING_TO_SYNC" as const, automaticRetryAttempted: true, error: "সংরক্ষিত recording আবার লিখিত রূপে রূপান্তর করা হচ্ছে।" }
            : savedItem;
        if (item !== savedItem) await saveOfflineIntake(item);
        const waitingOfflineVoice = item.sourceType === "VOICE" && item.status === "SAVED_OFFLINE";
        if (item.status !== "WAITING_TO_SYNC" && !waitingOfflineVoice) continue;
        const current: OfflineIntake = { ...item, status: "UPLOADING", error: undefined, retryAfter: undefined };
        await saveOfflineIntake(current);
        await refresh();
        try {
          if (current.sourceType === "VOICE") {
            if (!current.audio) throw new Error("এই intake-এ audio সংরক্ষিত নেই। নতুন করে রেকর্ড করুন।");
            const data = new FormData();
            const extension = current.audio!.type.includes("mp4") ? "m4a" : current.audio!.type.includes("ogg") ? "ogg" : "webm";
            data.append("audio", current.audio!, `patient-voice.${extension}`);
            const result = await api.post("/voice-intake", data);
            const text = String(result.data.transcript || "").trim();
            if (!text) throw new Error("লিখিত রূপ পাওয়া যায়নি; মূল recording সংরক্ষিত আছে। আবার চেষ্টা করুন।");
            await saveOfflineIntake({ ...current, text, status: "TRANSCRIBED", error: undefined, retryAfter: undefined });
            await refresh();
            continue;
          }
          const text = current.text;
          if (!text.trim()) throw new Error("আপনার কথার লিখিত রূপ প্রয়োজন।");
          await api.post("/patient/intake-requests", {
            transcriptText: text,
            sourceType: current.sourceType,
            idempotencyKey: current.localId,
          });
          await saveOfflineIntake({ ...current, text, status: "PROCESSED", audio: undefined, error: undefined });
        } catch (requestError: any) {
          const retryAfter = retryDeadline(requestError);
          const message = requestError.response?.data?.error || requestError.message || "পাঠানো যায়নি।";
          await saveOfflineIntake({ ...current, status: "SYNC_FAILED", error: message, retryAfter });

          // Stop the queue on rate limits. Otherwise the remaining recordings can
          // immediately consume the same exhausted quota in the same sync pass.
          if (retryAfter) {
            for (const pending of queue) {
              if (pending.localId !== item.localId && pending.status === "WAITING_TO_SYNC") {
                await saveOfflineIntake({ ...pending, status: "SYNC_FAILED", error: message, retryAfter });
              }
            }
            await refresh();
            break;
          }
        }
        await refresh();
      }
    } finally {
      syncLock.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    if (navigator.onLine) void sync();
    const goOnline = () => { setOnline(true); void sync(); };
    const goOffline = () => setOnline(false);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const timer = window.setInterval(() => void sync(), 12_000);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [refresh, sync]);

  const manualText = [
    form.problem ? `সমস্যা: ${form.problem}` : "",
    form.duration ? `কতদিন ধরে: ${form.duration}` : "",
    form.feeling ? `এখন কেমন লাগছে: ${form.feeling}` : "",
    form.extra ? `অন্য তথ্য: ${form.extra}` : "",
  ].filter(Boolean).join("। ");

  useEffect(() => {
    if (mode !== "MANUAL" || !manualText.trim()) return;
    void saveOfflineIntake({ localId: manualId, sourceType: "MANUAL", text: manualText, createdAt: Date.now(), status: "SAVED_OFFLINE" }).then(refresh);
  }, [mode, manualText, refresh]);

  const start = async () => {
    try {
      setError("");
      const source = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(source);
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = async () => {
        source.getTracks().forEach((track) => track.stop());
        setRecording(false);
        recorder.current = undefined;
        try {
          const audio = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          if (!audio.size) throw new Error("রেকর্ডিং খালি হয়েছে। আবার চেষ্টা করুন।");
          await saveOfflineIntake({ localId: crypto.randomUUID(), sourceType: "VOICE", text: "", audio, mimeType: audio.type, createdAt: Date.now(), status: navigator.onLine ? "WAITING_TO_SYNC" : "SAVED_OFFLINE" });
          await refresh();
          if (navigator.onLine) void sync();
        } catch (saveError: any) {
          setError(saveError.message || "রেকর্ডিং এই device-এ সংরক্ষণ করা যায়নি।");
        }
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      setError("মাইক্রোফোনের অনুমতি দিন এবং আবার চেষ্টা করুন।");
    }
  };

  const submitManual = async () => {
    const text = manualText.trim();
    if (!text) { setError("আপনার সমস্যাটি লিখুন।"); return; }
    setError("");
    await saveOfflineIntake({ localId: manualId, sourceType: "MANUAL", text, createdAt: Date.now(), status: "WAITING_TO_SYNC" });
    await refresh();
    if (navigator.onLine) void sync();
  };

  const submitVoice = async (item: OfflineIntake) => {
    if (!item.text.trim()) return;
    try {
      await api.post("/patient/intake-requests", {
        transcriptText: item.text.trim(),
        sourceType: "VOICE",
        idempotencyKey: item.localId,
      });
      await saveOfflineIntake({ ...item, status: "PROCESSED", audio: undefined, error: undefined, retryAfter: undefined });
      setError("");
    } catch (submitError: any) {
      await saveOfflineIntake({
        ...item,
        status: "SYNC_FAILED",
        error: submitError.response?.data?.error || submitError.message || "পাঠানো যায়নি।",
        retryAfter: retryDeadline(submitError),
      });
    }
    await refresh();
  };

  const updateTranscript = (item: OfflineIntake, text: string) => {
    const updated = { ...item, text, status: "TRANSCRIBED" as const };
    setItems((current) => current.map((entry) => entry.localId === item.localId ? updated : entry));
    void saveOfflineIntake(updated);
  };

  return <section className="voice-card">
    <div className={`offline-banner ${online ? "online" : "offline"}`}><strong>{online ? "সংযোগ আছে" : "অফলাইনে সংরক্ষিত"}</strong><span>{online ? "তথ্য নিরাপদে পাঠানো যাবে" : "সংযোগ ফিরে এলে পাঠানো হবে"}</span></div>
    <div className="intake-mode-tabs"><button className={mode === "VOICE" ? "active" : ""} onClick={() => setMode("VOICE")}><Mic size={16}/> কথা বলে দিন</button><button className={mode === "MANUAL" ? "active" : ""} onClick={() => setMode("MANUAL")}>লিখে দিন</button></div>
    {mode === "VOICE" ? <>
      <div className={recording ? "record-orb live" : "record-orb"}><Mic size={34}/></div>
      <h2>{recording ? "শোনা হচ্ছে…" : "আপনি কী নিয়ে সাহায্য চান?"}</h2>
      <p>রেকর্ড শেষ হলে audio এই device-এ থাকবে। সংযোগ পেলে লিখিত রূপ তৈরি হবে; দেখে তারপর স্বাস্থ্যকর্মীর কাছে পাঠান।</p>
      {!recording ? <button className="record-action" onClick={() => void start()} disabled={busy}><Mic size={18}/> রেকর্ড শুরু করুন</button> : <button className="record-action stop" onClick={() => recorder.current?.stop()}>রেকর্ড বন্ধ করুন</button>}
    </> : <div className="task-form">
      <label>আপনার সমস্যা<textarea value={form.problem} onChange={(event) => setForm({ ...form, problem: event.target.value })} rows={3} required/></label>
      <label>কতদিন ধরে হচ্ছে?<input value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })}/></label>
      <label>এখন কেমন লাগছে?<textarea value={form.feeling} onChange={(event) => setForm({ ...form, feeling: event.target.value })}/></label>
      <label>অন্য তথ্য<textarea value={form.extra} onChange={(event) => setForm({ ...form, extra: event.target.value })}/></label>
      <button className="primary-action" onClick={() => void submitManual()} disabled={busy}>স্বাস্থ্যকর্মীর কাছে পাঠান <ArrowRight size={16}/></button>
    </div>}
    {error && <p className="inline-error">{error}</p>}
    <div className="offline-queue"><h3>এই device-এর intake · {items.length}</h3>{items.map((item) => {
      const cooldown = item.retryAfter ? Math.max(0, Math.ceil((item.retryAfter - now) / 1000)) : 0;
      return <article key={item.localId}>
        <div><strong>{item.sourceType === "VOICE" ? "Voice intake" : "Manual intake"}</strong><span className={`offline-status ${item.status.toLowerCase()}`}>{labels[item.status]}</span>{item.error && <small>{item.error}</small>}{cooldown > 0 && <small>আবার চেষ্টা করতে অপেক্ষা করুন: {cooldown} সেকেন্ড</small>}
          {item.sourceType === "VOICE" && item.status === "TRANSCRIBED" && <label className="offline-transcript-label">AI লিখিত রূপ · পাঠানোর আগে দেখে নিন<textarea className="transcript-editable" value={item.text} onChange={(event) => updateTranscript(item, event.target.value)} rows={4}/></label>}
        </div>
        <time>{new Date(item.createdAt).toLocaleString("bn-BD")}</time>
        {item.sourceType === "VOICE" && item.status === "TRANSCRIBED" && <button className="primary-action" onClick={() => void submitVoice(item)}>স্বাস্থ্যকর্মীর কাছে পাঠান <ArrowRight size={16}/></button>}
        {item.status === "SYNC_FAILED" && <button className="secondary-action" disabled={cooldown > 0 || busy} onClick={() => item.sourceType === "VOICE" && item.text.trim() ? void submitVoice(item) : void saveOfflineIntake({ ...item, status: "WAITING_TO_SYNC", error: undefined, retryAfter: undefined }).then(sync)}>{item.sourceType === "VOICE" && item.text.trim() ? "আবার পাঠান" : "আবার চেষ্টা"}</button>}
      </article>;
    })}</div>
  </section>;
}
