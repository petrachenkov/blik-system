-- CreateEnum
CREATE TYPE "SnippetKind" AS ENUM ('TICKET_TEMPLATE', 'CANNED_RESPONSE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_MENTIONED';

-- AlterTable
ALTER TABLE "TicketComment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TextSnippet" (
    "id" TEXT NOT NULL,
    "kind" "SnippetKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TextSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TicketCommentMentions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TicketCommentMentions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "TextSnippet_kind_isActive_idx" ON "TextSnippet"("kind", "isActive");

-- CreateIndex
CREATE INDEX "_TicketCommentMentions_B_index" ON "_TicketCommentMentions"("B");

-- AddForeignKey
ALTER TABLE "_TicketCommentMentions" ADD CONSTRAINT "_TicketCommentMentions_A_fkey" FOREIGN KEY ("A") REFERENCES "TicketComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TicketCommentMentions" ADD CONSTRAINT "_TicketCommentMentions_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
