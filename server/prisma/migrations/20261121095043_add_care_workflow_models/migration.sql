-- CreateEnum
CREATE TYPE "PregnancyCaseStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CareEventType" AS ENUM ('INITIAL_INTAKE', 'ANTENATAL_VISIT', 'POSTNATAL_VISIT', 'HOME_VISIT', 'PHONE_FOLLOW_UP', 'MANUAL_OBSERVATION', 'REFERRAL_DISCUSSION');

-- CreateEnum
CREATE TYPE "CareSourceType" AS ENUM ('MANUAL', 'VOICE', 'IMPORTED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('DRAFT', 'REVIEWED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExtractedFieldStatus" AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFORMATIONAL', 'HIGH', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "pregnancy_cases" (
    "id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "case_code" TEXT NOT NULL,
    "status" "PregnancyCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_staff_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "last_menstrual_period" DATE,
    "expected_delivery_date" DATE,
    "gravida" INTEGER,
    "para" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pregnancy_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_events" (
    "id" TEXT NOT NULL,
    "pregnancy_case_id" TEXT NOT NULL,
    "event_type" "CareEventType" NOT NULL,
    "source_type" "CareSourceType" NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_notes" (
    "id" TEXT NOT NULL,
    "care_event_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "duration_seconds" INTEGER,
    "language" TEXT NOT NULL DEFAULT 'bn-BD',
    "transcription_status" "TranscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "transcript_text" TEXT,
    "transcription_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_fields" (
    "id" TEXT NOT NULL,
    "care_event_id" TEXT NOT NULL,
    "voice_note_id" TEXT,
    "field_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source_text" TEXT,
    "status" "ExtractedFieldStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_tasks" (
    "id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "pregnancy_case_id" TEXT,
    "source_event_id" TEXT,
    "assigned_staff_id" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "due_at" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_alerts" (
    "id" TEXT NOT NULL,
    "pregnancy_case_id" TEXT NOT NULL,
    "care_event_id" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source_facts" JSONB NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledged_by_id" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pregnancy_cases_case_code_key" ON "pregnancy_cases"("case_code");

-- CreateIndex
CREATE INDEX "pregnancy_cases_patient_user_id_status_idx" ON "pregnancy_cases"("patient_user_id", "status");

-- CreateIndex
CREATE INDEX "pregnancy_cases_assigned_staff_id_status_idx" ON "pregnancy_cases"("assigned_staff_id", "status");

-- CreateIndex
CREATE INDEX "care_events_pregnancy_case_id_occurred_at_idx" ON "care_events"("pregnancy_case_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "voice_notes_care_event_id_key" ON "voice_notes"("care_event_id");

-- CreateIndex
CREATE INDEX "extracted_fields_care_event_id_status_idx" ON "extracted_fields"("care_event_id", "status");

-- CreateIndex
CREATE INDEX "follow_up_tasks_assigned_staff_id_status_due_at_idx" ON "follow_up_tasks"("assigned_staff_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "follow_up_tasks_patient_user_id_status_idx" ON "follow_up_tasks"("patient_user_id", "status");

-- CreateIndex
CREATE INDEX "safety_alerts_pregnancy_case_id_status_idx" ON "safety_alerts"("pregnancy_case_id", "status");

-- AddForeignKey
ALTER TABLE "pregnancy_cases" ADD CONSTRAINT "pregnancy_cases_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_cases" ADD CONSTRAINT "pregnancy_cases_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_cases" ADD CONSTRAINT "pregnancy_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_pregnancy_case_id_fkey" FOREIGN KEY ("pregnancy_case_id") REFERENCES "pregnancy_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_care_event_id_fkey" FOREIGN KEY ("care_event_id") REFERENCES "care_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_care_event_id_fkey" FOREIGN KEY ("care_event_id") REFERENCES "care_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_voice_note_id_fkey" FOREIGN KEY ("voice_note_id") REFERENCES "voice_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_pregnancy_case_id_fkey" FOREIGN KEY ("pregnancy_case_id") REFERENCES "pregnancy_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "care_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_pregnancy_case_id_fkey" FOREIGN KEY ("pregnancy_case_id") REFERENCES "pregnancy_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_care_event_id_fkey" FOREIGN KEY ("care_event_id") REFERENCES "care_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
