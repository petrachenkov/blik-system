-- CreateTable
CREATE TABLE "CalendarTask" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "ticketId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarTask_ownerId_start_idx" ON "CalendarTask"("ownerId", "start");

-- CreateIndex
CREATE INDEX "CalendarTask_ticketId_idx" ON "CalendarTask"("ticketId");

-- AddForeignKey
ALTER TABLE "CalendarTask" ADD CONSTRAINT "CalendarTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarTask" ADD CONSTRAINT "CalendarTask_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarTask" ADD CONSTRAINT "CalendarTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
