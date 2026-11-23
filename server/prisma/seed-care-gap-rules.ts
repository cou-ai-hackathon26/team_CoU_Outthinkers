import "dotenv/config";
import { seedDefaultCareGapRules } from "../src/modules/workflow/care-gap.service";

async function main() {
  await seedDefaultCareGapRules();
  console.log("Default care-gap rules seeded");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
