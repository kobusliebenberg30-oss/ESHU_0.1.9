-- CreateEnum
CREATE TYPE "GameTimingExtensionType" AS ENUM ('start_extended', 'submission_extended', 'end_extended', 'future_start');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "timingEndOffsetMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timingStartOffsetMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timingSubmissionOffsetMs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GameTimingExtension" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" "GameTimingExtensionType" NOT NULL,
    "prevTime" TIMESTAMP(3),
    "nextTime" TIMESTAMP(3),
    "happenedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameTimingExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameTimingExtension_gameId_createdAt_idx" ON "GameTimingExtension"("gameId", "createdAt");

-- AddForeignKey
ALTER TABLE "GameTimingExtension" ADD CONSTRAINT "GameTimingExtension_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
