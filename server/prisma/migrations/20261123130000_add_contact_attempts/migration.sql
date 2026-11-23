CREATE TABLE "contact_attempts" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "performed_by_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "notes" TEXT,
    "next_action" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contact_attempts_task_id_attempted_at_idx" ON "contact_attempts"("task_id", "attempted_at");
CREATE INDEX "contact_attempts_performed_by_id_attempted_at_idx" ON "contact_attempts"("performed_by_id", "attempted_at");
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "follow_up_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
