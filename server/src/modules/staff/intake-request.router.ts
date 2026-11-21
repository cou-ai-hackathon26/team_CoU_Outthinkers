import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));

router.get("/intake-requests", async (_request, response) => {
  const requests = await prisma.patientIntakeRequest.findMany({
    where: { status: { in: ["SUBMITTED", "PROCESSING", "READY_FOR_REVIEW"] } },
    orderBy: { submittedAt: "asc" },
    select: { id: true, status: true, transcriptText: true, aiSummary: true, submittedAt: true, patient: { select: { publicId: true, patientProfile: { select: { name: true, contactNumber: true, upazila: { select: { nameBn: true } }, district: { select: { nameBn: true } } } } } } },
  });
  response.json({ data: requests.map((item) => ({ id: item.id, status: item.status, transcriptText: item.transcriptText, aiSummary: item.aiSummary, submittedAt: item.submittedAt, patientId: item.patient.publicId, patientName: item.patient.patientProfile?.name || "নাম নেই", contactNumber: item.patient.patientProfile?.contactNumber || null, location: item.patient.patientProfile ? item.patient.patientProfile.upazila.nameBn + ", " + item.patient.patientProfile.district.nameBn : null })) });
});

router.get("/intake-requests/:id", async (request, response) => {
  const intake = await prisma.patientIntakeRequest.findUnique({
    where: { id: request.params.id },
    select: {
      id: true, status: true, transcriptText: true, aiSummary: true, submittedAt: true, reviewedAt: true,
      patient: {
        select: {
          publicId: true, email: true, phone: true,
          patientProfile: {
            select: {
              name: true, contactNumber: true, emergencyContactNumber: true, dateOfBirth: true, address: true,
              division: { select: { nameBn: true } }, district: { select: { nameBn: true } }, upazila: { select: { nameBn: true } },
            },
          },
        },
      },
    },
  });
  if (!intake) { response.status(404).json({ error: "Intake খুঁজে পাওয়া যায়নি।" }); return; }
  response.json({ data: intake });
});

router.patch("/intake-requests/:id/review", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const status = String(request.body?.status || "").trim();
  const transcriptText = request.body?.transcriptText == null ? undefined : String(request.body.transcriptText).trim();
  const aiSummary = request.body?.aiSummary;
  if (!["VERIFIED", "REJECTED", "SUBMITTED"].includes(status)) {
    response.status(400).json({ error: "Review status সঠিক নয়।" }); return;
  }
  const existing = await prisma.patientIntakeRequest.findUnique({ where: { id: request.params.id }, select: { id: true, status: true } });
  if (!existing) { response.status(404).json({ error: "Intake খুঁজে পাওয়া যায়নি।" }); return; }
  if (existing.status === "VERIFIED" || existing.status === "REJECTED") {
    response.status(409).json({ error: "এই intake ইতিমধ্যে review করা হয়েছে।" }); return;
  }
  const updated = await prisma.$transaction(async (transaction) => {
    const intake = await transaction.patientIntakeRequest.update({
      where: { id: request.params.id },
      data: { status: status as "VERIFIED" | "REJECTED" | "SUBMITTED", transcriptText, aiSummary, reviewedAt: new Date(), reviewedById: auth.userId },
      select: { id: true, status: true, reviewedAt: true },
    });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: `PATIENT_INTAKE_${status}`, targetType: "PatientIntakeRequest", targetId: intake.id, metadata: { previousStatus: existing.status } } });
    return intake;
  });
  response.json({ message: status === "VERIFIED" ? "Intake যাচাই করে সংরক্ষণ করা হয়েছে।" : status === "REJECTED" ? "Intake বাতিল করা হয়েছে।" : "Intake আবার review queue-তে পাঠানো হয়েছে।", data: updated });
});

export default router;
