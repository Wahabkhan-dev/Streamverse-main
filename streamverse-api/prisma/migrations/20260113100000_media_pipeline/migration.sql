-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaAssetStatus" ADD VALUE 'UPLOADING';
ALTER TYPE "MediaAssetStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "bitrate" INTEGER,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "codec" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "hlsManifestKey" TEXT,
ADD COLUMN     "languageId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "sourceAssetId" TEXT,
ADD COLUMN     "variant" TEXT;

-- CreateTable
CREATE TABLE "MultipartUpload" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "providerUploadId" TEXT NOT NULL,
    "parts" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MultipartUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MultipartUpload_assetId_key" ON "MultipartUpload"("assetId");

-- CreateIndex
CREATE INDEX "MediaAsset_sourceAssetId_idx" ON "MediaAsset"("sourceAssetId");

-- CreateIndex
CREATE INDEX "MediaAsset_expiresAt_idx" ON "MediaAsset"("expiresAt");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartUpload" ADD CONSTRAINT "MultipartUpload_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

