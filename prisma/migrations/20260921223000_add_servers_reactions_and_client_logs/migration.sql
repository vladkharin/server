-- CreateEnum for ConvType if not exists
DO $$ BEGIN
    CREATE TYPE "ConvType" AS ENUM ('DIRECT', 'GROUP', 'SERVER_CHANNEL', 'SERVER_VOICE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable Conversation
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "serverId" INTEGER;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "isAnnouncement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "topic" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "slowmode" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "pinnedMessageId" INTEGER;

-- AlterTable Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable Server
CREATE TABLE IF NOT EXISTS "Server" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "ownerId" INTEGER NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable ServerMember
CREATE TABLE IF NOT EXISTS "ServerMember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "roleName" TEXT DEFAULT 'Участник',
    "roleColor" TEXT DEFAULT '#94a3b8',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerMember_pkey" PRIMARY KEY ("id")
);

-- Alter ServerMember in case it existed before without roleName/roleColor
ALTER TABLE "ServerMember" ADD COLUMN IF NOT EXISTS "roleName" TEXT DEFAULT 'Участник';
ALTER TABLE "ServerMember" ADD COLUMN IF NOT EXISTS "roleColor" TEXT DEFAULT '#94a3b8';

-- CreateTable Reaction
CREATE TABLE IF NOT EXISTS "Reaction" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable client_error_logs
CREATE TABLE IF NOT EXISTS "client_error_logs" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "userEmail" TEXT,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Server_inviteCode_key" ON "Server"("inviteCode");
CREATE UNIQUE INDEX IF NOT EXISTS "ServerMember_userId_serverId_key" ON "ServerMember"("userId", "serverId");
CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_messageId_userId_emoji_key" ON "Reaction"("messageId", "userId", "emoji");
CREATE INDEX IF NOT EXISTS "client_error_logs_source_idx" ON "client_error_logs"("source");
CREATE INDEX IF NOT EXISTS "client_error_logs_createdAt_idx" ON "client_error_logs"("createdAt");

-- AddForeignKey
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Server_ownerId_fkey') THEN
        ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServerMember_userId_fkey') THEN
        ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServerMember_serverId_fkey') THEN
        ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_serverId_fkey') THEN
        ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reaction_messageId_fkey') THEN
        ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reaction_userId_fkey') THEN
        ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
