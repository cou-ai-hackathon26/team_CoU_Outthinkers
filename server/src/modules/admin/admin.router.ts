import bcrypt from "bcryptjs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Request, Response, Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import { allocatePublicId } from "../auth/id-counter";
import adminOverviewRouter from "./admin-overview";
import supervisionRouter from "./supervision.router";
import facilitiesRouter from "./facilities.router";

const router = Router();
router.use(adminOverviewRouter);
router.use(supervisionRouter);
router.use(requireAuth, requireRole("ADMIN"));
router.use(facilitiesRouter);

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

router.get("/facility-worker-options", async (request, response) => {
  const upazilaId = clean(request.query.upazilaId);
  if (!upazilaId) { response.status(400).json({ error: "আগে উপজেলা নির্বাচন করুন।" }); return; }
  const upazila = await prisma.upazila.findUnique({ where: { id: upazilaId }, select: { id: true, nameBn: true, nameEn: true, district: { select: { nameBn: true, nameEn: true, division: { select: { nameBn: true, nameEn: true } } } } } });
  if (!upazila) { response.status(404).json({ error: "নির্বাচিত উপজেলা পাওয়া যায়নি।" }); return; }
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) { response.status(503).json({ error: "Google Maps API key configured নয়; hospital suggestion আনা যাচ্ছে না।" }); return; }
  const areaLabel = `${upazila.nameEn}, ${upazila.district.nameEn}, ${upazila.district.division.nameEn}, Bangladesh`;
  try {
    const areaResult = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.location,places.formattedAddress" },
      body: JSON.stringify({ textQuery: areaLabel, maxResultCount: 1, languageCode: "bn", regionCode: "BD" }), signal: AbortSignal.timeout(8000),
    });
    if (!areaResult.ok) throw new Error(`Google area lookup HTTP ${areaResult.status}`);
    const area = (await areaResult.json() as any).places?.[0];
    if (!area?.location) { response.json({ data: { area: { nameBn: upazila.nameBn, approximate: true }, verifiedFacilities: [], googleSuggestions: [], googleAvailable: true } }); return; }
    const { latitude, longitude } = area.location;
    const radius = 30000;
    const span = radius / 111000;
    const candidates = await prisma.facility.findMany({ where: { status: "VERIFIED", latitude: { gte: latitude - span, lte: latitude + span }, longitude: { gte: longitude - span, lte: longitude + span } }, orderBy: { nameBn: "asc" }, take: 100, select: { id: true, nameBn: true, addressBn: true, phone: true, latitude: true, longitude: true, googlePlaceId: true, verifiedAt: true } });
    const distanceKm = (lat: number, lng: number) => { const rad = (n: number) => n * Math.PI / 180; const dLat = rad(lat - latitude); const dLng = rad(lng - longitude); const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(latitude)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };
    const verifiedFacilities = candidates.map(item => ({ ...item, distanceKm: Number(distanceKm(item.latitude, item.longitude).toFixed(1)) })).filter(item => item.distanceKm * 1000 <= radius).sort((a, b) => a.distanceKm - b.distanceKm);
    const placesResult = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus" },
      body: JSON.stringify({ includedTypes: ["hospital", "medical_clinic"], maxResultCount: 10, rankPreference: "DISTANCE", languageCode: "bn", regionCode: "BD", locationRestriction: { circle: { center: { latitude, longitude }, radius } } }), signal: AbortSignal.timeout(10000),
    });
    if (!placesResult.ok) throw new Error(`Google Places search HTTP ${placesResult.status}`);
    const places = (await placesResult.json() as any).places || [];
    const verifiedPlaceIds = new Set(verifiedFacilities.map(item => item.googlePlaceId).filter(Boolean));
    const googleSuggestions = places.filter((place: any) => !verifiedPlaceIds.has(place.id)).map((place: any) => ({ placeId: place.id, name: place.displayName?.text || "নাম পাওয়া যায়নি", address: place.formattedAddress || "ঠিকানা পাওয়া যায়নি", latitude: place.location?.latitude, longitude: place.location?.longitude, googleMapsUri: place.googleMapsUri || null, distanceKm: Number(distanceKm(place.location?.latitude || latitude, place.location?.longitude || longitude).toFixed(1)), trusted: false, status: "UNVERIFIED" }));
    response.json({ data: { area: { nameBn: `${upazila.nameBn}, ${upazila.district.nameBn}`, address: area.formattedAddress, approximate: true }, verifiedFacilities, googleSuggestions, googleAvailable: true } });
  } catch (error) {
    console.error("Facility worker hospital suggestions failed", error);
    response.status(502).json({ error: "এই এলাকার hospital suggestion আনা যায়নি। আবার চেষ্টা করুন।" });
  }
});

