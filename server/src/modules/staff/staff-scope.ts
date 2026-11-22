import { prisma } from "../../lib/prisma";

export type StaffScope = { role: "NURSE" | "ADMIN"; upazilaId: string | null };

export async function getStaffScope(userId: string): Promise<StaffScope | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, staffProfile: { select: { upazilaId: true } } } });
  if (!user || (user.role !== "NURSE" && user.role !== "ADMIN")) return null;
  return { role: user.role, upazilaId: user.staffProfile?.upazilaId || null };
}

export function patientScope(scope: StaffScope) {
  return scope.role === "ADMIN" ? {} : { patient: { patientProfile: { upazilaId: scope.upazilaId || "__unassigned__" } } };
}

export function patientUserScope(scope: StaffScope) {
  return scope.role === "ADMIN" ? {} : { patientUser: { patientProfile: { upazilaId: scope.upazilaId || "__unassigned__" } } };
}
