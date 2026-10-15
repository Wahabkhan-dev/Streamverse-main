-- AlterTable
ALTER TABLE "Movie" ADD COLUMN     "backdropAssetId" TEXT,
ADD COLUMN     "masterAssetId" TEXT,
ADD COLUMN     "posterAssetId" TEXT,
ADD COLUMN     "teaserAssetId" TEXT,
ADD COLUMN     "thumbnailAssetId" TEXT,
ADD COLUMN     "trailerAssetId" TEXT;

-- AlterTable
ALTER TABLE "Ebook" ADD COLUMN     "backCoverAssetId" TEXT,
ADD COLUMN     "epubAssetId" TEXT,
ADD COLUMN     "frontCoverAssetId" TEXT,
ADD COLUMN     "fullWrapAssetId" TEXT,
ADD COLUMN     "pdfAssetId" TEXT,
ADD COLUMN     "sampleAssetId" TEXT,
ADD COLUMN     "spineAssetId" TEXT,
ADD COLUMN     "thumbnailAssetId" TEXT;

-- AlterTable
ALTER TABLE "Audiobook" ADD COLUMN     "coverAssetId" TEXT,
ADD COLUMN     "mainAssetId" TEXT,
ADD COLUMN     "previewAssetId" TEXT,
ADD COLUMN     "thumbnailAssetId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Movie_posterAssetId_key" ON "Movie"("posterAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_backdropAssetId_key" ON "Movie"("backdropAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_thumbnailAssetId_key" ON "Movie"("thumbnailAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_masterAssetId_key" ON "Movie"("masterAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_trailerAssetId_key" ON "Movie"("trailerAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_teaserAssetId_key" ON "Movie"("teaserAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_epubAssetId_key" ON "Ebook"("epubAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_pdfAssetId_key" ON "Ebook"("pdfAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_sampleAssetId_key" ON "Ebook"("sampleAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_frontCoverAssetId_key" ON "Ebook"("frontCoverAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_backCoverAssetId_key" ON "Ebook"("backCoverAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_spineAssetId_key" ON "Ebook"("spineAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_fullWrapAssetId_key" ON "Ebook"("fullWrapAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_thumbnailAssetId_key" ON "Ebook"("thumbnailAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Audiobook_mainAssetId_key" ON "Audiobook"("mainAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Audiobook_previewAssetId_key" ON "Audiobook"("previewAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Audiobook_coverAssetId_key" ON "Audiobook"("coverAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Audiobook_thumbnailAssetId_key" ON "Audiobook"("thumbnailAssetId");

-- AddForeignKey
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_posterAssetId_fkey" FOREIGN KEY ("posterAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_backdropAssetId_fkey" FOREIGN KEY ("backdropAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_masterAssetId_fkey" FOREIGN KEY ("masterAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_trailerAssetId_fkey" FOREIGN KEY ("trailerAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_teaserAssetId_fkey" FOREIGN KEY ("teaserAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_epubAssetId_fkey" FOREIGN KEY ("epubAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_sampleAssetId_fkey" FOREIGN KEY ("sampleAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_frontCoverAssetId_fkey" FOREIGN KEY ("frontCoverAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_backCoverAssetId_fkey" FOREIGN KEY ("backCoverAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_spineAssetId_fkey" FOREIGN KEY ("spineAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_fullWrapAssetId_fkey" FOREIGN KEY ("fullWrapAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audiobook" ADD CONSTRAINT "Audiobook_mainAssetId_fkey" FOREIGN KEY ("mainAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audiobook" ADD CONSTRAINT "Audiobook_previewAssetId_fkey" FOREIGN KEY ("previewAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audiobook" ADD CONSTRAINT "Audiobook_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audiobook" ADD CONSTRAINT "Audiobook_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

