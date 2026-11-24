ALTER TABLE "facility_worker_profiles"
ADD COLUMN "division_id" TEXT,
ADD COLUMN "district_id" TEXT,
ADD COLUMN "upazila_id" TEXT;

CREATE INDEX "facility_worker_profiles_facility_id_upazila_id_idx" ON "facility_worker_profiles"("facility_id", "upazila_id");
CREATE INDEX "facility_worker_profiles_division_id_district_id_upazila_id_idx" ON "facility_worker_profiles"("division_id", "district_id", "upazila_id");

ALTER TABLE "facility_worker_profiles" ADD CONSTRAINT "facility_worker_profiles_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facility_worker_profiles" ADD CONSTRAINT "facility_worker_profiles_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facility_worker_profiles" ADD CONSTRAINT "facility_worker_profiles_upazila_id_fkey" FOREIGN KEY ("upazila_id") REFERENCES "upazilas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
