-- Add checkedAt cursor column to MediaAsset so the reconciliation job can advance
-- past already-inspected rows instead of re-checking the same oldest batch forever.
ALTER TABLE "MediaAsset" ADD COLUMN "checkedAt" TIMESTAMP(3);
