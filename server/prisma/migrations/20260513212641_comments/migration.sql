-- CreateEnum
CREATE TYPE "CommentTargetKind" AS ENUM ('CREATION', 'GAME', 'GROUP');

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "authorProfileId" TEXT,
    "targetKind" "CommentTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "likedBy" JSONB NOT NULL DEFAULT '[]',
    "followedBy" JSONB NOT NULL DEFAULT '[]',
    "animation" JSONB,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_targetKind_targetId_createdAt_idx" ON "Comment"("targetKind", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_authorProfileId_createdAt_idx" ON "Comment"("authorProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_status_idx" ON "Comment"("status");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
