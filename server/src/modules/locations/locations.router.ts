import { Router } from "express";
import { prisma } from "../../lib/prisma";

const router = Router();

router.get("/divisions", async (_request, response) => {
  const divisions = await prisma.division.findMany({
    orderBy: { sortName: "asc" },
    select: { id: true, nameBn: true, nameEn: true },
  });

  response.json({ data: divisions });
});

router.get("/districts", async (request, response) => {
  const divisionId = String(request.query.divisionId || "").trim();

  if (!divisionId) {
    response.status(400).json({ error: "divisionId is required" });
    return;
  }

  const districts = await prisma.district.findMany({
    where: { divisionId },
    orderBy: { sortName: "asc" },
    select: { id: true, nameBn: true, nameEn: true, divisionId: true },
  });

  response.json({ data: districts });
});

router.get("/upazilas", async (request, response) => {
  const districtId = String(request.query.districtId || "").trim();

  if (!districtId) {
    response.status(400).json({ error: "districtId is required" });
    return;
  }

  const upazilas = await prisma.upazila.findMany({
    where: { districtId },
    orderBy: { sortName: "asc" },
    select: { id: true, nameBn: true, nameEn: true, districtId: true },
  });

  response.json({ data: upazilas });
});

export default router;
