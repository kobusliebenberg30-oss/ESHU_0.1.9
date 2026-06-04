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
