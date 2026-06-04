-- The previous migration tried to drop "Asset_sha256_key" with DROP INDEX
-- IF EXISTS, but in Postgres a UNIQUE column constraint owns its backing
-- index — DROP INDEX silently does nothing. The constraint stayed live and
-- continued to block cross-user uploads. ALTER TABLE DROP CONSTRAINT is
-- the correct path; IF EXISTS keeps it idempotent for fresh DBs that never
-- had the constraint in the first place.

ALTER TABLE "Asset" DROP CONSTRAINT IF EXISTS "Asset_sha256_key";
