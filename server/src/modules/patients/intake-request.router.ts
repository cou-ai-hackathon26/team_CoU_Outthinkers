import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";

const router = Router();
router.use(requireAuth, requireRole("PATIENT"));

function clean(value: unknown) {
  return String(value || "").trim();
}

router.post("/intake-requests", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const transcriptText = clean(request.body?.transcriptText);
  const audioStorageKey = clean(request.body?.audioStorageKey) || null;
  const originalFilename = clean(request.body?.originalFilename) || null;
  const mimeType = clean(request.body?.mimeType) || null;

  if (!transcriptText) {
    response.status(400).json({ error: "আপনার কথার লিখিত রূপ প্রয়োজন।" });
    return;
  }

  const requestRecord = await prisma.$transaction(async (transaction) => {
    const intake = await transaction.patientIntakeRequest.create({
      data: { patientUserId: auth.userId, transcriptText, audioStorageKey, originalFilename, mimeType, status: "SUBMITTED", transcriptionStatus: "COMPLETED" },
      select: { id: true, status: true, submittedAt: true },
    });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "PATIENT_INTAKE_REQUEST_SUBMITTED", targetType: "PatientIntakeRequest", targetId: intake.id } });
    return intake;
  });

  response.status(201).json({ message: "আপনার care request স্বাস্থ্যকর্মীর কাছে পাঠানো হয়েছে।", data: requestRecord });
});

router.get("/intake-requests", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const requests = await prisma.patientIntakeRequest.findMany({
    where: { patientUserId: auth.userId },
    orderBy: { submittedAt: "desc" },
    select: { id: true, status: true, transcriptText: true, aiSummary: true, submittedAt: true, reviewedAt: true },
  });
  response.json({ data: requests });
});

export default router;
