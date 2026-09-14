-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'VISIT_RESCHEDULED';
ALTER TYPE "HistoryAction" ADD VALUE 'VISIT_COMPLETED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_RESCHEDULED';

-- AlterTable
ALTER TABLE "TicketVisit" ADD COLUMN     "counterProposed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "presenceReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkingHoursSettings" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "workdayStart" TEXT NOT NULL DEFAULT '08:00',
    "workdayEnd" TEXT NOT NULL DEFAULT '19:00',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "holidays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingHoursSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WorkingHoursSettings" ADD CONSTRAINT "WorkingHoursSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
