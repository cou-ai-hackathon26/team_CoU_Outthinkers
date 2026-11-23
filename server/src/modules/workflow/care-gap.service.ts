import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";

export const DEFAULT_CARE_GAP_RULES = [
  { code: "OVERDUE_CONTACT", name: "Overdue patient contact", description: "শেষ verified care event-এর পর নির্ধারিত সময়ের মধ্যে patient contact হয়নি।", conditionType: "LAST_CARE_EVENT_OLDER_THAN_DAYS", configuration: { days: 30 }, priority: "HIGH", defaultDueHours: 24 },
  { code: "INCOMPLETE_SCREENING", name: "Incomplete screening", description: "Active pregnancy case-এ এখনও কোনো verified care event নেই।", conditionType: "ACTIVE_CASE_WITHOUT_CONFIRMED_EVENT", configuration: {}, priority: "HIGH", defaultDueHours: 48 },
  { code: "MISSING_OUTCOME", name: "Missing pregnancy outcome", description: "Expected delivery date পেরিয়ে গেছে, কিন্তু case outcome update হয়নি।", conditionType: "EXPECTED_DELIVERY_DATE_PASSED", configuration: {}, priority: "URGENT", defaultDueHours: 12 },
  { code: "UNRESOLVED_REFERRAL", name: "Unresolved referral", description: "Referral workflow-এ unresolved state আছে বা due date পেরিয়ে গেছে।", conditionType: "OPEN_REFERRAL_OVERDUE", configuration: {}, priority: "HIGH", defaultDueHours: 24 },
] as const;

type Rule = typeof DEFAULT_CARE_GAP_RULES[number] & { id: string };

function explanation(rule: Rule, facts: Record<string, unknown>) {
  return `${rule.name}: ${rule.description} Source facts: ${JSON.stringify(facts)}`;
}

export async function seedDefaultCareGapRules() {
  for (const rule of DEFAULT_CARE_GAP_RULES) {
    await prisma.careGapRule.upsert({
      where: { code: rule.code },
      create: { ...rule, priority: rule.priority as "NORMAL" | "HIGH" | "URGENT" },
      update: { name: rule.name, description: rule.description, conditionType: rule.conditionType, configuration: rule.configuration, priority: rule.priority as "NORMAL" | "HIGH" | "URGENT", defaultDueHours: rule.defaultDueHours },
    });
  }
}

export async function evaluateCareGaps(patientUserId: string, assignedStaffId: string | null) {
  const [rules, patient, activeCase, latestEvent, openReferrals] = await Promise.all([
    prisma.careGapRule.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } }),
    prisma.user.findUnique({ where: { id: patientUserId }, select: { id: true, publicId: true } }),
    prisma.pregnancyCase.findFirst({ where: { patientUserId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true, expectedDeliveryDate: true } }),
    prisma.careEvent.findFirst({ where: { pregnancyCase: { patientUserId } }, orderBy: { occurredAt: "desc" }, select: { id: true, occurredAt: true, verificationStatus: true } }),
    prisma.referral.findMany({ where: { patientUserId, status: { notIn: ["COMPLETED"] } }, select: { id: true, status: true, dueAt: true, reason: true } }),
  ]);
  if (!patient) throw new Error("PATIENT_NOT_FOUND");
  const now = Date.now();
  const generated: Array<{ id: string; rule: string; explanation: string }> = [];
  for (const rule of rules) {
    let facts: Record<string, unknown> | null = null;
    if (rule.conditionType === "LAST_CARE_EVENT_OLDER_THAN_DAYS") {
      const days = Number((rule.configuration as { days?: number }).days || 30);
      const ageDays = latestEvent ? Math.floor((now - latestEvent.occurredAt.getTime()) / 86_400_000) : null;
      if (!activeCase || (ageDays !== null && ageDays < days)) continue;
      facts = { lastCareEventId: latestEvent?.id || null, lastOccurredAt: latestEvent?.occurredAt || null, ageDays, thresholdDays: days };
    } else if (rule.conditionType === "ACTIVE_CASE_WITHOUT_CONFIRMED_EVENT") {
      if (!activeCase || (latestEvent && latestEvent.verificationStatus === "CONFIRMED")) continue;
      facts = { pregnancyCaseId: activeCase.id, latestEventId: latestEvent?.id || null, latestVerificationStatus: latestEvent?.verificationStatus || null };
    } else if (rule.conditionType === "EXPECTED_DELIVERY_DATE_PASSED") {
      if (!activeCase?.expectedDeliveryDate || activeCase.expectedDeliveryDate.getTime() > now) continue;
      facts = { pregnancyCaseId: activeCase.id, expectedDeliveryDate: activeCase.expectedDeliveryDate, caseStatus: "ACTIVE" };
    } else if (rule.conditionType === "OPEN_REFERRAL_OVERDUE") {
      const overdue = openReferrals.find(item => item.status === "UNRESOLVED" || (item.dueAt && item.dueAt.getTime() < now));
      if (!overdue) continue;
      facts = { referralId: overdue.id, referralStatus: overdue.status, referralDueAt: overdue.dueAt, referralReason: overdue.reason };
    }
    if (!facts) continue;
    const existing = await prisma.followUpTask.findFirst({ where: { patientUserId, ruleId: rule.id, status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } });
    if (existing) continue;
    const dueAt = new Date(now + (rule.defaultDueHours || 24) * 3_600_000);
    const task = await prisma.followUpTask.create({ data: { patientUserId, pregnancyCaseId: activeCase?.id, sourceEventId: latestEvent?.id, assignedStaffId, ruleId: rule.id, title: rule.name, reason: rule.description, explanation: explanation(rule as Rule, facts), sourceFacts: facts as Prisma.InputJsonValue, priority: rule.priority, dueAt }, select: { id: true } });
    generated.push({ id: task.id, rule: rule.code, explanation: explanation(rule as Rule, facts) });
  }
  return generated;
}
