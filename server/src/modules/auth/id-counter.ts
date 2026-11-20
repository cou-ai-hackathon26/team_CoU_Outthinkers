import { Prisma } from "@prisma/client";

export async function allocatePublicId(
  transaction: Prisma.TransactionClient,
  key: "PATIENT" | "EMPLOYEE",
) {
  const rows = await transaction.$queryRaw<Array<{ allocated: number }>>`
    INSERT INTO "public_id_counters" ("key", "next_value", "updated_at")
    VALUES (${key}, 2, NOW())
    ON CONFLICT ("key")
    DO UPDATE SET
      "next_value" = "public_id_counters"."next_value" + 1,
      "updated_at" = NOW()
    RETURNING "next_value" - 1 AS allocated
  `;

  return String(rows[0].allocated).padStart(8, "0");
}
