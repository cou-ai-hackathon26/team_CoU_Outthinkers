-- CreateEnum
CREATE TYPE "CareGapRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('DRAFT', 'SENT', 'ACKNOWLEDGED', 'IN_TRANSIT', 'ARRIVED', 'ACCEPTED', 'TRANSFERRED', 'COMPLETED', 'UNRESOLVED');

-- Extend generated follow-up tasks with explainability and rule provenance.
ALTER TABLE "follow_up_tasks"
ADD COLUMN "rule_id" TEXT,
ADD COLUMN "explanation" TEXT,
ADD COLUMN "source_facts" JSONB;

-- CreateTable
CREATE TABLE "care_gap_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "condition_type" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "default_due_hours" INTEGER,
    "status" "CareGapRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_gap_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "pregnancy_case_id" TEXT,
    "owner_staff_id" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "destination_name" TEXT,
    "destination_contact" TEXT,
    "source_facts" JSONB,
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_events" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "from_status" "ReferralStatus",
    "to_status" "ReferralStatus" NOT NULL,
    "performed_by_id" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "care_gap_rules_code_key" ON "care_gap_rules"("code");
CREATE INDEX "care_gap_rules_status_priority_idx" ON "care_gap_rules"("status", "priority");
CREATE INDEX "follow_up_tasks_rule_id_status_due_at_idx" ON "follow_up_tasks"("rule_id", "status", "due_at");
CREATE INDEX "referrals_patient_user_id_status_idx" ON "referrals"("patient_user_id", "status");
CREATE INDEX "referrals_owner_staff_id_status_due_at_idx" ON "referrals"("owner_staff_id", "status", "due_at");
CREATE INDEX "referrals_status_updated_at_idx" ON "referrals"("status", "updated_at");
CREATE INDEX "referral_events_referral_id_created_at_idx" ON "referral_events"("referral_id", "created_at");
CREATE INDEX "referral_events_to_status_created_at_idx" ON "referral_events"("to_status", "created_at");

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "care_gap_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "care_gap_rules" ADD CONSTRAINT "care_gap_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "care_gap_rules" ADD CONSTRAINT "care_gap_rules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_pregnancy_case_id_fkey" FOREIGN KEY ("pregnancy_case_id") REFERENCES "pregnancy_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_owner_staff_id_fkey" FOREIGN KEY ("owner_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
