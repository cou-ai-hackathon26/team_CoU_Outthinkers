import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import intakeRequestRouter from "./intake-request.router";
import careIntakeRouter from "./care-intake.router";
import followUpRouter from "./follow-up.router";
import { getStaffScope } from "./staff-scope";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));
router.use(intakeRequestRouter);
router.use(careIntakeRouter);
router.use(followUpRouter);

router.get("/me", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const [user, pendingIntakes, assignedPatients] = await Promise.all([prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, phone: true, role: true, status: true, staffProfile: { select: { name: true, employeeId: true, address: true, division: { select: { nameBn: true } }, district: { select: { nameBn: true } }, upazila: { select: { nameBn: true } } } } },
  }), prisma.patientIntakeRequest.count({ where: { status: { in: ["SUBMITTED", "PROCESSING", "READY_FOR_REVIEW"] }, ...(scope?.role === "ADMIN" ? {} : { patient: { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } } }) } }), prisma.pregnancyCase.count({ where: { assignedStaffId: auth.userId, status: "ACTIVE" } })]);
  if (!user || user.status !== "ACTIVE") { response.status(401).json({ error: "অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।" }); return; }
  response.json({ data: { ...user, dashboard: { pendingIntakes, assignedPatients } } });
});

router.get("/patients/search", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const query = String(request.query.query || "").trim();
  if (query.length < 2) {
    response.status(400).json({ error: "কমপক্ষে ২টি অক্ষর বা সংখ্যা লিখুন।" });
    return;
  }

  const patients = await prisma.user.findMany({
    where: {
      role: "PATIENT",
      status: "ACTIVE",
      ...(scope?.role === "ADMIN" ? {} : { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } }),
      OR: [
        { publicId: { contains: query } },
        { phone: { contains: query } },
        { email: { contains: query, mode: "insensitive" } },
        { patientProfile: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      publicId: true,
      email: true,
      phone: true,
      patientProfile: {
        select: {
          name: true,
          contactNumber: true,
          division: { select: { nameBn: true } },
          district: { select: { nameBn: true } },
          upazila: { select: { nameBn: true } },
        },
      },
    },
  });

  response.json({
    data: patients.map((patient) => ({
      patientId: patient.publicId,
      name: patient.patientProfile?.name || "নাম নেই",
      contactNumber: patient.patientProfile?.contactNumber || patient.phone,
      email: patient.email,
      location: patient.patientProfile ? `${patient.patientProfile.upazila.nameBn}, ${patient.patientProfile.district.nameBn}` : null,
    })),
  });
});

router.get("/patients/:patientId/care-summary", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const scope = await getStaffScope(auth.userId);
  const patient = await prisma.user.findFirst({
    where: { publicId: request.params.patientId, role: "PATIENT", status: "ACTIVE", ...(scope?.role === "ADMIN" ? {} : { patientProfile: { upazilaId: scope?.upazilaId || "__unassigned__" } }) },
    select: {
      publicId: true, email: true, phone: true,
      patientProfile: { select: { name: true, contactNumber: true, emergencyContactNumber: true, address: true, division: { select: { nameBn: true } }, district: { select: { nameBn: true } }, upazila: { select: { nameBn: true } } } },
      pregnancyCases: { orderBy: { createdAt: "desc" }, select: {
        id: true, caseCode: true, status: true, createdAt: true, expectedDeliveryDate: true,
        careEvents: { orderBy: { occurredAt: "desc" }, select: { id: true, eventType: true, sourceType: true, verificationStatus: true, summary: true, occurredAt: true } },
        followUpTasks: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, reason: true, priority: true, status: true, dueAt: true } },
        safetyAlerts: { orderBy: { createdAt: "desc" }, select: { id: true, severity: true, title: true, reason: true, status: true, createdAt: true } },
      } },
    },
  });
  if (!patient) { response.status(404).json({ error: "Patient খুঁজে পাওয়া যায়নি।" }); return; }
  response.json({ data: patient });
});

export default router;
