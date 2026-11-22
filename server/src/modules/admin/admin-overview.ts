import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get("/overview", async (_request, response) => {
  try {
    const [patientCount, nurseCount, adminCount, recentPatients, recentStaff] = await Promise.all([
      prisma.user.count({ where: { role: "PATIENT", status: "ACTIVE" } }),
      prisma.user.count({ where: { role: "NURSE", status: "ACTIVE" } }),
      prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
      prisma.user.findMany({
        where: { role: "PATIENT" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { publicId: true, createdAt: true, patientProfile: { select: { name: true } } },
      }),
      prisma.user.findMany({
        where: { role: "NURSE" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { email: true, createdAt: true, staffProfile: { select: { name: true, employeeId: true } } },
      }),
    ]);

    response.json({
      data: {
        counts: { patients: patientCount, nurses: nurseCount, admins: adminCount },
        recentPatients: recentPatients.map((item) => ({
          id: item.publicId,
          name: item.patientProfile?.name || "নাম নেই",
          createdAt: item.createdAt,
        })),
        recentStaff: recentStaff.map((item) => ({
          id: item.staffProfile?.employeeId || "",
          name: item.staffProfile?.name || "নাম নেই",
          email: item.email,
          createdAt: item.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Admin overview failed", error);
    response.status(500).json({ error: "ড্যাশবোর্ডের তথ্য আনা যায়নি।" });
  }
});

router.get("/staff", async (_request, response) => {
  const staff = await prisma.user.findMany({ where: { role: { in: ["NURSE", "ADMIN"] } }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, phone: true, role: true, status: true, createdAt: true, staffProfile: { select: { name: true, employeeId: true, address: true, upazila: { select: { nameBn: true } }, district: { select: { nameBn: true } } } } } });
  response.json({ data: staff });
});

router.get("/patients", async (request, response) => {
  const query = String(request.query.query || "").trim();
  const patients = await prisma.user.findMany({ where: { role: "PATIENT", ...(query ? { OR: [{ publicId: { contains: query } }, { patientProfile: { name: { contains: query, mode: "insensitive" } } }] } : {}) }, orderBy: { createdAt: "desc" }, take: 100, select: { publicId: true, email: true, phone: true, status: true, createdAt: true, patientProfile: { select: { name: true, contactNumber: true, address: true, upazila: { select: { nameBn: true } }, district: { select: { nameBn: true } } } } } });
  response.json({ data: patients });
});

router.get("/audit-logs", async (_request, response) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, actorType: true, action: true, targetType: true, targetId: true, metadata: true, createdAt: true, actorUser: { select: { email: true, role: true } } } });
  response.json({ data: logs });
});

router.patch("/users/:id/status", async (request, response) => {
  const auth = response.locals.auth as { userId: string };
  const status = String(request.body?.status || "").trim();
  if (!["ACTIVE", "SUSPENDED"].includes(status)) { response.status(400).json({ error: "Account status সঠিক নয়।" }); return; }
  if (request.params.id === auth.userId) { response.status(400).json({ error: "নিজের account suspend করা যাবে না।" }); return; }
  const existing = await prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true, role: true, status: true, email: true } });
  if (!existing || !["NURSE", "ADMIN"].includes(existing.role)) { response.status(404).json({ error: "Staff account খুঁজে পাওয়া যায়নি।" }); return; }
  const updated = await prisma.$transaction(async transaction => {
    const user = await transaction.user.update({ where: { id: existing.id }, data: { status: status as "ACTIVE" | "SUSPENDED" }, select: { id: true, status: true, email: true, role: true } });
    await transaction.auditLog.create({ data: { actorType: "USER", actorUserId: auth.userId, action: `STAFF_${status}`, targetType: "User", targetId: existing.id, metadata: { previousStatus: existing.status, email: existing.email } } });
    return user;
  });
  response.json({ message: status === "ACTIVE" ? "Account আবার চালু হয়েছে।" : "Account suspend হয়েছে।", data: updated });
});

export default router;
