import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { seedInitialAdmin } from "./seeders/admin";
import { seedBangladeshLocations } from "./seeders/bangladesh-locations";

async function main() {
  const locations = await seedBangladeshLocations();
  const admin = await seedInitialAdmin();

  console.log("Bangladesh locations seeded:", locations);
  console.log("Initial admin:", admin.created ? "created" : "already exists");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
