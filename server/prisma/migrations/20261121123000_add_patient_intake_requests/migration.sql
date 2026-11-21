-- CreateEnum
CREATE TYPE "IntakeRequestStatus" AS ENUM ('SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "patient_intake_requests" (
    "id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "status" "IntakeRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "source_type" "CareSourceType" NOT NULL DEFAULT 'VOICE',
    "audio_storage_key" TEXT,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "transcript_text" TEXT,
    "transcription_status" "TranscriptionStatus" NOT NULL DEFAULT 'COMPLETED',
    "ai_summary" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_intake_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "patient_intake_requests_patient_user_id_status_submitted_at_idx" ON "patient_intake_requests"("patient_user_id", "status", "submitted_at");
CREATE INDEX "patient_intake_requests_status_submitted_at_idx" ON "patient_intake_requests"("status", "submitted_at");
ALTER TABLE "patient_intake_requests" ADD CONSTRAINT "patient_intake_requests_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_intake_requests" ADD CONSTRAINT "patient_intake_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
