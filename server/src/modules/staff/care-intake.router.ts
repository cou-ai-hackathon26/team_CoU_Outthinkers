import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));

function clean(value: unknown) { return String(value || "").trim(); }

router.post("/care-intakes", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const patientId = clean(request.body?.patientId);
  const summary = clean(request.body?.summary);
  const lmp = clean(request.body?.lastMenstrualPeriod);
  const edd = clean(request.body?.expectedDeliveryDate);
  const gravida = request.body?.gravida === "" || request.body?.gravida == null ? null : Number(request.body.gravida);
  const para = request.body?.para === "" || request.body?.para == null ? null : Number(request.body.para);

  if (!patientId || !summary) {
    response.status(400).json({ error: "Patient এবং প্রাথমিক পর্যবেক্ষণ দিন।" });
    return;
  }
  if ((gravida !== null && (!Number.isInteger(gravida) || gravida < 0)) || (para !== null && (!Number.isInteger(para) || para < 0))) {
    response.status(400).json({ error: "গর্ভধারণের সংখ্যা সঠিক নয়।" });
    return;
  }

  const [patient, staff] = await Promise.all([
    prisma.user.findFirst({ where: { publicId: patientId, role: "PATIENT", status: "ACTIVE" }, select: { id: true, publicId: true } }),
    prisma.user.findUnique({ where: { id: auth.userId }, select: { role: true } }),
  ]);
  if (!patient || !staff) {
    response.status(404).json({ error: "Patient খুঁজে পাওয়া যায়নি।" });
    return;
  }

  const parseDate = (value: string) => value ? new Date(`${value}T00:00:00.000Z`) : null;
  const lastMenstrualPeriod = parseDate(lmp);
  const expectedDeliveryDate = parseDate(edd);
  if ((lmp && Number.isNaN(lastMenstrualPeriod?.getTime())) || (edd && Number.isNaN(expectedDeliveryDate?.getTime()))) {
    response.status(400).json({ error: "তারিখ সঠিক নয়।" });
    return;
  }

  const caseCode = `MC-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const created = await prisma.$transaction(async (transaction) => {
    const pregnancyCase = await transaction.pregnancyCase.create({
      data: {
        patientUserId: patient.id,
        caseCode,
        assignedStaffId: auth.userId,
        createdByUserId: auth.userId,
        lastMenstrualPeriod,
        expectedDeliveryDate,
        gravida,
        para,
        careEvents: { create: { eventType: "INITIAL_INTAKE", sourceType: "MANUAL", verificationStatus: "CONFIRMED", summary, createdByUserId: auth.userId } },
      },
      select: { id: true, caseCode: true },
    });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: "CARE_INTAKE_CREATED", targetType: "PregnancyCase", targetId: pregnancyCase.id, metadata: { patientId, caseCode } } });
    return pregnancyCase;
  });

  response.status(201).json({ message: "Care intake সংরক্ষণ হয়েছে।", data: { caseCode: created.caseCode, patientId: patient.publicId } });
});

export default router;
