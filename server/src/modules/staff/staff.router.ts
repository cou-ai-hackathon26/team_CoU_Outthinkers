import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";

const router = Router();
router.use(requireAuth, requireRole("NURSE", "ADMIN"));

router.get("/me", async (_request, response) => {
  const auth = response.locals.auth as { userId: string };
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, phone: true, role: true, status: true, staffProfile: { select: { name: true, employeeId: true, address: true, division: { select: { nameBn: true } }, district: { select: { nameBn: true } }, upazila: { select: { nameBn: true } } } } },
  });
  if (!user || user.status !== "ACTIVE") { response.status(401).json({ error: "অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।" }); return; }
  response.json({ data: user });
});

export default router;
