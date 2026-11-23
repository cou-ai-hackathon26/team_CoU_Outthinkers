import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import { evaluateCareGaps } from "../workflow/care-gap.service";
import { assertReferralTransition } from "../workflow/workflow";
import { getStaffScope } from "./staff-scope";
import { createInAppNotification } from "../workflow/notification.service";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));

router.get("/referrals", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const referrals = await prisma.referral.findMany({
    where: scope?.role === "ADMIN" ? {} : { ownerStaffId: auth.userId },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 100,
    select: { id: true, status: true, reason: true, destinationName: true, destinationContact: true, sourceFacts: true, dueAt: true, completedAt: true, createdAt: true, updatedAt: true, patient: { select: { publicId: true, patientProfile: { select: { name: true } } } }, events: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, fromStatus: true, toStatus: true, performedById: true, source: true, notes: true, evidence: true, createdAt: true } } },
  });
  response.json({ data: referrals.map(item => ({ ...item, patientId: item.patient.publicId, patientName: item.patient.patientProfile?.name || "নাম নেই" })) });
});

router.post("/referrals", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const patientId = String(request.body?.patientId || "").trim();
  const reason = String(request.body?.reason || "").trim();
  const destinationName = String(request.body?.destinationName || "").trim() || null;
  const destinationContact = String(request.body?.destinationContact || "").trim() || null;
  const dueAt = request.body?.dueAt ? new Date(String(request.body.dueAt)) : null;
  if (!patientId || !reason) { response.status(400).json({ error: "Patient ID এবং referral-এর কারণ দিন।" }); return; }
  if (dueAt && Number.isNaN(dueAt.getTime())) { response.status(400).json({ error: "Referral due date সঠিক নয়।" }); return; }
  const patient = await prisma.user.findFirst({ where: { publicId: patientId, role: "PATIENT", status: "ACTIVE", ...(scope?.role === "ADMIN" ? {} : { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } }) }, select: { id: true, publicId: true, patientProfile: { select: { name: true } } } });
  if (!patient) { response.status(404).json({ error: "Patient খুঁজে পাওয়া যায়নি।" }); return; }
  const pregnancyCase = await prisma.pregnancyCase.findFirst({ where: { patientUserId: patient.id, status: "ACTIVE" }, select: { id: true } });
  const created = await prisma.$transaction(async transaction => {
    const referral = await transaction.referral.create({ data: { patientUserId: patient.id, pregnancyCaseId: pregnancyCase?.id, ownerStaffId: auth.userId, reason, destinationName, destinationContact, dueAt, sourceFacts: request.body?.sourceFacts || { source: "worker_created" } }, select: { id: true, status: true, dueAt: true, createdAt: true } });
    await transaction.referralEvent.create({ data: { referralId: referral.id, toStatus: "DRAFT", performedById: auth.userId, source: "worker", notes: "Referral তৈরি করা হয়েছে।" } });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "REFERRAL_CREATED", targetType: "Referral", targetId: referral.id, metadata: { patientId, destinationName } } });
    return referral;
  });
  await createInAppNotification({ userId: auth.userId, type: "REFERRAL_CREATED", title: "Referral তৈরি হয়েছে", message: `${patient.patientProfile?.name || "Patient"}-এর referral workflow শুরু হয়েছে।`, targetType: "Referral", targetId: created.id });
  response.status(201).json({ data: { ...created, patientId, patientName: patient.patientProfile?.name || "নাম নেই" } });
});

router.patch("/referrals/:id/status", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const toStatus = String(request.body?.status || "").trim();
  const referral = await prisma.referral.findFirst({ where: { id: request.params.id, ...(scope?.role === "ADMIN" ? {} : { ownerStaffId: auth.userId }) }, select: { id: true, patientUserId: true, status: true } });
  if (!referral) { response.status(404).json({ error: "Referral খুঁজে পাওয়া যায়নি।" }); return; }
  if (!(toStatus in { DRAFT: 1, SENT: 1, ACKNOWLEDGED: 1, IN_TRANSIT: 1, ARRIVED: 1, ACCEPTED: 1, TRANSFERRED: 1, COMPLETED: 1, UNRESOLVED: 1 })) { response.status(400).json({ error: "Referral status সঠিক নয়।" }); return; }
  try { assertReferralTransition(referral.status, toStatus as any); } catch { response.status(409).json({ error: `এই referral-এ ${referral.status} থেকে ${toStatus} status করা যাবে না।` }); return; }
  const notes = String(request.body?.notes || "").trim() || null;
  const source = String(request.body?.source || "worker").trim();
  const updated = await prisma.$transaction(async transaction => {
    const next = await transaction.referral.update({ where: { id: referral.id }, data: { status: toStatus as any, completedAt: toStatus === "COMPLETED" ? new Date() : null }, select: { id: true, status: true, completedAt: true, updatedAt: true } });
    await transaction.referralEvent.create({ data: { referralId: referral.id, fromStatus: referral.status, toStatus: toStatus as any, performedById: auth.userId, source, notes, evidence: request.body?.evidence || null } });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "REFERRAL_STATUS_CHANGED", targetType: "Referral", targetId: referral.id, metadata: { fromStatus: referral.status, toStatus, source } } });
    return next;
  });
  await createInAppNotification({ userId: auth.userId, type: "REFERRAL_STATUS_CHANGED", title: "Referral status update", message: `Referral এখন ${toStatus} status-এ আছে।`, targetType: "Referral", targetId: referral.id, metadata: { fromStatus: referral.status, toStatus } });
  try { await evaluateCareGaps(referral.patientUserId, auth.userId); } catch (error) { console.error("Care-gap evaluation after referral update failed", error); }
  response.json({ data: updated });
});

export default router;
