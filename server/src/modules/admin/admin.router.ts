import bcrypt from "bcryptjs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Request, Response, Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import { allocatePublicId } from "../auth/id-counter";
import adminOverviewRouter from "./admin-overview";

const router = Router();
router.use(adminOverviewRouter);
router.use(requireAuth, requireRole("ADMIN"));

function clean(value: unknown) {
  return String(value || "").trim();
}

function email(value: unknown) {
  const result = clean(value).toLowerCase();
  return result || null;
}

function phone(value: unknown) {
  return clean(value).replace(/[\s-]/g, "");
}

function knowledgeManifestPath() {
  return process.env.KNOWLEDGE_MANIFEST_PATH || path.resolve(process.cwd(), "..", "ai-service", "knowledge", "sources_manifest.json");
}

async function readKnowledgeManifest() {
  const content = await readFile(knowledgeManifestPath(), "utf8");
  return JSON.parse(content) as { documents: Array<Record<string, unknown>> };
}

async function createAccount(request: Request, response: Response, role: "NURSE" | "ADMIN") {
  const body = request.body || {};
  const accountEmail = email(body.email);
  const password = clean(body.password);
  const name = clean(body.name);
  const accountPhone = phone(body.phone);
  const address = clean(body.address);
  const divisionId = clean(body.divisionId);
  const districtId = clean(body.districtId);
  const upazilaId = clean(body.upazilaId);

  if (!accountEmail || !password || password.length < 12) {
    response.status(400).json({ error: "সঠিক ইমেইল এবং কমপক্ষে ১২ অক্ষরের পাসওয়ার্ড দিন।" });
    return;
  }

  if (role === "NURSE" && (!name || !accountPhone || !address || !divisionId || !districtId || !upazilaId)) {
    response.status(400).json({ error: "কর্মীর সব তথ্য পূরণ করুন।" });
    return;
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.user.findFirst({
        where: { OR: [{ email: accountEmail }, ...(accountPhone ? [{ phone: accountPhone }] : [])] },
        select: { id: true },
      });
      if (duplicate) throw new Error("DUPLICATE_ACCOUNT");

      if (role === "NURSE") {
        const location = await transaction.upazila.findFirst({
          where: { id: upazilaId, districtId, district: { divisionId } },
          select: { id: true },
        });
        if (!location) throw new Error("INVALID_LOCATION");
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const employeeId = role === "NURSE" ? await allocatePublicId(transaction, "EMPLOYEE") : null;
      const user = await transaction.user.create({
        data: {
          role,
          email: accountEmail,
          phone: accountPhone || null,
          passwordHash,
          ...(role === "NURSE" && employeeId
            ? { staffProfile: { create: { employeeId, name, address, divisionId, districtId, upazilaId } } }
            : {}),
        },
        select: { id: true, email: true, role: true },
      });

      await transaction.auditLog.create({
        data: {
          actorType: "USER",
          actorUserId: response.locals.auth.userId,
          action: role === "NURSE" ? "NURSE_CREATED" : "ADMIN_CREATED",
          targetType: "User",
          targetId: user.id,
          metadata: { email: user.email },
        },
      });
      return { ...user, employeeId };
    });

    response.status(201).json({
      message: role === "NURSE" ? "নার্স/কমিউনিটি হেলথ ওয়ার্কার তৈরি হয়েছে।" : "অ্যাডমিন তৈরি হয়েছে।",
      account: { email: created.email, role: created.role, employeeId: created.employeeId },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_ACCOUNT") {
      response.status(409).json({ error: "এই ইমেইল বা মোবাইল নম্বর আগে থেকেই ব্যবহৃত হয়েছে।" });
      return;
    }
    if (error instanceof Error && error.message === "INVALID_LOCATION") {
      response.status(400).json({ error: "এলাকার তথ্য সঠিক নয়।" });
      return;
    }
    console.error("Admin account creation failed", error);
    response.status(500).json({ error: "অ্যাকাউন্ট তৈরি করা যায়নি।" });
  }
}

router.post("/nurses", (request, response) => createAccount(request, response, "NURSE"));
router.post("/admins", (request, response) => createAccount(request, response, "ADMIN"));

router.get("/knowledge-documents", async (_request, response) => {
  try {
    const manifest = await readKnowledgeManifest();
    response.json({ data: manifest.documents.map((document, index) => ({ ...document, index })) });
  } catch (error) {
    console.error("Knowledge manifest read failed", error);
    response.status(500).json({ error: "Knowledge document list লোড করা যায়নি।" });
  }
});

router.patch("/knowledge-documents/:index", async (request, response) => {
  const index = Number(request.params.index);
  const status = clean(request.body?.status).toUpperCase();
  const reviewer = clean(request.body?.reviewer);
  const notes = clean(request.body?.notes);
  if (!Number.isInteger(index) || !["APPROVED", "REJECTED", "REVIEW_REQUIRED"].includes(status) || !reviewer) {
    response.status(400).json({ error: "সঠিক review status এবং reviewer দিন।" });
    return;
  }
  try {
    const manifest = await readKnowledgeManifest();
    const document = manifest.documents[index];
    if (!document) { response.status(404).json({ error: "Document খুঁজে পাওয়া যায়নি।" }); return; }
    document.review_status = status;
    document.reviewed_by = reviewer;
    document.reviewed_at = new Date().toISOString();
    document.review_notes = notes;
    await writeFile(knowledgeManifestPath(), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    await prisma.auditLog.create({ data: { actorType: "USER", actorUserId: response.locals.auth.userId, action: `KNOWLEDGE_${status}`, targetType: "KnowledgeDocument", targetId: String(document.file || document.title || index), metadata: { reviewer, notes } } });
    response.json({ data: { ...document, index } });
  } catch (error) {
    console.error("Knowledge document review failed", error);
    response.status(500).json({ error: "Document review সংরক্ষণ করা যায়নি।" });
  }
});

export default router;
