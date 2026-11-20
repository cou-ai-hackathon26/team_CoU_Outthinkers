import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { allocatePublicId } from "./id-counter";

const router = Router();

function normalizePhone(value: unknown) {
  return String(value || "").replace(/[\s-]/g, "").trim();
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

router.post("/patients/register", async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const dateOfBirth = String(request.body?.dateOfBirth || "").trim();
  const phone = normalizePhone(request.body?.phone);
  const emergencyContactNumber = normalizePhone(
    request.body?.emergencyContactNumber,
  );
  const email = normalizeEmail(request.body?.email);
  const address = String(request.body?.address || "").trim();
  const divisionId = String(request.body?.divisionId || "").trim();
  const districtId = String(request.body?.districtId || "").trim();
  const upazilaId = String(request.body?.upazilaId || "").trim();

  if (
    !name ||
    !dateOfBirth ||
    !phone ||
    !emergencyContactNumber ||
    !address ||
    !divisionId ||
    !districtId ||
    !upazilaId
  ) {
    response.status(400).json({ error: "প্রয়োজনীয় তথ্যগুলো পূরণ করুন।" });
    return;
  }

  const parsedDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    response.status(400).json({ error: "জন্মতারিখ সঠিক নয়।" });
    return;
  }

  try {
    const patient = await prisma.$transaction(async (transaction) => {
      const [existingPhone, existingEmail, location] = await Promise.all([
        transaction.user.findUnique({ where: { phone } }),
        email ? transaction.user.findUnique({ where: { email } }) : null,
        transaction.upazila.findFirst({
          where: { id: upazilaId, districtId, district: { divisionId } },
          select: { id: true },
        }),
      ]);

      if (existingPhone || existingEmail) {
        throw new Error("DUPLICATE_CONTACT");
      }
      if (!location) {
        throw new Error("INVALID_LOCATION");
      }

      const publicId = await allocatePublicId(transaction, "PATIENT");
      const user = await transaction.user.create({
        data: {
          role: "PATIENT",
          phone,
          email,
          publicId,
          patientProfile: {
            create: {
              name,
              contactNumber: phone,
              dateOfBirth: parsedDate,
              emergencyContactNumber,
              address,
              divisionId,
              districtId,
              upazilaId,
            },
          },
        },
        select: { id: true, publicId: true },
      });

      await transaction.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "PATIENT_REGISTERED",
          targetType: "User",
          targetId: user.id,
          metadata: { publicId: user.publicId },
        },
      });

      return user;
    });

    response.status(201).json({
      message: "রেজিস্ট্রেশন সফল হয়েছে।",
      patientId: patient.publicId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_CONTACT") {
      response.status(409).json({
        error: "এই মোবাইল নম্বর বা ইমেইল আগে থেকেই নিবন্ধিত।",
      });
      return;
    }
    if (error instanceof Error && error.message === "INVALID_LOCATION") {
      response.status(400).json({ error: "এলাকার তথ্য সঠিক নয়।" });
      return;
    }
    console.error("Patient registration failed", error);
    response.status(500).json({ error: "রেজিস্ট্রেশন সম্পন্ন করা যায়নি।" });
  }
});

export default router;
