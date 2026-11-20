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

export default router;
