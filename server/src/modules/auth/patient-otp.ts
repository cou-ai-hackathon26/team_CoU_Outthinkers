import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { createAuthToken } from "./auth-token";
import { deliverPatientOtp } from "../notifications/otp-delivery";

const router = Router();
const OTP_TTL_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value: string) {
  const compact = value.replace(/[\s-]/g, "");
  if (compact.startsWith("+880")) return `0${compact.slice(4)}`;
  if (compact.startsWith("880") && compact.length === 13) return `0${compact.slice(3)}`;
  return compact;
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

async function writeAudit(action: string, targetId?: string, metadata?: object) {
  await prisma.auditLog.create({
    data: { actorType: "SYSTEM", action, targetType: "User", targetId, metadata },
  });
}

router.post("/patient/request-otp", async (request, response) => {
  const rawIdentifier = normalize(request.body?.identifier);
  const identifier = normalizePhone(rawIdentifier);

  if (!identifier) {
    response.status(400).json({ error: "মোবাইল নম্বর, ইমেইল অথবা Patient ID দিন।" });
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      role: "PATIENT",
      status: "ACTIVE",
      OR: [{ publicId: identifier }, { phone: identifier }, { email: identifier }],
    },
    select: { id: true, publicId: true, phone: true, email: true },
  });

  // Email is the production OTP channel until an SMS gateway is configured.
  // Patient ID can also be used when the account has a registered email.
  const destination = user?.email || user?.phone || (identifier.includes("@") ? identifier : "");
  const channel = user?.email ? "email" : "sms";

  if (!user || !destination) {
    response.json({ message: "যদি account থাকে, নিবন্ধিত মাধ্যমে OTP পাঠানো হয়েছে।" });
    return;
  }
  const latest = await prisma.otpChallenge.findFirst({
    where: { destination, purpose: "PATIENT_LOGIN", createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (latest) {
    response.json({ message: "অনুরোধটি গ্রহণ করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" });
    return;
  }

  const code = generateCode();
  const challenge = await prisma.otpChallenge.create({
    data: {
      userId: user?.id,
      purpose: "PATIENT_LOGIN",
      destination,
      codeHash: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
    select: { id: true },
  });

  if (user) {
    await writeAudit("PATIENT_OTP_REQUESTED", user.id, { destinationType: channel });
  }

  try {
    await deliverPatientOtp(channel, destination, code);
  } catch (error) {
    await prisma.otpChallenge.delete({ where: { id: challenge.id } });
    console.error("OTP delivery failed", error);
    response.status(503).json({ error: "OTP পাঠানো যায়নি। পরে আবার চেষ্টা করুন।" });
    return;
  }

  response.json({
    message: "নিবন্ধিত যোগাযোগ মাধ্যমে OTP পাঠানো হয়েছে।",
    challengeId: challenge.id,
  });
});

router.post("/patient/verify-otp", async (request, response) => {
  const challengeId = normalize(request.body?.challengeId);
  const code = String(request.body?.code || "").trim();

  if (!challengeId || !/^\d{6}$/.test(code)) {
    response.status(400).json({ error: "৬ সংখ্যার OTP দিন।" });
    return;
  }

  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || !challenge.userId || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= MAX_ATTEMPTS) {
    response.status(401).json({ error: "OTP সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।" });
    return;
  }

  const valid = await bcrypt.compare(code, challenge.codeHash);
  if (!valid) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    await writeAudit("PATIENT_OTP_VERIFICATION_FAILED", challenge.userId);
    response.status(401).json({ error: "OTP সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: challenge.userId }, select: { id: true, role: true, status: true, publicId: true } });
  if (!user || user.role !== "PATIENT" || user.status !== "ACTIVE") {
    response.status(401).json({ error: "অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।" });
    return;
  }

  await prisma.$transaction([
    prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } }),
    prisma.auditLog.create({ data: { actorType: "USER", actorUserId: user.id, action: "PATIENT_OTP_VERIFIED", targetType: "User", targetId: user.id } }),
  ]);

  response.json({ message: "লগইন সফল হয়েছে।", token: createAuthToken(user.id, "PATIENT"), patientId: user.publicId });
});

export default router;
