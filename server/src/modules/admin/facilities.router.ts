import { Request, Response, Router } from "express";
import { prisma } from "../../lib/prisma";

const router = Router();
const statuses = ["DRAFT", "VERIFIED", "REJECTED", "DEACTIVATED"] as const;

function text(value: unknown) { return String(value || "").trim(); }

function facilityPayload(body: any) {
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!text(body.nameBn) || !text(body.addressBn) || !text(body.dataOwner) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    nameBn: text(body.nameBn), nameEn: text(body.nameEn) || null,
    addressBn: text(body.addressBn), addressEn: text(body.addressEn) || null,
    phone: text(body.phone) || null, latitude, longitude,
    services: body.services && typeof body.services === "object" ? body.services : {},
    operatingHours: body.operatingHours && typeof body.operatingHours === "object" ? body.operatingHours : null,
    dataOwner: text(body.dataOwner), source: text(body.source) || "CURATED",
    googlePlaceId: text(body.googlePlaceId) || null,
  };
}

router.get("/facilities", async (_request, response) => {
  const facilities = await prisma.facility.findMany({ orderBy: [{ status: "asc" }, { nameBn: "asc" }], include: { verifiedBy: { select: { email: true, staffProfile: { select: { name: true } } } } } });
  response.json({ data: facilities });
});

router.post("/facilities", async (request: Request, response: Response) => {
  const data = facilityPayload(request.body);
  if (!data) { response.status(400).json({ error: "Facility-এর নাম, ঠিকানা, data owner এবং সঠিক location দিন।" }); return; }
  try {
    const facility = await prisma.facility.create({ data });
    await prisma.auditLog.create({ data: { actorType: "USER", actorUserId: response.locals.auth.userId, action: "FACILITY_CREATED", targetType: "Facility", targetId: facility.id, metadata: { nameBn: facility.nameBn } } });
    response.status(201).json({ data: facility });
  } catch (error) {
    console.error("Facility creation failed", error);
    response.status(409).json({ error: "Facility তৈরি করা যায়নি। Google Place ID duplicate হতে পারে।" });
  }
});

router.patch("/facilities/:id/details", async (request: Request, response: Response) => {
  const data = facilityPayload(request.body);
  if (!data) { response.status(400).json({ error: "Facility-এর সব তথ্য এবং সঠিক location দিন।" }); return; }
  try {
    const facility = await prisma.facility.update({ where: { id: String(request.params.id) }, data });
    await prisma.auditLog.create({ data: { actorType: "USER", actorUserId: response.locals.auth.userId, action: "FACILITY_UPDATED", targetType: "Facility", targetId: facility.id, metadata: { nameBn: facility.nameBn } } });
    response.json({ data: facility });
  } catch { response.status(404).json({ error: "Facility পাওয়া যায়নি।" }); }
});

router.patch("/facilities/:id", async (request: Request, response: Response) => {
  const id = text(request.params.id);
  const status = text(request.body?.status).toUpperCase();
  const notes = text(request.body?.verificationNotes);
  if (!statuses.includes(status as typeof statuses[number])) { response.status(400).json({ error: "সঠিক facility status দিন।" }); return; }
  const existing = await prisma.facility.findUnique({ where: { id } });
  if (!existing) { response.status(404).json({ error: "Facility পাওয়া যায়নি।" }); return; }
  const facility = await prisma.facility.update({ where: { id }, data: { status: status as typeof statuses[number], verificationNotes: notes || null, verifiedAt: status === "VERIFIED" ? new Date() : existing.verifiedAt, verifiedById: status === "VERIFIED" ? response.locals.auth.userId : existing.verifiedById } });
  await prisma.auditLog.create({ data: { actorType: "USER", actorUserId: response.locals.auth.userId, action: `FACILITY_${status}`, targetType: "Facility", targetId: id, metadata: { notes } } });
  response.json({ data: facility });
});

export default router;
