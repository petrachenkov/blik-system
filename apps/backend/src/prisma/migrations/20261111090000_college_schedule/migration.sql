ALTER TYPE "UserRole" ADD VALUE 'SCHEDULE';

CREATE TABLE "CollegeScheduleSnapshot" (
    "key" TEXT PRIMARY KEY,
    "data" JSONB NOT NULL
);

CREATE TABLE "CollegeScheduleSettings" (
    "id" INTEGER PRIMARY KEY,
    "anchorMonday" TEXT,
    "anchorColor" TEXT,
    "announcement" TEXT
);

CREATE TABLE "CollegeScheduleOverride" (
    "group" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "lessons" JSONB NOT NULL,
    PRIMARY KEY ("group", "day", "pair")
);
