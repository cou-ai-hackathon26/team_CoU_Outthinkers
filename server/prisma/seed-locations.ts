import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { seedBangladeshLocations } from "./seeders/bangladesh-locations";

seedBangladeshLocations()
  .then((result) => console.log("Bangladesh locations seeded:", result))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
