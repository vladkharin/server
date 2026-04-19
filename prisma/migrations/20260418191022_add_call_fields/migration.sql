-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "callActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "callStartedAt" TIMESTAMP(3);
