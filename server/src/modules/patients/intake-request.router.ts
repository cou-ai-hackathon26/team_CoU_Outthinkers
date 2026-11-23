import { Router } from "express";
import axios from "axios";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import { aiServiceHeaders } from "../../lib/ai-client";

const router = Router();
router.use(requireAuth, requireRole("PATIENT"));

function clean(value: unknown) {
  return String(value || "").trim();
}

async function enrichIntake(intakeId: string, transcriptText: string) {
  try {
    const aiUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
    const result = await axios.post(`${aiUrl}/extract`, { transcript: transcriptText }, { timeout: 120000, headers: aiServiceHeaders() });
    const extractionFailed = result.data?.extractionStatus === "FAILED";
    await prisma.$transaction(async (transaction) => {
      await transaction.patientIntakeRequest.update({ where: { id: intakeId }, data: { status: "READY_FOR_REVIEW", aiSummary: result.data } });
      await transaction.auditLog.create({ data: { actorType: "SYSTEM", action: extractionFailed ? "PATIENT_INTAKE_AI_SUMMARY_FAILED" : "PATIENT_INTAKE_AI_SUMMARY_CREATED", targetType: "PatientIntakeRequest", targetId: intakeId } });
    });
  } catch (error) {
    console.error("AI intake extraction failed", error);
    await prisma.$transaction(async (transaction) => {
      await transaction.patientIntakeRequest.update({ where: { id: intakeId }, data: { status: "READY_FOR_REVIEW", aiSummary: { extractionStatus: "FAILED", uncertain_fields: ["AI summary তৈরি করা যায়নি; transcript নিজে যাচাই করুন"] } } });
      await transaction.auditLog.create({ data: { actorType: "SYSTEM", action: "PATIENT_INTAKE_AI_SUMMARY_FAILED", targetType: "PatientIntakeRequest", targetId: intakeId } });
    }).catch((updateError) => console.error("Failed to save AI extraction status", updateError));
  }
}

router.post("/intake-requests", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const transcriptText = clean(request.body?.transcriptText);
  const sourceType = request.body?.sourceType === "MANUAL" ? "MANUAL" : "VOICE";
  const audioStorageKey = clean(request.body?.audioStorageKey) || null;
  const originalFilename = clean(request.body?.originalFilename) || null;
  const mimeType = clean(request.body?.mimeType) || null;

  if (!transcriptText) {
    response.status(400).json({ error: "আপনার কথার লিখিত রূপ প্রয়োজন।" });
    return;
  }

  const duplicate = await prisma.patientIntakeRequest.findFirst({
    where: { patientUserId: auth.userId, transcriptText, submittedAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true, status: true, submittedAt: true },
  });
  if (duplicate) {
    response.status(200).json({ message: "এই তথ্যটি ইতিমধ্যে পাঠানো হয়েছে।", data: duplicate });
    return;
  }

  const requestRecord = await prisma.$transaction(async (transaction) => {
    const intake = await transaction.patientIntakeRequest.create({
      data: { patientUserId: auth.userId, sourceType, transcriptText, audioStorageKey, originalFilename, mimeType, status: "PROCESSING", transcriptionStatus: "COMPLETED" },
      select: { id: true, status: true, submittedAt: true },
    });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "PATIENT_INTAKE_REQUEST_SUBMITTED", targetType: "PatientIntakeRequest", targetId: intake.id } });
    return intake;
  });

  void enrichIntake(requestRecord.id, transcriptText);
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
