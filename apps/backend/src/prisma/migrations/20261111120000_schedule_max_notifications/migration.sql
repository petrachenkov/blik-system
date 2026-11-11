CREATE TABLE "CollegeScheduleMaxSubscriber" (
    "userId" TEXT PRIMARY KEY,
    "announcements" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "target" TEXT
);

CREATE INDEX "CollegeScheduleMaxSubscriber_scope_target_idx" ON "CollegeScheduleMaxSubscriber"("scope", "target");

CREATE TABLE "CollegeScheduleMaxDelivery" (
    "id" SERIAL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "CollegeScheduleMaxSubscriber"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    "text" TEXT NOT NULL,
    "scope" TEXT,
    "target" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CollegeScheduleMaxDelivery_availableAt_id_idx" ON "CollegeScheduleMaxDelivery"("availableAt", "id");
CREATE INDEX "CollegeScheduleMaxDelivery_userId_idx" ON "CollegeScheduleMaxDelivery"("userId");
