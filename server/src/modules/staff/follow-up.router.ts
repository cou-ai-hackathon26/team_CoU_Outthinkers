import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import { getStaffScope } from "./staff-scope";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));

router.get("/follow-up-tasks", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const tasks = await prisma.followUpTask.findMany({ where: { assignedStaffId: auth.userId, status: { not: "CANCELLED" } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 100, select: { id: true, title: true, reason: true, priority: true, status: true, dueAt: true, outcome: true, nextAction: true, completedAt: true, patientUser: { select: { publicId: true, patientProfile: { select: { name: true } } } } } });
  response.json({ data: tasks.map(task => ({ ...task, patientId: task.patientUser.publicId, patientName: task.patientUser.patientProfile?.name || "নাম নেই" })) });
});

router.post("/follow-up-tasks", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const patientId = String(request.body?.patientId || "").trim(); const title = String(request.body?.title || "").trim(); const reason = String(request.body?.reason || "").trim(); const priority = String(request.body?.priority || "NORMAL");
  if (!patientId || !title || !reason) { response.status(400).json({ error: "Patient ID, task title এবং কারণ দিন।" }); return; }
  if (!["NORMAL", "HIGH", "URGENT"].includes(priority)) { response.status(400).json({ error: "Priority সঠিক নয়।" }); return; }
  const patient = await prisma.user.findFirst({ where: { publicId: patientId, role: "PATIENT", status: "ACTIVE", ...(scope?.role === "ADMIN" ? {} : { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } }) }, select: { id: true, publicId: true, patientProfile: { select: { name: true } } } });
  if (!patient) { response.status(404).json({ error: "Patient খুঁজে পাওয়া যায়নি।" }); return; }
  const pregnancyCase = await prisma.pregnancyCase.findFirst({ where: { patientUserId: patient.id, status: "ACTIVE" }, select: { id: true } });
  const dueAt = request.body?.dueAt ? new Date(String(request.body.dueAt)) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) { response.status(400).json({ error: "Due date সঠিক নয়।" }); return; }
  const task = await prisma.$transaction(async transaction => {
    const created = await transaction.followUpTask.create({ data: { patientUserId: patient.id, pregnancyCaseId: pregnancyCase?.id, assignedStaffId: auth.userId, title, reason, priority: priority as "NORMAL" | "HIGH" | "URGENT", dueAt }, select: { id: true, title: true, priority: true, status: true, dueAt: true } });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "FOLLOW_UP_TASK_CREATED", targetType: "FollowUpTask", targetId: created.id, metadata: { patientId, priority } } });
    return created;
  });
  response.status(201).json({ data: { ...task, patientId, patientName: patient.patientProfile?.name || "নাম নেই" } });
});

router.patch("/follow-up-tasks/:id/complete", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const outcome = String(request.body?.outcome || "").trim();
  const nextAction = String(request.body?.nextAction || "").trim();
  if (!outcome) { response.status(400).json({ error: "Follow-up-এর ফলাফল লিখুন।" }); return; }
  const task = await prisma.followUpTask.updateMany({ where: { id: request.params.id, assignedStaffId: auth.userId, status: { not: "COMPLETED" } }, data: { status: "COMPLETED", outcome, nextAction: nextAction || null, completedAt: new Date(), completedById: auth.userId } });
  if (!task.count) { response.status(404).json({ error: "Task খুঁজে পাওয়া যায়নি।" }); return; }
  await prisma.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "FOLLOW_UP_TASK_COMPLETED", targetType: "FollowUpTask", targetId: request.params.id, metadata: { hasNextAction: Boolean(nextAction) } } });
  response.json({ message: "Follow-up সম্পন্ন হয়েছে।" });
});

router.get("/safety-alerts", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const alerts = await prisma.safetyAlert.findMany({ where: { pregnancyCase: { assignedStaffId: auth.userId }, status: { not: "RESOLVED" } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, severity: true, title: true, reason: true, sourceFacts: true, status: true, createdAt: true, pregnancyCase: { select: { caseCode: true, patientUser: { select: { publicId: true, patientProfile: { select: { name: true } } } } } } } });
  response.json({ data: alerts });
});

router.patch("/safety-alerts/:id/acknowledge", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const updated = await prisma.safetyAlert.updateMany({ where: { id: request.params.id, pregnancyCase: { assignedStaffId: auth.userId }, status: "OPEN" }, data: { status: "ACKNOWLEDGED", acknowledgedById: auth.userId, acknowledgedAt: new Date() } });
  if (!updated.count) { response.status(404).json({ error: "Safety alert খুঁজে পাওয়া যায়নি।" }); return; }
  response.json({ message: "Safety alert acknowledge করা হয়েছে।" });
});

router.patch("/safety-alerts/:id/resolve", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const updated = await prisma.safetyAlert.updateMany({ where: { id: request.params.id, pregnancyCase: { assignedStaffId: auth.userId }, status: "ACKNOWLEDGED" }, data: { status: "RESOLVED" } });
  if (!updated.count) { response.status(404).json({ error: "সমাধান করার মতো acknowledged alert পাওয়া যায়নি।" }); return; }
  await prisma.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "SAFETY_ALERT_RESOLVED", targetType: "SafetyAlert", targetId: request.params.id } });
  response.json({ message: "Safety alert resolved হয়েছে।" });
});

export default router;
