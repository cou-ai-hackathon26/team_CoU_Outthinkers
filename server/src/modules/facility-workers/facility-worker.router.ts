import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import { createInAppNotification } from "../workflow/notification.service";

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
  if (!["ACKNOWLEDGE", "REJECT"].includes(decision)) { response.status(400).json({ error: "Referral গ্রহণ অথবা reject নির্বাচন করুন।" }); return; }
  if (decision === "REJECT" && !notes) { response.status(400).json({ error: "Reject করার কারণ লিখুন।" }); return; }

  const result = await prisma.$transaction(async transaction => {
    const referral = await transaction.referral.findFirst({
      where: { id: request.params.id, facilityId: profile.facilityId, status: "SENT" },
      select: { id: true, patientUserId: true, ownerStaffId: true, status: true },
    });
    if (!referral) return null;
    const nextStatus = decision === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "REJECTED";
    const changed = await transaction.referral.updateMany({ where: { id: referral.id, facilityId: profile.facilityId, status: "SENT" }, data: { status: nextStatus } });
    if (changed.count !== 1) return null;
    await transaction.referralEvent.create({ data: { referralId: referral.id, fromStatus: "SENT", toStatus: nextStatus, performedById: auth.userId, source: "facility_worker", notes: decision === "REJECT" ? notes : notes || `${profile.name} (${profile.facility.nameBn}) গ্রহণ করেছেন।` } });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: decision === "REJECT" ? "FACILITY_REFERRAL_REJECTED" : "FACILITY_REFERRAL_ACKNOWLEDGED", targetType: "Referral", targetId: referral.id, metadata: { facilityId: profile.facilityId, decision, notes: notes || null } } });
    return { referral, nextStatus };
  });
  if (!result) { response.status(404).json({ error: "এই facility-র জন্য পাঠানো pending referral পাওয়া যায়নি।" }); return; }
  if (result.referral.ownerStaffId) {
    await createInAppNotification({ userId: result.referral.ownerStaffId, type: "FACILITY_REFERRAL_UPDATE", title: result.nextStatus === "REJECTED" ? "Facility referral reject করেছে" : "Facility referral গ্রহণ করেছে", message: `${profile.facility.nameBn}: ${notes || (result.nextStatus === "REJECTED" ? "কারণ দেখুন referral history-তে।" : "Referral acknowledge করা হয়েছে।")}`, targetType: "Referral", targetId: result.referral.id, metadata: { status: result.nextStatus, facilityId: profile.facilityId } });
  }
  response.json({ data: { referralId: result.referral.id, status: result.nextStatus } });
});

export default router;
