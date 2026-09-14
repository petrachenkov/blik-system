-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'COLLABORATOR_ADDED';
ALTER TYPE "HistoryAction" ADD VALUE 'COLLABORATOR_REMOVED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_COLLABORATOR_ADDED';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TicketCollaborator" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateTable
CREATE TABLE "TicketRetentionSettings" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archiveClosedAfterDays" INTEGER NOT NULL DEFAULT 180,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketRetentionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketCollaborator_userId_idx" ON "TicketCollaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCollaborator_ticketId_userId_key" ON "TicketCollaborator"("ticketId", "userId");

-- CreateIndex
CREATE INDEX "Ticket_archivedAt_idx" ON "Ticket"("archivedAt");

-- AddForeignKey
ALTER TABLE "TicketCollaborator" ADD CONSTRAINT "TicketCollaborator_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCollaborator" ADD CONSTRAINT "TicketCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCollaborator" ADD CONSTRAINT "TicketCollaborator_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRetentionSettings" ADD CONSTRAINT "TicketRetentionSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
