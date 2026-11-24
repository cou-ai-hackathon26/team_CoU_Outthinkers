import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import { createInAppNotification } from "../workflow/notification.service";
import { assertReferralTransition } from "../workflow/workflow";

const router = Router();
router.use(requireAuth, requireRole("FACILITY_WORKER"));

async function facilityForWorker(userId: string) {
  const profile = await prisma.facilityWorkerProfile.findUnique({
    where: { userId },
    select: { facilityId: true, name: true, employeeId: true, facility: { select: { nameBn: true, status: true, source: true } } },
  });
  return profile;
}

router.get("/me", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const profile = await facilityForWorker(auth.userId);
  if (!profile) { response.status(404).json({ error: "আপনার facility profile পাওয়া যায়নি।" }); return; }
  response.json({ data: profile });
});

router.get("/referrals", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const profile = await facilityForWorker(auth.userId);
  if (!profile) { response.status(404).json({ error: "আপনার facility profile পাওয়া যায়নি।" }); return; }
  const referrals = await prisma.referral.findMany({
    where: { facilityId: profile.facilityId, status: { not: "DRAFT" } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true, status: true, reason: true, destinationName: true, destinationContact: true,
      dueAt: true, createdAt: true, updatedAt: true,
      patient: { select: { publicId: true, patientProfile: { select: { name: true, contactNumber: true } } } },
      ownerStaff: { select: { email: true, phone: true, staffProfile: { select: { name: true, employeeId: true } } } },
      events: { orderBy: { createdAt: "asc" }, select: { id: true, fromStatus: true, toStatus: true, performedById: true, source: true, notes: true, createdAt: true } },
    },
  });
  response.json({ data: { facility: profile.facility, referrals: referrals.map(item => ({ ...item, patientId: item.patient.publicId, patientName: item.patient.patientProfile?.name || "নাম নেই" })) } });
});

router.patch("/referrals/:id/decision", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const profile = await facilityForWorker(auth.userId);
  if (!profile) { response.status(404).json({ error: "আপনার facility profile পাওয়া যায়নি।" }); return; }
  const decision = String(request.body?.decision || "").trim().toUpperCase();
  const notes = String(request.body?.notes || "").trim();
  const nextStatus: Record<string, string> = { ACKNOWLEDGE: "ACKNOWLEDGED", REJECT: "REJECTED", ARRIVED: "ARRIVED", ACCEPT: "ACCEPTED", COMPLETE: "COMPLETED" };
  if (!nextStatus[decision]) { response.status(400).json({ error: "Referral-এর পরবর্তী ধাপ নির্বাচন করুন।" }); return; }
  if (decision === "REJECT" && !notes) { response.status(400).json({ error: "Reject করার কারণ লিখুন।" }); return; }
  if (decision === "COMPLETE" && !notes) { response.status(400).json({ error: "সম্পন্ন সেবার outcome নোট লিখুন।" }); return; }

  const result = await prisma.$transaction(async transaction => {
    const referral = await transaction.referral.findFirst({
      where: { id: request.params.id, facilityId: profile.facilityId },
      select: { id: true, patientUserId: true, ownerStaffId: true, status: true },
    });
    if (!referral) return null;
    try { assertReferralTransition(referral.status, nextStatus[decision] as any); } catch { return { invalidTransition: true as const }; }
    const changed = await transaction.referral.updateMany({ where: { id: referral.id, facilityId: profile.facilityId, status: referral.status }, data: { status: nextStatus[decision] as any, completedAt: decision === "COMPLETE" ? new Date() : null } });
    if (changed.count !== 1) return null;
    await transaction.referralEvent.create({ data: { referralId: referral.id, fromStatus: referral.status, toStatus: nextStatus[decision] as any, performedById: auth.userId, source: "facility_worker", notes: notes || `${profile.name} (${profile.facility.nameBn}) update করেছেন।` } });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: `FACILITY_REFERRAL_${decision}`, targetType: "Referral", targetId: referral.id, metadata: { facilityId: profile.facilityId, decision, fromStatus: referral.status, toStatus: nextStatus[decision], notes: notes || null } } });
    return { referral, nextStatus: nextStatus[decision] };
  });
  if (result && "invalidTransition" in result) { response.status(409).json({ error: "এই referral-এর বর্তমান ধাপ থেকে facility এই update দিতে পারবে না।" }); return; }
  if (!result) { response.status(404).json({ error: "এই facility-র জন্য পাঠানো pending referral পাওয়া যায়নি।" }); return; }
  const statusMessages: Record<string, string> = { ACKNOWLEDGED: "facility referral গ্রহণ করেছে", REJECTED: "facility referral গ্রহণ করতে পারেনি; স্বাস্থ্যকর্মীকে জানানো হয়েছে", ARRIVED: "facility-তে পৌঁছানোর তথ্য নথিভুক্ত হয়েছে", ACCEPTED: "facility আপনাকে গ্রহণ করেছে", COMPLETED: "facility সেবা সম্পন্ন হওয়ার তথ্য দিয়েছে" };
  const notifications = [createInAppNotification({ userId: result.referral.patientUserId, type: "PATIENT_REFERRAL_UPDATE", title: "আপনার referral-এর update", message: statusMessages[result.nextStatus] || "আপনার referral-এর অবস্থা update হয়েছে।", targetType: "Referral", targetId: result.referral.id, metadata: { status: result.nextStatus, facilityId: profile.facilityId } })];
  if (result.referral.ownerStaffId) notifications.push(createInAppNotification({ userId: result.referral.ownerStaffId, type: "FACILITY_REFERRAL_UPDATE", title: "Facility referral update দিয়েছে", message: `${profile.facility.nameBn}: ${notes || statusMessages[result.nextStatus]}`, targetType: "Referral", targetId: result.referral.id, metadata: { status: result.nextStatus, facilityId: profile.facilityId } }));
  const notificationResults = await Promise.allSettled(notifications);
  notificationResults.filter(item => item.status === "rejected").forEach(item => console.error("Facility referral notification failed", item));
  response.json({ data: { referralId: result.referral.id, status: result.nextStatus } });
});

export default router;
