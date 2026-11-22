import { Router } from "express";
import axios from "axios";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import intakeRequestRouter from "./intake-request.router";
import { aiServiceHeaders } from "../../lib/ai-client";
import { rateLimit } from "../../lib/rate-limit";

const router = Router();
router.use(requireAuth, requireRole("PATIENT"));
router.use(intakeRequestRouter);
router.use("/chat", rateLimit({ name: "patient-chat", windowMs: 60_000, max: 30 }));

const chatRedFlags: Array<[string, string]> = [
  ["রক্তপাত|রক্ত যাচ্ছে|অনেক রক্ত|bleeding|heavy bleeding", "রক্তপাত"],
  ["তীব্র পেট ব্যথা|প্রচণ্ড পেট ব্যথা|severe abdominal pain", "তীব্র পেটব্যথা"],
  ["খিঁচুনি|অজ্ঞান|seizure|unconscious", "খিঁচুনি বা অজ্ঞান"],
  ["শ্বাসকষ্ট|শ্বাস নিতে কষ্ট|difficulty breathing", "শ্বাসকষ্ট"],
  ["চোখে ঝাপসা|দৃষ্টি ঝাপসা|severe headache", "তীব্র মাথাব্যথা বা দৃষ্টির সমস্যা"],
  ["জ্বর|fever|high temperature", "জ্বর"],
  ["বাচ্চা নড়ছে না|শিশু নড়ছে না|নড়াচড়া কম|reduced fetal movement", "শিশুর নড়াচড়া কম"],
];

function findChatRedFlags(text: string) {
  const source = text.toLowerCase();
  return chatRedFlags.filter(([pattern]) => new RegExp(pattern, "i").test(source)).map(([, label]) => label);
}

function isIdentityQuestion(text: string) {
  return /আপনি কে|আপনার পরিচয়|আপনার পরিচয়|who are you/i.test(text);
}

router.post("/chat/sessions", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const session = await prisma.chatSession.create({ data: { patientUserId: auth.userId } });
  response.status(201).json({ data: { id: session.id, title: session.title, createdAt: session.createdAt } });
});

router.get("/chat/sessions", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const sessions = await prisma.chatSession.findMany({ where: { patientUserId: auth.userId }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, createdAt: true, updatedAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, createdAt: true } } } });
  response.json({ data: sessions });
});

router.get("/chat/sessions/:id", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const session = await prisma.chatSession.findFirst({ where: { id: request.params.id, patientUserId: auth.userId }, select: { id: true, title: true, createdAt: true, messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, urgency: true, createdAt: true } } } });
  if (!session) { response.status(404).json({ error: "Chat session পাওয়া যায়নি।" }); return; }
  response.json({ data: session });
});

router.post("/chat/sessions/:id/messages", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const content = String(request.body?.content || "").trim();
  if (!content || content.length > 4000) { response.status(400).json({ error: "১ থেকে ৪০০০ অক্ষরের মধ্যে আপনার কথা লিখুন।" }); return; }
  const session = await prisma.chatSession.findFirst({ where: { id: request.params.id, patientUserId: auth.userId }, select: { id: true } });
  if (!session) { response.status(404).json({ error: "Chat session পাওয়া যায়নি।" }); return; }
  await prisma.chatMessage.create({ data: { sessionId: session.id, role: "USER", content } });
  const redFlags = findChatRedFlags(content);
  let answer: { reply: string; urgency: string; red_flags: string[]; suggested_action: string; sources?: string[]; intent?: string; requires_nurse_review?: boolean };
  if (isIdentityQuestion(content)) {
    answer = { reply: "আমি MaternaCare AI—গর্ভকালীন স্বাস্থ্য সম্পর্কে সাধারণ তথ্য দেওয়ার সহায়ক। আমি ডাক্তার নই; জরুরি বা ব্যক্তিগত সমস্যার জন্য আপনার নার্স বা ডাক্তারের সঙ্গে যোগাযোগ করুন।", urgency: "NORMAL", red_flags: [], suggested_action: "আপনার নির্দিষ্ট প্রশ্নটি লিখুন বা স্বাস্থ্যকর্মীর সঙ্গে কথা বলুন।" };
  } else if (redFlags.length) {
    answer = { reply: `আপনি ${redFlags.join(", ")} এর কথা বলেছেন। এটি জরুরি হতে পারে। এখনই নিকটস্থ হাসপাতাল/স্বাস্থ্যকেন্দ্রে যোগাযোগ করুন এবং সম্ভব হলে আপনার স্বাস্থ্যকর্মীকে জানান। আমি রোগ নির্ণয় করতে পারি না।`, urgency: "EMERGENCY", red_flags: redFlags, suggested_action: "এখনই নিকটস্থ হাসপাতাল বা স্বাস্থ্যকেন্দ্রে যোগাযোগ করুন।" };
  } else {
    try {
      const history = await prisma.chatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" }, take: 12, select: { role: true, content: true } });
      const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
      const result = await axios.post(`${aiUrl}/chat`, { messages: history }, { timeout: 100_000, headers: aiServiceHeaders() });
      answer = result.data;
    } catch (error) {
      console.error("Patient chatbot failed", error);
      response.status(502).json({ error: "Chat assistant এখন সাময়িকভাবে unavailable। আপনার care intake পাঠাতে পারেন।" });
      return;
    }
  }
  const saved = await prisma.chatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: answer.reply, urgency: answer.urgency, intent: answer.intent || null, sources: answer.sources || [], requiresNurseReview: answer.requires_nurse_review || answer.urgency !== "NORMAL" } });
  response.status(201).json({ data: { message: { id: saved.id, role: saved.role, content: saved.content, urgency: saved.urgency, intent: saved.intent, sources: saved.sources, requiresNurseReview: saved.requiresNurseReview, createdAt: saved.createdAt }, redFlags: answer.red_flags || [], suggestedAction: answer.suggested_action || "" } });
});

