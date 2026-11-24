ALTER TABLE "referrals" ADD COLUMN "facility_id" TEXT;

CREATE INDEX "referrals_facility_id_status_idx" ON "referrals"("facility_id", "status");

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
