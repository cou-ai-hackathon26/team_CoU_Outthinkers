import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import intakeRequestRouter from "./intake-request.router";
import careIntakeRouter from "./care-intake.router";
import followUpRouter from "./follow-up.router";
import { getStaffScope } from "./staff-scope";
import referralRouter from "./referral.router";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));
router.use(intakeRequestRouter);
router.use(careIntakeRouter);
router.use(followUpRouter);
router.use(referralRouter);

router.get("/notifications", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tasks = await prisma.followUpTask.findMany({ where: { assignedStaffId: auth.userId, status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lte: soon } }, select: { id: true, title: true, dueAt: true, priority: true } });
  for (const task of tasks) {
    const type = task.dueAt && task.dueAt < now ? "FOLLOW_UP_OVERDUE" : "FOLLOW_UP_DUE_SOON";
    const exists = await prisma.notification.findFirst({ where: { userId: auth.userId, type, targetType: "FollowUpTask", targetId: task.id, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }, select: { id: true } });
    if (!exists) await prisma.notification.create({ data: { userId: auth.userId, type, title: task.dueAt && task.dueAt < now ? "Follow-up overdue" : "Follow-up reminder", message: `${task.title} ${task.dueAt && task.dueAt < now ? "নির্ধারিত সময় পেরিয়েছে" : "আগামী ২৪ ঘণ্টার মধ্যে সম্পন্ন করুন"}।`, targetType: "FollowUpTask", targetId: task.id, metadata: { priority: task.priority, dueAt: task.dueAt } } });
  }
  const notifications = await prisma.notification.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ data: notifications, unreadCount: notifications.filter(item => !item.readAt).length });
});

router.patch("/notifications/:id/read", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const updated = await prisma.notification.updateMany({ where: { id: request.params.id, userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
  if (!updated.count) { response.status(404).json({ error: "Notification পাওয়া যায়নি।" }); return; }
  response.json({ message: "Notification পড়া হয়েছে।" });
});

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
      chatSessions: { orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, updatedAt: true, messages: { orderBy: { createdAt: "asc" }, take: 30, select: { id: true, role: true, content: true, urgency: true, intent: true, sources: true, requiresNurseReview: true, createdAt: true } } } },
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