router.post("/chat/sessions/:id/messages/stream", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const content = String(request.body?.content || "").trim();
  if (!content || content.length > 4000) { response.status(400).json({ error: "১ থেকে ৪০০০ অক্ষরের মধ্যে আপনার কথা লিখুন।" }); return; }
  const session = await prisma.chatSession.findFirst({ where: { id: request.params.id, patientUserId: auth.userId }, select: { id: true } });
  if (!session) { response.status(404).json({ error: "Chat session পাওয়া যায়নি।" }); return; }
  await prisma.chatMessage.create({ data: { sessionId: session.id, role: "USER", content } });

  if (isIdentityQuestion(content)) {
    const answer = "আমি MaternaCare AI—গর্ভকালীন স্বাস্থ্য সম্পর্কে সাধারণ তথ্য দেওয়ার সহায়ক। আমি ডাক্তার নই; জরুরি বা ব্যক্তিগত সমস্যার জন্য আপনার নার্স বা ডাক্তারের সঙ্গে যোগাযোগ করুন।";
    response.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    response.flushHeaders?.();
    for (const character of answer) response.write(`data: ${JSON.stringify({ type: "delta", text: character })}\n\n`);
    await prisma.chatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: answer, urgency: "NORMAL" } });
    response.write(`data: ${JSON.stringify({ type: "done", urgency: "NORMAL", red_flags: [], suggested_action: "আপনার নির্দিষ্ট প্রশ্নটি লিখুন বা স্বাস্থ্যকর্মীর সঙ্গে কথা বলুন।" })}\n\n`);
    response.end();
    return;
  }

  try {
    const history = await prisma.chatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" }, take: 12, select: { role: true, content: true } });
    const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
    const upstream = await axios.post(`${aiUrl}/chat/stream`, { messages: history }, { timeout: 100_000, responseType: "stream", headers: aiServiceHeaders() });
    response.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    response.flushHeaders?.();

    let buffer = "";
    let assistantText = "";
    let metadata: { urgency?: string; red_flags?: string[]; suggested_action?: string; sources?: string[]; intent?: string; requires_nurse_review?: boolean } = {};
    const processEvent = (event: string) => {
      const line = event.split(/\r?\n/).find((item: string) => item.startsWith("data:"));
      if (!line) return;
      try {
        const data = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; urgency?: string; red_flags?: string[]; suggested_action?: string; sources?: string[]; intent?: string; requires_nurse_review?: boolean };
        if (data.type === "delta" && data.text) assistantText += data.text;
        if (data.type === "done") metadata = data;
      } catch { /* Ignore incomplete or malformed upstream event. */ }
    };
    upstream.data.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      response.write(text);
      buffer += text;
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      events.forEach(processEvent);
    });
    upstream.data.on("end", async () => {
      if (buffer.trim()) processEvent(buffer);
      try {
        if (assistantText) await prisma.chatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: assistantText, urgency: metadata.urgency || "NORMAL", intent: metadata.intent || null, sources: metadata.sources || [], requiresNurseReview: metadata.requires_nurse_review || metadata.urgency !== "NORMAL" } });
      } catch (error) { console.error("Failed to save streamed chatbot response", error); }
      response.end();
    });
    upstream.data.on("error", (error: Error) => { console.error("Chat stream proxy failed", error); response.end(); });
    request.on("close", () => { if (!response.writableEnded) upstream.data.destroy(); });
  } catch (error) {
    console.error("Patient chatbot stream failed", error);
    response.status(502).json({ error: "Chat assistant এখন সাময়িকভাবে unavailable। আবার চেষ্টা করুন।" });
  }
});

router.get("/follow-ups", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const tasks = await prisma.followUpTask.findMany({
    where: { patientUserId: auth.userId, status: { not: "CANCELLED" } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 50,
    select: { id: true, title: true, reason: true, priority: true, status: true, dueAt: true, outcome: true, nextAction: true, completedAt: true },
  });
  response.json({ data: tasks });
});

router.get("/me", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const [user, activeRequests, openFollowUps] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: { publicId: true, email: true, phone: true, status: true, patientProfile: { select: { name: true, contactNumber: true, dateOfBirth: true, emergencyContactNumber: true, address: true, division: { select: { nameBn: true } }, district: { select: { nameBn: true } }, upazila: { select: { nameBn: true } } } } },
    }),
    prisma.patientIntakeRequest.count({ where: { patientUserId: auth.userId, status: { notIn: ["VERIFIED", "REJECTED"] } } }),
    prisma.followUpTask.count({ where: { patientUserId: auth.userId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);
  if (!user || user.status !== "ACTIVE" || !user.patientProfile) { response.status(401).json({ error: "অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।" }); return; }
  response.json({ data: { ...user, dashboard: { activeRequests, openFollowUps, accountStatus: user.status } } });
});

export default router;
