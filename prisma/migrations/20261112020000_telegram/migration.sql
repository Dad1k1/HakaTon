ALTER TABLE "Notification" ADD COLUMN "telegramSentAt" TIMESTAMP(3), ADD COLUMN "telegramRetryAt" TIMESTAMP(3), ADD COLUMN "telegramAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "TelegramConnection" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "chatId" TEXT, "tokenHash" TEXT, "expiresAt" TIMESTAMP(3), "connectedAt" TIMESTAMP(3), CONSTRAINT "TelegramConnection_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "TelegramConnection_userId_key" ON "TelegramConnection"("userId");
CREATE UNIQUE INDEX "TelegramConnection_chatId_key" ON "TelegramConnection"("chatId");
CREATE UNIQUE INDEX "TelegramConnection_tokenHash_key" ON "TelegramConnection"("tokenHash");
ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
