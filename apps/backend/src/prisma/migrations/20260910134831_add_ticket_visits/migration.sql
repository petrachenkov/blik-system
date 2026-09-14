-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DONE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "HistoryAction" ADD VALUE 'VISIT_SCHEDULED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'VISIT_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_REMINDER';

-- CreateTable
CREATE TABLE "TicketVisit" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'PROPOSED',
    "note" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitSlot" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketVisit_technicianId_scheduledStart_idx" ON "TicketVisit"("technicianId", "scheduledStart");

-- CreateIndex
CREATE INDEX "TicketVisit_ticketId_idx" ON "TicketVisit"("ticketId");

-- CreateIndex
CREATE INDEX "TicketVisit_status_idx" ON "TicketVisit"("status");

-- CreateIndex
CREATE INDEX "VisitSlot_visitId_idx" ON "VisitSlot"("visitId");

-- AddForeignKey
ALTER TABLE "TicketVisit" ADD CONSTRAINT "TicketVisit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketVisit" ADD CONSTRAINT "TicketVisit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketVisit" ADD CONSTRAINT "TicketVisit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSlot" ADD CONSTRAINT "VisitSlot_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "TicketVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
