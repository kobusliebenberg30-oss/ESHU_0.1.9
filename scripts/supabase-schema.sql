-- Complete Supabase schema generated from Prisma migrations
-- Apply this in the Supabase SQL Editor for your target project.

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'DELETED', 'BURNED', 'FINISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "avatarAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "sid" TEXT NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatarAssetId" TEXT,
    "xpPoints" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "ownerProfileId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'social',
    "privacy" TEXT NOT NULL DEFAULT 'public',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "coverAssetId" TEXT,
    "members" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "ownerProfileId" TEXT,
    "hostGroupId" TEXT,
    "hostGroupName" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" TEXT,
    "privacy" TEXT NOT NULL DEFAULT 'public',
    "gameType" TEXT NOT NULL DEFAULT 'book',
    "timingMode" TEXT NOT NULL DEFAULT 'infinite',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "startTime" TIMESTAMP(3),
    "submissionCloseTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creation" (
    "id" TEXT NOT NULL,
    "ownerProfileId" TEXT,
    "hostGameId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "devices" TEXT,
    "tags" TEXT,
    "dateMade" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "imageAssetId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "timestamp" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "userId" TEXT NOT NULL,
    "uiTheme" TEXT NOT NULL DEFAULT 'light',
    "primaryGroupId" TEXT,
    "currentProfileId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "groupId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId", "profileId")
);

-- CreateTable
CREATE TABLE "GameMember" (
    "gameId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT,

    CONSTRAINT "GameMember_pkey" PRIMARY KEY ("gameId", "profileId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_avatarAssetId_key" ON "User"("avatarAssetId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "Session_expire_idx" ON "Session"("expire");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_sha256_key" ON "Asset"("sha256");

-- CreateIndex
CREATE INDEX "Asset_ownerId_createdAt_idx" ON "Asset"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_kind_idx" ON "Asset"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_avatarAssetId_key" ON "Profile"("avatarAssetId");

-- CreateIndex
CREATE INDEX "Profile_userId_createdAt_idx" ON "Profile"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Group_coverAssetId_key" ON "Group"("coverAssetId");

-- CreateIndex
CREATE INDEX "Group_ownerProfileId_status_createdAt_idx" ON "Group"("ownerProfileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Group_privacy_status_idx" ON "Group"("privacy", "status");

-- CreateIndex
CREATE INDEX "Game_ownerProfileId_status_createdAt_idx" ON "Game"("ownerProfileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Game_hostGroupId_status_idx" ON "Game"("hostGroupId", "status");

-- CreateIndex
CREATE INDEX "Game_status_endTime_idx" ON "Game"("status", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "Creation_imageAssetId_key" ON "Creation"("imageAssetId");

-- CreateIndex
CREATE INDEX "Creation_ownerProfileId_status_createdAt_idx" ON "Creation"("ownerProfileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Creation_hostGameId_status_idx" ON "Creation"("hostGameId", "status");

-- CreateIndex
CREATE INDEX "GroupMember_profileId_idx" ON "GroupMember"("profileId");

-- CreateIndex
CREATE INDEX "GameMember_profileId_idx" ON "GameMember"("profileId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_hostGroupId_fkey" FOREIGN KEY ("hostGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creation" ADD CONSTRAINT "Creation_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creation" ADD CONSTRAINT "Creation_hostGameId_fkey" FOREIGN KEY ("hostGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creation" ADD CONSTRAINT "Creation_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMember" ADD CONSTRAINT "GameMember_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMember" ADD CONSTRAINT "GameMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- Per-owner uniqueness on (ownerId, sha256) replaces the global UNIQUE on
-- sha256 alone. The global constraint blocked any cross-user re-upload of
-- the same content (e.g. when two players save the same default avatar or
-- one player re-uploads someone else's creation), and the dedup logic in
-- assets.service.ts requires a per-owner unique key for `findUnique`.
-- The shared content blob in object storage is unaffected (still keyed by
-- sha256 in the storage driver) — only the metadata row is now per-owner.
DROP INDEX IF EXISTS "Asset_sha256_key";

CREATE UNIQUE INDEX "Asset_ownerId_sha256_key" ON "Asset"("ownerId", "sha256");

CREATE INDEX "Asset_sha256_idx" ON "Asset"("sha256");

-- The previous migration tried to drop "Asset_sha256_key" with DROP INDEX
-- IF EXISTS, but in Postgres a UNIQUE column constraint owns its backing
-- index — DROP INDEX silently does nothing. The constraint stayed live and
-- continued to block cross-user uploads. ALTER TABLE DROP CONSTRAINT is
-- the correct path; IF EXISTS keeps it idempotent for fresh DBs that never
-- had the constraint in the first place.
ALTER TABLE "Asset" DROP CONSTRAINT IF EXISTS "Asset_sha256_key";
