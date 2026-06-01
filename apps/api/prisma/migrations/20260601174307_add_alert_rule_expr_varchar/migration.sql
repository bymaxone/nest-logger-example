/*
  Warnings:

  - You are about to alter the column `expr` on the `AlertRule` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1024)`.

*/
-- DropIndex
DROP INDEX "ApplicationLog_time_idx";

-- AlterTable
ALTER TABLE "AlertRule" ALTER COLUMN "expr" SET DATA TYPE VARCHAR(1024);

-- CreateIndex
CREATE INDEX "ApplicationLog_time_idx" ON "ApplicationLog" USING BRIN ("time" timestamp_minmax_ops);
