ALTER TABLE "User" ALTER COLUMN "mustChangePassword" SET DEFAULT false;
UPDATE "User" SET "mustChangePassword" = false;
