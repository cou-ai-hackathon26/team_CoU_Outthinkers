import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get("/supervision", async (_request, response) => {
  const now = new Date();
  const [unresolvedReferrals, overdueTasks, workers] = await Promise.all([
    prisma.referral.findMany({ where: { status: "UNRESOLVED" }, orderBy: { updatedAt: "asc" }, take: 100, select: { id: true, status: true, reason: true, destinationName: true, updatedAt: true, dueAt: true, ownerStaff: { select: { id: true, staffProfile: { select: { name: true, employeeId: true } } } }, patient: { select: { publicId: true, patientProfile: { select: { name: true } } } } } }),
    prisma.followUpTask.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 100, select: { id: true, title: true, priority: true, dueAt: true, assignedStaff: { select: { staffProfile: { select: { name: true, employeeId: true } } } }, patientUser: { select: { publicId: true, patientProfile: { select: { name: true } } } } } }),
    prisma.user.findMany({ where: { role: "NURSE", status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, staffProfile: { select: { name: true, employeeId: true } }, assignedTasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } }, referralOwners: { where: { status: { notIn: ["COMPLETED"] } }, select: { id: true } } } }),
  ]);
  response.json({ data: { generatedAt: now, counts: { unresolvedReferrals: unresolvedReferrals.length, overdueTasks: overdueTasks.length }, unresolvedReferrals: unresolvedReferrals.map(item => ({ ...item, patientId: item.patient.publicId, patientName: item.patient.patientProfile?.name || "নাম নেই", ownerName: item.ownerStaff?.staffProfile?.name || "অর্পিত নয়" })), overdueTasks: overdueTasks.map(item => ({ ...item, patientId: item.patientUser.publicId, patientName: item.patientUser.patientProfile?.name || "নাম নেই", workerName: item.assignedStaff?.staffProfile?.name || "অর্পিত নয়" })), workers: workers.map(worker => ({ id: worker.id, name: worker.staffProfile?.name || "নাম নেই", employeeId: worker.staffProfile?.employeeId || "", openTasks: worker.assignedTasks.length, openReferrals: worker.referralOwners.length })) } });
});

export default router;
