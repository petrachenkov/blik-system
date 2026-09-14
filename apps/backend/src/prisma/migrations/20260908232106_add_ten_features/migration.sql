-- CreateEnum
CREATE TYPE "LoginEventResult" AS ENUM ('SUCCESS', 'INVALID_CREDENTIALS', 'ACCOUNT_DISABLED', 'LDAP_UNAVAILABLE');

-- AlterEnum
ALTER TYPE "HistoryAction" ADD VALUE 'RATED';

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'WEB_PUSH';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "ratingComment" TEXT;

-- AlterTable
ALTER TABLE "TicketComment" ADD COLUMN     "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userId" TEXT,
    "result" "LoginEventResult" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleAttachment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingChannelDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingChannelDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginEvent_userId_idx" ON "LoginEvent"("userId");

-- CreateIndex
CREATE INDEX "LoginEvent_username_idx" ON "LoginEvent"("username");

-- CreateIndex
CREATE INDEX "LoginEvent_createdAt_idx" ON "LoginEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "WebPushSubscription_userId_idx" ON "WebPushSubscription"("userId");

-- CreateIndex
CREATE INDEX "KnowledgeArticleAttachment_articleId_idx" ON "KnowledgeArticleAttachment"("articleId");

-- CreateIndex
CREATE INDEX "PendingChannelDelivery_channel_idx" ON "PendingChannelDelivery"("channel");

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleAttachment" ADD CONSTRAINT "KnowledgeArticleAttachment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleAttachment" ADD CONSTRAINT "KnowledgeArticleAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingChannelDelivery" ADD CONSTRAINT "PendingChannelDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
