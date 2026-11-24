ALTER TYPE "UserRole" ADD VALUE 'FACILITY_WORKER';

CREATE TABLE "facility_worker_profiles" (
    "user_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_worker_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "facility_worker_profiles_employee_id_key" ON "facility_worker_profiles"("employee_id");
CREATE INDEX "facility_worker_profiles_facility_id_idx" ON "facility_worker_profiles"("facility_id");

ALTER TABLE "facility_worker_profiles" ADD CONSTRAINT "facility_worker_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facility_worker_profiles" ADD CONSTRAINT "facility_worker_profiles_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
