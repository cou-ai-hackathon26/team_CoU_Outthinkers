import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../lib/prisma";

export type AuthClaims = {
  userId: string;
  role: "PATIENT" | "NURSE" | "FACILITY_WORKER" | "ADMIN";
  issuedAt: number;
  expiresAt: number;
};

function secret() {
  const value = process.env.AUTH_TOKEN_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_TOKEN_SECRET must contain at least 32 characters");
  }
  return value;
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function sign(input: string) {
  return crypto.createHmac("sha256", secret()).update(input).digest("base64url");
}

export function createAuthToken(userId: string, role: AuthClaims["role"]) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AuthClaims = {
    userId,
    role,
    issuedAt,
    expiresAt: issuedAt + 60 * 60 * 12,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyAuthToken(token: string): AuthClaims | null {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = sign(encodedPayload);
  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as AuthClaims;
    if (!claims.userId || !claims.role || claims.expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const claims = token ? verifyAuthToken(token) : null;
  if (!claims) {
    response.status(401).json({ error: "অনুমতি প্রয়োজন।" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { role: true, status: true } });
    if (!user || user.status !== "ACTIVE" || user.role !== claims.role) {
      response.status(401).json({ error: "অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।" });
      return;
    }
    response.locals.auth = claims;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: AuthClaims["role"][]) {
  return (request: Request, response: Response, next: NextFunction) => {
    const auth = response.locals.auth as AuthClaims | undefined;
    if (!auth || !roles.includes(auth.role)) {
      response.status(403).json({ error: "এই কাজের অনুমতি আপনার নেই।" });
      return;
    }
    next();
  };
}
