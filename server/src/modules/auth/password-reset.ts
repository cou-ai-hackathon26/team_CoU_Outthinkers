import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { deliverPasswordResetEmail } from "../notifications/otp-delivery";

const router = Router();
const TOKEN_TTL_HOURS = 1;

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/staff/forgot-password", async (request, response) => {
  const identifier = normalize(request.body?.identifier);

  if (!identifier) {
    response.status(400).json({ error: "ইমেইল অথবা কর্মী আইডি দিন।" });
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      status: "ACTIVE",
      role: { in: ["NURSE", "ADMIN"] },
      OR: [{ email: identifier }, { staffProfile: { employeeId: identifier } }],
    },
    select: { id: true, email: true },
  });

  if (user?.email) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    await prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000),
        },
      });
      await transaction.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "PASSWORD_RESET_REQUESTED",
          targetType: "User",
          targetId: user.id,
        },
      });
    });

    const baseUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
    try {
      await deliverPasswordResetEmail(user.email, resetUrl);
    } catch (error) {
      console.error("Password reset email failed", error);
      response.status(503).json({ error: "পাসওয়ার্ড পরিবর্তনের email পাঠানো যায়নি।" });
      return;
    }
  }

  response.json({ message: "যদি তথ্যটি সঠিক হয়, পাসওয়ার্ড পরিবর্তনের নির্দেশনা email-এ পাঠানো হয়েছে।" });
});

router.post("/staff/reset-password", async (request, response) => {
  const token = String(request.body?.token || "").trim();
  const password = String(request.body?.password || "");

  if (!token || password.length < 12) {
    response.status(400).json({ error: "Token এবং কমপক্ষে ১২ অক্ষরের নতুন পাসওয়ার্ড দিন।" });
    return;
  }

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true },
  });

  if (!resetToken) {
    response.status(400).json({ error: "লিংকটি সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { consumedAt: new Date() } }),
    prisma.auditLog.create({ data: { actorType: "USER", actorUserId: resetToken.userId, action: "PASSWORD_RESET_COMPLETED", targetType: "User", targetId: resetToken.userId } }),
  ]);

  response.json({ message: "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে।" });
});

export default router;
