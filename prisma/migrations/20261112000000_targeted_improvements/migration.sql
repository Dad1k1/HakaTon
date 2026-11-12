ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "guideDismissed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appeal" ADD COLUMN "anonymous" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "rating" INTEGER;
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Notification" ADD COLUMN "deliverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Notification_userId_deliverAt_idx" ON "Notification"("userId", "deliverAt");
