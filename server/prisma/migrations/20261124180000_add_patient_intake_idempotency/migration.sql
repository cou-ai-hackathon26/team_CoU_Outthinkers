ALTER TABLE "patient_intake_requests" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "patient_intake_requests_patient_user_id_idempotency_key_key"
ON "patient_intake_requests"("patient_user_id", "idempotency_key");
