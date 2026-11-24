import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { createAuthToken } from "./auth-token";

const router = Router();

router.post("/staff/login", async (request, response) => {
  const identifier = String(request.body?.identifier || "").trim().toLowerCase();
  const password = String(request.body?.password || "");

  if (!identifier || !password) {
    response.status(400).json({ error: "ইমেইল/কর্মী আইডি এবং পাসওয়ার্ড দিন।" });
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { staffProfile: { employeeId: identifier } }, { facilityWorkerProfile: { employeeId: identifier } }],
      role: { in: ["NURSE", "FACILITY_WORKER", "ADMIN"] },
      status: "ACTIVE",
    },
    select: { id: true, role: true, passwordHash: true },
  });

  const passwordMatches = user?.passwordHash
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!user || !passwordMatches) {
    await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "STAFF_LOGIN_FAILED",
        targetType: "User",
        metadata: { identifier },
      },
    });
    response.status(401).json({ error: "লগইন তথ্য সঠিক নয়।" });
    return;
  }

  const token = createAuthToken(user.id, user.role);
  await prisma.auditLog.create({
    data: {
      actorType: "USER",
      actorUserId: user.id,
      action: "STAFF_LOGIN_SUCCEEDED",
      targetType: "User",
      targetId: user.id,
    },
  });

  response.json({
    message: "লগইন সফল হয়েছে।",
    token,
    role: user.role,
  });
});

export default router;
