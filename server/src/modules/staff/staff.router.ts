import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";
import intakeRequestRouter from "./intake-request.router";
import careIntakeRouter from "./care-intake.router";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));
router.use(intakeRequestRouter);
router.use(careIntakeRouter);

router.get("/me", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, phone: true, role: true, status: true, staffProfile: { select: { name: true, employeeId: true, address: true, division: { select: { nameBn: true } }, district: { select: { nameBn: true } }, upazila: { select: { nameBn: true } } } } },
  });
  if (!user || user.status !== "ACTIVE") { response.status(401).json({ error: "অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।" }); return; }
  response.json({ data: user });
});

router.get("/patients/search", async (request, response) => {
  const query = String(request.query.query || "").trim();
  if (query.length < 2) {
    response.status(400).json({ error: "কমপক্ষে ২টি অক্ষর বা সংখ্যা লিখুন।" });
    return;
  }

  const patients = await prisma.user.findMany({
    where: {
      role: "PATIENT",
      status: "ACTIVE",
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

export default router;
