-- CreateTable
CREATE TABLE "XpAward" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "XpAward_profileId_kind_refId_key" ON "XpAward"("profileId", "kind", "refId");

-- CreateIndex
CREATE INDEX "XpAward_profileId_awardedAt_idx" ON "XpAward"("profileId", "awardedAt");

-- AddForeignKey
ALTER TABLE "XpAward" ADD CONSTRAINT "XpAward_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
