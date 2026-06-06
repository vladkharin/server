/*
  Warnings:

  - You are about to drop the `Conversation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ConversationMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Message` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `friends` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Conversation" DROP CONSTRAINT "Conversation_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ConversationMember" DROP CONSTRAINT "ConversationMember_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ConversationMember" DROP CONSTRAINT "ConversationMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Message" DROP CONSTRAINT "Message_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Message" DROP CONSTRAINT "Message_senderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."friends" DROP CONSTRAINT "friends_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "public"."friends" DROP CONSTRAINT "friends_senderId_fkey";

-- DropTable
DROP TABLE "public"."Conversation";

-- DropTable
DROP TABLE "public"."ConversationMember";

-- DropTable
DROP TABLE "public"."Message";

-- DropTable
DROP TABLE "public"."friends";

-- DropTable
DROP TABLE "public"."users";

-- DropEnum
DROP TYPE "public"."ConvType";

-- DropEnum
DROP TYPE "public"."FriendStatus";
