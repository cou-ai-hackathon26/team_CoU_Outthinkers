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

export default router;
