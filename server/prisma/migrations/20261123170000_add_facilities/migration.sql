CREATE TYPE "FacilityStatus" AS ENUM ('DRAFT', 'VERIFIED', 'REJECTED', 'DEACTIVATED');

CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT,
    "address_bn" TEXT NOT NULL,
    "address_en" TEXT,
    "phone" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "services" JSONB NOT NULL,
    "operating_hours" JSONB,
    "data_owner" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CURATED',
    "google_place_id" TEXT,
    "status" "FacilityStatus" NOT NULL DEFAULT 'DRAFT',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "verification_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facilities_google_place_id_key" ON "facilities"("google_place_id");
CREATE INDEX "facilities_status_latitude_longitude_idx" ON "facilities"("status", "latitude", "longitude");
CREATE INDEX "facilities_data_owner_status_idx" ON "facilities"("data_owner", "status");
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
