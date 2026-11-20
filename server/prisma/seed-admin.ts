import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { seedInitialAdmin } from "./seeders/admin";

seedInitialAdmin()
  .then((result) => console.log("Initial admin:", result))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
