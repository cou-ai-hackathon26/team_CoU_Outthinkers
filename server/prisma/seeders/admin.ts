import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";

export async function seedInitialAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required to seed the initial admin",
    );
  }

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== "ADMIN") {
      throw new Error(`Existing account ${email} is not an admin account`);
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: { status: "ACTIVE" },
    });

    return { created: false, email };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      status: "ACTIVE",
      email,
      passwordHash,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "SYSTEM",
      action: "ADMIN_SEEDED",
      targetType: "User",
      targetId: admin.id,
      metadata: { email },
    },
  });

  return { created: true, email };
}