router.post("/facility-workers", async (request, response) => {
  const accountEmail = email(request.body?.email);
  const accountPhone = phone(request.body?.phone);
  const password = clean(request.body?.password);
  const name = clean(request.body?.name);
  const facilityId = clean(request.body?.facilityId);
  const divisionId = clean(request.body?.divisionId);
  const districtId = clean(request.body?.districtId);
  const upazilaId = clean(request.body?.upazilaId);
  if (!accountEmail || !accountPhone || !name || !facilityId || !divisionId || !districtId || !upazilaId || password.length < 12) {
    response.status(400).json({ error: "নাম, ইমেইল, মোবাইল, এলাকা, verified facility এবং কমপক্ষে ১২ অক্ষরের password দিন।" });
    return;
  }
  try {
    const created = await prisma.$transaction(async transaction => {
      const duplicate = await transaction.user.findFirst({ where: { OR: [{ email: accountEmail }, { phone: accountPhone }] }, select: { id: true } });
      if (duplicate) throw new Error("DUPLICATE_ACCOUNT");
      const facility = await transaction.facility.findFirst({ where: { id: facilityId, status: "VERIFIED" }, select: { id: true } });
      if (!facility) throw new Error("FACILITY_NOT_VERIFIED");
      const location = await transaction.upazila.findFirst({ where: { id: upazilaId, districtId, district: { divisionId } }, select: { id: true } });
      if (!location) throw new Error("INVALID_LOCATION");
      const employeeId = await allocatePublicId(transaction, "EMPLOYEE");
      const user = await transaction.user.create({
        data: {
          role: "FACILITY_WORKER",
          email: accountEmail,
          phone: accountPhone,
          passwordHash: await bcrypt.hash(password, 12),
          facilityWorkerProfile: { create: { employeeId, name, facilityId, divisionId, districtId, upazilaId } },
        },
        select: { id: true, email: true, role: true },
      });
      await transaction.auditLog.create({
        data: { actorType: "USER", actorUserId: response.locals.auth.userId, action: "FACILITY_WORKER_CREATED", targetType: "User", targetId: user.id, metadata: { email: user.email, facilityId, employeeId } },
      });
      return { ...user, employeeId };
    });
    response.status(201).json({ message: "Facility worker account তৈরি হয়েছে।", account: created });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_ACCOUNT") { response.status(409).json({ error: "এই ইমেইল বা মোবাইল নম্বর আগে থেকেই ব্যবহৃত হয়েছে।" }); return; }
    if (error instanceof Error && error.message === "FACILITY_NOT_VERIFIED") { response.status(400).json({ error: "শুধু verified facility-তে worker account তৈরি করা যাবে।" }); return; }
    if (error instanceof Error && error.message === "INVALID_LOCATION") { response.status(400).json({ error: "বিভাগ, জেলা ও উপজেলার নির্বাচন মিলছে না।" }); return; }
    console.error("Facility worker creation failed", error);
    response.status(500).json({ error: "Facility worker account তৈরি করা যায়নি।" });
  }
});

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
