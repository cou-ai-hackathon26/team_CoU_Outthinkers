import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import intakeRequestRouter from "./intake-request.router";

const router = Router();
router.use(requireAuth, requireRole("PATIENT"));
router.use(intakeRequestRouter);

router.get("/follow-ups", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const tasks = await prisma.followUpTask.findMany({
    where: { patientUserId: auth.userId, status: { not: "CANCELLED" } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 50,
    select: { id: true, title: true, reason: true, priority: true, status: true, dueAt: true, outcome: true, nextAction: true, completedAt: true },
  });
  response.json({ data: tasks });
});

router.get("/me", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const [user, activeRequests, openFollowUps] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: { publicId: true, email: true, phone: true, status: true, patientProfile: { select: { name: true, contactNumber: true, dateOfBirth: true, emergencyContactNumber: true, address: true, division: { select: { nameBn: true } }, district: { select: { nameBn: true } }, upazila: { select: { nameBn: true } } } } },
    }),
    prisma.patientIntakeRequest.count({ where: { patientUserId: auth.userId, status: { notIn: ["VERIFIED", "REJECTED"] } } }),
    prisma.followUpTask.count({ where: { patientUserId: auth.userId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);
  if (!user || user.status !== "ACTIVE" || !user.patientProfile) { response.status(401).json({ error: "অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।" }); return; }
  response.json({ data: { ...user, dashboard: { activeRequests, openFollowUps, accountStatus: user.status } } });
});

export default router;
