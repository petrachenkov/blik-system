-- CreateEnum
CREATE TYPE "CartridgeRequestStatus" AS ENUM ('NEW', 'COLLECTED', 'SENT', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CartridgeReportStatus" AS ENUM ('GENERATED', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CARTRIDGE_FILLED';
ALTER TYPE "NotificationType" ADD VALUE 'REFILL_EVENT_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'REFILL_EVENT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_BROADCAST';

-- CreateTable
CREATE TABLE "CartridgeRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "CartridgeRequestStatus" NOT NULL DEFAULT 'NEW',
    "collectedById" TEXT,
    "collectedAt" TIMESTAMP(3),
    "reportId" TEXT,
    "filledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartridgeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartridgeReport" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "CartridgeReportStatus" NOT NULL DEFAULT 'GENERATED',
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartridgeReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillEvent" (
    "id" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "submissionDeadline" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "reminder3dSentAt" TIMESTAMP(3),
    "reminder1dSentAt" TIMESTAMP(3),
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefillEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CartridgeRequest_number_key" ON "CartridgeRequest"("number");

-- CreateIndex
CREATE INDEX "CartridgeRequest_status_idx" ON "CartridgeRequest"("status");

-- CreateIndex
CREATE INDEX "CartridgeRequest_createdById_idx" ON "CartridgeRequest"("createdById");

-- CreateIndex
CREATE INDEX "CartridgeRequest_reportId_idx" ON "CartridgeRequest"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "CartridgeReport_number_key" ON "CartridgeReport"("number");

-- CreateIndex
CREATE INDEX "RefillEvent_submissionDeadline_idx" ON "RefillEvent"("submissionDeadline");

-- AddForeignKey
ALTER TABLE "CartridgeRequest" ADD CONSTRAINT "CartridgeRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartridgeRequest" ADD CONSTRAINT "CartridgeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartridgeRequest" ADD CONSTRAINT "CartridgeRequest_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartridgeRequest" ADD CONSTRAINT "CartridgeRequest_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CartridgeReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartridgeReport" ADD CONSTRAINT "CartridgeReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartridgeReport" ADD CONSTRAINT "CartridgeReport_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillEvent" ADD CONSTRAINT "RefillEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
