-- Allow multiple creations to reuse the same uploaded image asset.
-- Asset bytes are content-addressed/deduped by sha256, so a reused upload
-- should not force a duplicate blob or metadata row.
DROP INDEX IF EXISTS "Creation_imageAssetId_key";
