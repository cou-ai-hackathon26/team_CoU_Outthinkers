import crypto from "node:crypto";
import axios from "axios";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import { suggestSafetyAlerts } from "./safety-alert-suggestions";
import { getStaffScope } from "./staff-scope";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));

router.get("/intake-requests", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const requests = await prisma.patientIntakeRequest.findMany({
    where: { status: { in: ["SUBMITTED", "PROCESSING", "READY_FOR_REVIEW"] }, ...(scope?.role === "ADMIN" ? {} : { patient: { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } } }) },
    orderBy: { submittedAt: "asc" },
    select: { id: true, status: true, transcriptText: true, aiSummary: true, submittedAt: true, patient: { select: { publicId: true, patientProfile: { select: { name: true, contactNumber: true, upazila: { select: { nameBn: true } }, district: { select: { nameBn: true } } } } } } },
  });
  response.json({ data: requests.map((item) => ({ id: item.id, status: item.status, transcriptText: item.transcriptText, aiSummary: item.aiSummary, submittedAt: item.submittedAt, patientId: item.patient.publicId, patientName: item.patient.patientProfile?.name || "নাম নেই", contactNumber: item.patient.patientProfile?.contactNumber || null, location: item.patient.patientProfile ? item.patient.patientProfile.upazila.nameBn + ", " + item.patient.patientProfile.district.nameBn : null })) });
});

router.get("/intake-requests/:id", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const intake = await prisma.patientIntakeRequest.findUnique({
    where: { id: request.params.id, ...(scope?.role === "ADMIN" ? {} : { patient: { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } } }) },
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

router.post("/intake-requests/:id/retry-extraction", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const existing = await prisma.patientIntakeRequest.findFirst({ where: { id: request.params.id, ...(scope?.role === "ADMIN" ? {} : { patient: { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } } }) }, select: { id: true, status: true, transcriptText: true } });
  if (!existing) { response.status(404).json({ error: "Intake খুঁজে পাওয়া যায়নি।" }); return; }
  if (existing.status === "VERIFIED" || existing.status === "REJECTED") { response.status(409).json({ error: "এই intake আর পুনরায় process করা যাবে না।" }); return; }
  if (!existing.transcriptText?.trim()) { response.status(400).json({ error: "Transcript না থাকায় summary তৈরি করা যাচ্ছে না।" }); return; }
  try {
    const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
    const result = await axios.post(`${aiUrl}/extract`, { transcript: existing.transcriptText }, { timeout: 120000 });
    const updated = await prisma.$transaction(async transaction => {
      const intake = await transaction.patientIntakeRequest.update({ where: { id: existing.id }, data: { status: "READY_FOR_REVIEW", aiSummary: result.data, reviewedAt: null, reviewedById: null }, select: { id: true, status: true, aiSummary: true } });
      await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "PATIENT_INTAKE_AI_SUMMARY_RETRIED", targetType: "PatientIntakeRequest", targetId: intake.id } });
      return intake;
    });
    response.json({ message: "AI summary আবার তৈরি হয়েছে।", data: updated });
  } catch (error) {
    console.error("AI intake retry failed", error);
    response.status(502).json({ error: axios.isAxiosError(error) ? String(error.response?.data?.detail || "AI service এখনো প্রস্তুত নয়।") : "AI summary তৈরি করা যায়নি।" });
  }
});

router.patch("/intake-requests/:id/review", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const status = String(request.body?.status || "").trim();
  const transcriptText = request.body?.transcriptText == null ? undefined : String(request.body.transcriptText).trim();
  const aiSummary = request.body?.aiSummary;
  if (!["VERIFIED", "REJECTED", "SUBMITTED"].includes(status)) {
    response.status(400).json({ error: "Review status সঠিক নয়।" }); return;
  }
  const existing = await prisma.patientIntakeRequest.findFirst({ where: { id: request.params.id, ...(scope?.role === "ADMIN" ? {} : { patient: { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } } }) }, select: { id: true, status: true, patientUserId: true, transcriptText: true } });
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
    let pregnancyCase: { id: string; caseCode: string } | null = null;
    if (status === "VERIFIED") {
      pregnancyCase = await transaction.pregnancyCase.findFirst({ where: { patientUserId: existing.patientUserId, status: "ACTIVE" }, select: { id: true, caseCode: true } });
      if (!pregnancyCase) {
        pregnancyCase = await transaction.pregnancyCase.create({
          data: { patientUserId: existing.patientUserId, caseCode: `MC-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, assignedStaffId: auth.userId, createdByUserId: auth.userId },
          select: { id: true, caseCode: true },
        });
      }
      const careEvent = await transaction.careEvent.create({ data: { pregnancyCaseId: pregnancyCase.id, eventType: "INITIAL_INTAKE", sourceType: "VOICE", verificationStatus: "CONFIRMED", summary: transcriptText || existing.transcriptText || null, createdByUserId: auth.userId }, select: { id: true } });
      const suggestions = suggestSafetyAlerts(transcriptText || existing.transcriptText || "", aiSummary);
      for (const suggestion of suggestions) {
        const duplicate = await transaction.safetyAlert.findFirst({ where: { careEventId: careEvent.id, title: suggestion.title } });
        if (!duplicate) {
          const alert = await transaction.safetyAlert.create({ data: { pregnancyCaseId: pregnancyCase.id, careEventId: careEvent.id, severity: suggestion.severity, title: suggestion.title, reason: suggestion.reason, sourceFacts: { rule: suggestion.code, matchedPhrases: suggestion.matchedPhrases, source: "verified_patient_intake" } }, select: { id: true } });
          await transaction.auditLog.create({ data: { actorType: "SYSTEM", action: "SAFETY_ALERT_SUGGESTED", targetType: "SafetyAlert", targetId: alert.id, metadata: { intakeRequestId: intake.id, rule: suggestion.code, severity: suggestion.severity } } });
        }
      }
      await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "PREGNANCY_CASE_CREATED_FROM_INTAKE", targetType: "PregnancyCase", targetId: pregnancyCase.id, metadata: { intakeRequestId: intake.id, caseCode: pregnancyCase.caseCode } } });
    }
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: `PATIENT_INTAKE_${status}`, targetType: "PatientIntakeRequest", targetId: intake.id, metadata: { previousStatus: existing.status, caseCode: pregnancyCase?.caseCode || null } } });
    return { ...intake, pregnancyCase };
  });
  response.json({ message: status === "VERIFIED" ? "Intake যাচাই করে সংরক্ষণ করা হয়েছে।" : status === "REJECTED" ? "Intake বাতিল করা হয়েছে।" : "Intake আবার review queue-তে পাঠানো হয়েছে।", data: updated });
});

export default router;
