-- ESHU Database Schema for Supabase/PostgreSQL

-- Enums
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER');
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'DELETED', 'BURNED', 'FINISHED');
CREATE TYPE "GameTimingExtensionType" AS ENUM ('start_extended', 'submission_extended', 'end_extended', 'future_start');
CREATE TYPE "CommentTargetKind" AS ENUM ('CREATION', 'GAME', 'GROUP');

-- User table
CREATE TABLE "User" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT,
  bio TEXT,
  "avatarAssetId" TEXT UNIQUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "lastLoginAt" TIMESTAMP
);

CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- Session table
CREATE TABLE "Session" (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL,
  "userId" TEXT,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE INDEX "Session_expire_idx" ON "Session"(expire);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- Asset table
CREATE TABLE "Asset" (
  id TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  kind "AssetKind" NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  "durationMs" INTEGER,
  "originalName" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE CASCADE,
  CONSTRAINT "Asset_ownerId_sha256_key" UNIQUE ("ownerId", sha256)
);

CREATE INDEX "Asset_ownerId_createdAt_idx" ON "Asset"("ownerId", "createdAt");
CREATE INDEX "Asset_sha256_idx" ON "Asset"(sha256);
CREATE INDEX "Asset_kind_idx" ON "Asset"(kind);

-- Profile table
CREATE TABLE "Profile" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  "avatarAssetId" TEXT UNIQUE,
  "xpPoints" INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE,
  CONSTRAINT "Profile_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "Asset"(id)
);

CREATE INDEX "Profile_userId_createdAt_idx" ON "Profile"("userId", "createdAt");

-- Update User table to add foreign key for avatar
ALTER TABLE "User" ADD CONSTRAINT "User_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "Asset"(id);

-- UserSetting table
CREATE TABLE "UserSetting" (
  "userId" TEXT PRIMARY KEY,
  "uiTheme" TEXT NOT NULL DEFAULT 'light',
  "primaryGroupId" TEXT,
  "currentProfileId" TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

-- Group table
CREATE TABLE "Group" (
  id TEXT PRIMARY KEY,
  "ownerProfileId" TEXT,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'social',
  privacy TEXT NOT NULL DEFAULT 'public',
  status "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
  "coverAssetId" TEXT UNIQUE,
  members INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "Group_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile"(id) ON DELETE SET NULL,
  CONSTRAINT "Group_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"(id)
);

CREATE INDEX "Group_ownerProfileId_status_createdAt_idx" ON "Group"("ownerProfileId", status, "createdAt");
CREATE INDEX "Group_privacy_status_idx" ON "Group"(privacy, status);

-- Game table
CREATE TABLE "Game" (
  id TEXT PRIMARY KEY,
  "ownerProfileId" TEXT,
  "hostGroupId" TEXT,
  "hostGroupName" TEXT,
  name TEXT NOT NULL,
  description TEXT,
  rules TEXT,
  privacy TEXT NOT NULL DEFAULT 'public',
  "gameType" TEXT NOT NULL DEFAULT 'book',
  "timingMode" TEXT NOT NULL DEFAULT 'infinite',
  status "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "startTime" TIMESTAMP,
  "submissionCloseTime" TIMESTAMP,
  "endTime" TIMESTAMP,
  "timingStartOffsetMs" INTEGER NOT NULL DEFAULT 0,
  "timingSubmissionOffsetMs" INTEGER NOT NULL DEFAULT 0,
  "timingEndOffsetMs" INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "Game_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile"(id) ON DELETE SET NULL,
  CONSTRAINT "Game_hostGroupId_fkey" FOREIGN KEY ("hostGroupId") REFERENCES "Group"(id) ON DELETE SET NULL
);

CREATE INDEX "Game_ownerProfileId_status_createdAt_idx" ON "Game"("ownerProfileId", status, "createdAt");
CREATE INDEX "Game_hostGroupId_status_idx" ON "Game"("hostGroupId", status);
CREATE INDEX "Game_status_endTime_idx" ON "Game"(status, "endTime");

-- Creation table
CREATE TABLE "Creation" (
  id TEXT PRIMARY KEY,
  "ownerProfileId" TEXT,
  "hostGameId" TEXT,
  name TEXT NOT NULL,
  description TEXT,
  devices TEXT,
  tags TEXT,
  "dateMade" TEXT,
  status "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "imageAssetId" TEXT UNIQUE,
  data JSONB NOT NULL DEFAULT '{}',
  timestamp BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "Creation_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile"(id) ON DELETE SET NULL,
  CONSTRAINT "Creation_hostGameId_fkey" FOREIGN KEY ("hostGameId") REFERENCES "Game"(id) ON DELETE SET NULL,
  CONSTRAINT "Creation_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "Asset"(id)
);

CREATE INDEX "Creation_ownerProfileId_status_createdAt_idx" ON "Creation"("ownerProfileId", status, "createdAt");
CREATE INDEX "Creation_hostGameId_status_idx" ON "Creation"("hostGameId", status);

-- GroupMember table
CREATE TABLE "GroupMember" (
  "groupId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
  role TEXT,
  PRIMARY KEY ("groupId", "profileId"),
  CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE,
  CONSTRAINT "GroupMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"(id) ON DELETE CASCADE
);

CREATE INDEX "GroupMember_profileId_idx" ON "GroupMember"("profileId");

-- GameMember table
CREATE TABLE "GameMember" (
  "gameId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
  role TEXT,
  PRIMARY KEY ("gameId", "profileId"),
  CONSTRAINT "GameMember_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"(id) ON DELETE CASCADE,
  CONSTRAINT "GameMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"(id) ON DELETE CASCADE
);

CREATE INDEX "GameMember_profileId_idx" ON "GameMember"("profileId");

-- GameTimingExtension table
CREATE TABLE "GameTimingExtension" (
  id TEXT PRIMARY KEY,
  "gameId" TEXT NOT NULL,
  type "GameTimingExtensionType" NOT NULL,
  "prevTime" TIMESTAMP,
  "nextTime" TIMESTAMP,
  "happenedAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "GameTimingExtension_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"(id) ON DELETE CASCADE
);

CREATE INDEX "GameTimingExtension_gameId_createdAt_idx" ON "GameTimingExtension"("gameId", "createdAt");

-- Comment table
CREATE TABLE "Comment" (
  id TEXT PRIMARY KEY,
  "authorProfileId" TEXT,
  "targetKind" "CommentTargetKind" NOT NULL,
  "targetId" TEXT NOT NULL,
  text TEXT NOT NULL,
  status "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "likedBy" JSONB NOT NULL DEFAULT '[]',
  "followedBy" JSONB NOT NULL DEFAULT '[]',
  animation JSONB,
  data JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "editedAt" TIMESTAMP,
  CONSTRAINT "Comment_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"(id) ON DELETE SET NULL
);

CREATE INDEX "Comment_targetKind_targetId_createdAt_idx" ON "Comment"("targetKind", "targetId", "createdAt");
CREATE INDEX "Comment_authorProfileId_createdAt_idx" ON "Comment"("authorProfileId", "createdAt");
CREATE INDEX "Comment_status_idx" ON "Comment"(status);

-- App-specific user/auth tables
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX users_email_idx ON users(email);
CREATE INDEX users_username_idx ON users(username);
CREATE INDEX users_created_at_idx ON users(created_at);

CREATE TABLE profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX profiles_user_id_idx ON profiles(user_id);

CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT posts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX posts_profile_id_idx ON posts(profile_id);
CREATE INDEX posts_status_idx ON posts(status);
CREATE INDEX posts_published_at_idx ON posts(published_at);
