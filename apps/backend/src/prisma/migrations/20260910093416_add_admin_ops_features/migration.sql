-- CreateEnum
CREATE TYPE "ErrorSource" AS ENUM ('BACKEND', 'FRONTEND');

-- AlterEnum
ALTER TYPE "HistoryAction" ADD VALUE 'TAGGED';

-- AlterEnum
ALTER TYPE "LoginEventResult" ADD VALUE 'MAINTENANCE';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM_ERROR';

-- CreateTable
CREATE TABLE "SystemFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "source" "ErrorSource" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "route" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "userId" TEXT,
    "userAgent" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagRule" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "KioskToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TicketTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TicketTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ErrorLog_fingerprint_idx" ON "ErrorLog"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorLog_lastSeenAt_idx" ON "ErrorLog"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorLog_resolvedAt_idx" ON "ErrorLog"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "TagRule_tagId_idx" ON "TagRule"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "KioskToken_token_key" ON "KioskToken"("token");

-- CreateIndex
CREATE INDEX "_TicketTags_B_index" ON "_TicketTags"("B");

-- AddForeignKey
ALTER TABLE "SystemFlag" ADD CONSTRAINT "SystemFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagRule" ADD CONSTRAINT "TagRule_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskToken" ADD CONSTRAINT "KioskToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TicketTags" ADD CONSTRAINT "_TicketTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TicketTags" ADD CONSTRAINT "_TicketTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
