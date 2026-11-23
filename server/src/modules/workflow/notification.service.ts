import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";

export async function createInAppNotification(input: { userId: string; type: string; title: string; message: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown> }) {
  return prisma.notification.create({ data: { userId: input.userId, type: input.type, title: input.title, message: input.message, targetType: input.targetType, targetId: input.targetId, metadata: input.metadata as Prisma.InputJsonValue | undefined } });
}
