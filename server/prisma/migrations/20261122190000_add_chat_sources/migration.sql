ALTER TABLE "chat_messages"
ADD COLUMN "intent" TEXT,
ADD COLUMN "sources" JSONB,
ADD COLUMN "requires_nurse_review" BOOLEAN NOT NULL DEFAULT false;
