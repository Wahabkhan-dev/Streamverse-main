-- CreateEnum
CREATE TYPE "CrewRole" AS ENUM ('DIRECTOR', 'PRODUCER', 'WRITER', 'CINEMATOGRAPHER', 'COMPOSER', 'EDITOR', 'OTHER');

-- CreateEnum
CREATE TYPE "CaptionType" AS ENUM ('SUBTITLE', 'CLOSED_CAPTION', 'SDH');

-- CreateEnum
CREATE TYPE "AssetLinkStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('SINGLE_FILE', 'CHAPTER_FILES');

-- CreateEnum
CREATE TYPE "LanguageRole" AS ENUM ('PRIMARY', 'ORIGINAL', 'ADDITIONAL_AUDIO', 'TRANSLATION');

-- CreateEnum
CREATE TYPE "TerritoryMode" AS ENUM ('WORLDWIDE', 'INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "MediaAssetType" AS ENUM ('MOVIE_MASTER', 'POSTER', 'BACKDROP', 'THUMBNAIL', 'NORMAL_BANNER', 'HERO_BANNER', 'LATEST_RELEASE_BANNER', 'MOBILE_BANNER', 'TRAILER', 'TEASER', 'CAPTION', 'AUDIO_TRACK', 'EBOOK_EPUB', 'EBOOK_PDF', 'EBOOK_SAMPLE', 'EBOOK_FRONT_COVER', 'EBOOK_BACK_COVER', 'EBOOK_SPINE', 'EBOOK_FULL_WRAP', 'AUDIOBOOK_FILE', 'AUDIOBOOK_PREVIEW', 'AUDIOBOOK_COVER', 'AUDIOBOOK_CHAPTER', 'NARRATOR_IMAGE');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'MISSING');

-- CreateEnum
CREATE TYPE "LegalDocType" AS ENUM ('PRIVACY_POLICY', 'TERMS_AND_CONDITIONS', 'REFUND_POLICY');

-- CreateEnum
CREATE TYPE "LegalStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BannerType" AS ENUM ('HERO', 'NORMAL', 'LATEST_RELEASE', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('BOOLEAN', 'STRING', 'NUMBER', 'JSON');

-- CreateTable
CREATE TABLE "ContentSequence" (
    "type" "ContentType" NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContentSequence_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "contentCode" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "ageRating" TEXT,
    "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
    "minimumAge" INTEGER,
    "territoryMode" "TerritoryMode" NOT NULL DEFAULT 'WORLDWIDE',
    "releaseDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishAt" TIMESTAMP(3),
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "newRelease" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movie" (
    "contentId" TEXT NOT NULL,
    "runtimeMinutes" INTEGER,
    "productionStudio" TEXT,
    "countryOfOrigin" TEXT,
    "copyrightOwner" TEXT,
    "copyrightYear" INTEGER,
    "rightsNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Movie_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "MovieCaption" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "type" "CaptionType" NOT NULL,
    "mediaAssetId" TEXT,
    "status" "AssetLinkStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovieCaption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieAudioTrack" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "status" "AssetLinkStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovieAudioTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieCast" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "characterName" TEXT,
    "imageAssetId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovieCast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieCrew" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "CrewRole" NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovieCrew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ebook" (
    "contentId" TEXT NOT NULL,
    "author" TEXT,
    "coAuthor" TEXT,
    "editor" TEXT,
    "publisher" TEXT,
    "isbn" TEXT,
    "edition" TEXT,
    "series" TEXT,
    "seriesNumber" INTEGER,
    "pageCount" INTEGER,
    "publicationDate" TIMESTAMP(3),
    "copyrightOwner" TEXT,
    "copyrightYear" INTEGER,
    "rightsNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ebook_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "EbookEdition" (
    "id" TEXT NOT NULL,
    "ebookId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "translatedTitle" TEXT NOT NULL,
    "translator" TEXT,
    "epubAssetId" TEXT,
    "pdfAssetId" TEXT,
    "coverAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbookEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audiobook" (
    "contentId" TEXT NOT NULL,
    "author" TEXT,
    "narrator" TEXT,
    "publisher" TEXT,
    "isbn" TEXT,
    "series" TEXT,
    "seriesNumber" INTEGER,
    "releaseDate" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'SINGLE_FILE',
    "copyrightOwner" TEXT,
    "copyrightYear" INTEGER,
    "rightsNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audiobook_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "AudiobookEdition" (
    "id" TEXT NOT NULL,
    "audiobookId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "narrator" TEXT NOT NULL,
    "narratorBio" TEXT,
    "narratorImageAssetId" TEXT,
    "audioAssetId" TEXT,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudiobookEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudiobookChapter" (
    "id" TEXT NOT NULL,
    "audiobookId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "audioAssetId" TEXT,
    "durationSeconds" INTEGER,
    "startTimeSeconds" INTEGER,
    "endTimeSeconds" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudiobookChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentLanguage" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "role" "LanguageRole" NOT NULL,

    CONSTRAINT "ContentLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "contentType" "ContentType",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentGenre" (
    "contentId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "ContentGenre_pkey" PRIMARY KEY ("contentId","genreId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTag" (
    "contentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ContentTag_pkey" PRIMARY KEY ("contentId","tagId")
);

-- CreateTable
CREATE TABLE "ContentWarningType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ContentWarningType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentWarning" (
    "contentId" TEXT NOT NULL,
    "warningTypeId" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ContentWarning_pkey" PRIMARY KEY ("contentId","warningTypeId")
);

-- CreateTable
CREATE TABLE "ContentTerritory" (
    "contentId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,

    CONSTRAINT "ContentTerritory_pkey" PRIMARY KEY ("contentId","countryCode")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "contentId" TEXT,
    "type" "MediaAssetType" NOT NULL,
    "storageKey" TEXT,
    "originalFileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" INTEGER,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "type" "LegalDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "currentPublishedVersionId" TEXT,
    "currentDraftVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" TEXT NOT NULL,
    "legalDocumentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "effectiveAt" TIMESTAMP(3),
    "status" "LegalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" "SettingValueType" NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "HomepageSection" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayTitle" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "itemLimit" INTEGER NOT NULL DEFAULT 12,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomepageSectionItem" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HomepageSectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "bannerAssetId" TEXT,
    "status" "CollectionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "type" "BannerType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "desktopAssetId" TEXT,
    "mobileAssetId" TEXT,
    "linkedContentId" TEXT,
    "buttonText" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Content_contentCode_key" ON "Content"("contentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Content_slug_key" ON "Content"("slug");

-- CreateIndex
CREATE INDEX "Content_contentCode_idx" ON "Content"("contentCode");

-- CreateIndex
CREATE INDEX "Content_slug_idx" ON "Content"("slug");

-- CreateIndex
CREATE INDEX "Content_type_idx" ON "Content"("type");

-- CreateIndex
CREATE INDEX "Content_status_idx" ON "Content"("status");

-- CreateIndex
CREATE INDEX "Content_visibility_idx" ON "Content"("visibility");

-- CreateIndex
CREATE INDEX "Content_publishedAt_idx" ON "Content"("publishedAt");

-- CreateIndex
CREATE INDEX "Content_releaseDate_idx" ON "Content"("releaseDate");

-- CreateIndex
CREATE INDEX "Content_deletedAt_idx" ON "Content"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MovieCaption_mediaAssetId_key" ON "MovieCaption"("mediaAssetId");

-- CreateIndex
CREATE INDEX "MovieCaption_movieId_idx" ON "MovieCaption"("movieId");

-- CreateIndex
CREATE UNIQUE INDEX "MovieCaption_movieId_languageId_type_key" ON "MovieCaption"("movieId", "languageId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MovieAudioTrack_mediaAssetId_key" ON "MovieAudioTrack"("mediaAssetId");

-- CreateIndex
CREATE INDEX "MovieAudioTrack_movieId_idx" ON "MovieAudioTrack"("movieId");

-- CreateIndex
CREATE UNIQUE INDEX "MovieAudioTrack_movieId_languageId_key" ON "MovieAudioTrack"("movieId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "MovieCast_imageAssetId_key" ON "MovieCast"("imageAssetId");

-- CreateIndex
CREATE INDEX "MovieCast_movieId_idx" ON "MovieCast"("movieId");

-- CreateIndex
CREATE INDEX "MovieCrew_movieId_idx" ON "MovieCrew"("movieId");

-- CreateIndex
CREATE UNIQUE INDEX "EbookEdition_epubAssetId_key" ON "EbookEdition"("epubAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "EbookEdition_pdfAssetId_key" ON "EbookEdition"("pdfAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "EbookEdition_coverAssetId_key" ON "EbookEdition"("coverAssetId");

-- CreateIndex
CREATE INDEX "EbookEdition_ebookId_idx" ON "EbookEdition"("ebookId");

-- CreateIndex
CREATE UNIQUE INDEX "EbookEdition_ebookId_languageId_key" ON "EbookEdition"("ebookId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "AudiobookEdition_narratorImageAssetId_key" ON "AudiobookEdition"("narratorImageAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "AudiobookEdition_audioAssetId_key" ON "AudiobookEdition"("audioAssetId");

-- CreateIndex
CREATE INDEX "AudiobookEdition_audiobookId_idx" ON "AudiobookEdition"("audiobookId");

-- CreateIndex
CREATE UNIQUE INDEX "AudiobookEdition_audiobookId_languageId_key" ON "AudiobookEdition"("audiobookId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "AudiobookChapter_audioAssetId_key" ON "AudiobookChapter"("audioAssetId");

-- CreateIndex
CREATE INDEX "AudiobookChapter_audiobookId_idx" ON "AudiobookChapter"("audiobookId");

-- CreateIndex
CREATE UNIQUE INDEX "AudiobookChapter_audiobookId_chapterNumber_key" ON "AudiobookChapter"("audiobookId", "chapterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Language_code_key" ON "Language"("code");

-- CreateIndex
CREATE INDEX "Language_code_idx" ON "Language"("code");

-- CreateIndex
CREATE INDEX "ContentLanguage_contentId_idx" ON "ContentLanguage"("contentId");

-- CreateIndex
CREATE INDEX "ContentLanguage_languageId_idx" ON "ContentLanguage"("languageId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLanguage_contentId_languageId_role_key" ON "ContentLanguage"("contentId", "languageId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_slug_key" ON "Genre"("slug");

-- CreateIndex
CREATE INDEX "Genre_slug_idx" ON "Genre"("slug");

-- CreateIndex
CREATE INDEX "ContentGenre_genreId_idx" ON "ContentGenre"("genreId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_slug_idx" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "ContentTag_tagId_idx" ON "ContentTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentWarningType_key_key" ON "ContentWarningType"("key");

-- CreateIndex
CREATE INDEX "ContentWarning_warningTypeId_idx" ON "ContentWarning"("warningTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_contentId_idx" ON "MediaAsset"("contentId");

-- CreateIndex
CREATE INDEX "MediaAsset_type_idx" ON "MediaAsset"("type");

-- CreateIndex
CREATE INDEX "MediaAsset_status_idx" ON "MediaAsset"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_type_key" ON "LegalDocument"("type");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_slug_key" ON "LegalDocument"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_currentPublishedVersionId_key" ON "LegalDocument"("currentPublishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_currentDraftVersionId_key" ON "LegalDocument"("currentDraftVersionId");

-- CreateIndex
CREATE INDEX "LegalDocument_type_idx" ON "LegalDocument"("type");

-- CreateIndex
CREATE INDEX "LegalDocumentVersion_legalDocumentId_idx" ON "LegalDocumentVersion"("legalDocumentId");

-- CreateIndex
CREATE INDEX "LegalDocumentVersion_status_idx" ON "LegalDocumentVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HomepageSection_key_key" ON "HomepageSection"("key");

-- CreateIndex
CREATE INDEX "HomepageSectionItem_contentId_idx" ON "HomepageSectionItem"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "HomepageSectionItem_sectionId_contentId_key" ON "HomepageSectionItem"("sectionId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_bannerAssetId_key" ON "Collection"("bannerAssetId");

-- CreateIndex
CREATE INDEX "Collection_slug_idx" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "Collection_status_idx" ON "Collection"("status");

-- CreateIndex
CREATE INDEX "CollectionItem_contentId_idx" ON "CollectionItem"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_contentId_key" ON "CollectionItem"("collectionId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "Banner_desktopAssetId_key" ON "Banner"("desktopAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Banner_mobileAssetId_key" ON "Banner"("mobileAssetId");

-- CreateIndex
CREATE INDEX "Banner_linkedContentId_idx" ON "Banner"("linkedContentId");

-- CreateIndex
CREATE INDEX "Banner_active_idx" ON "Banner"("active");

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieCaption" ADD CONSTRAINT "MovieCaption_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieCaption" ADD CONSTRAINT "MovieCaption_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieCaption" ADD CONSTRAINT "MovieCaption_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieAudioTrack" ADD CONSTRAINT "MovieAudioTrack_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieAudioTrack" ADD CONSTRAINT "MovieAudioTrack_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieAudioTrack" ADD CONSTRAINT "MovieAudioTrack_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieCast" ADD CONSTRAINT "MovieCast_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieCast" ADD CONSTRAINT "MovieCast_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieCrew" ADD CONSTRAINT "MovieCrew_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookEdition" ADD CONSTRAINT "EbookEdition_ebookId_fkey" FOREIGN KEY ("ebookId") REFERENCES "Ebook"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookEdition" ADD CONSTRAINT "EbookEdition_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookEdition" ADD CONSTRAINT "EbookEdition_epubAssetId_fkey" FOREIGN KEY ("epubAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookEdition" ADD CONSTRAINT "EbookEdition_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookEdition" ADD CONSTRAINT "EbookEdition_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audiobook" ADD CONSTRAINT "Audiobook_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookEdition" ADD CONSTRAINT "AudiobookEdition_audiobookId_fkey" FOREIGN KEY ("audiobookId") REFERENCES "Audiobook"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookEdition" ADD CONSTRAINT "AudiobookEdition_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookEdition" ADD CONSTRAINT "AudiobookEdition_narratorImageAssetId_fkey" FOREIGN KEY ("narratorImageAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookEdition" ADD CONSTRAINT "AudiobookEdition_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookChapter" ADD CONSTRAINT "AudiobookChapter_audiobookId_fkey" FOREIGN KEY ("audiobookId") REFERENCES "Audiobook"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookChapter" ADD CONSTRAINT "AudiobookChapter_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentLanguage" ADD CONSTRAINT "ContentLanguage_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentLanguage" ADD CONSTRAINT "ContentLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentGenre" ADD CONSTRAINT "ContentGenre_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentGenre" ADD CONSTRAINT "ContentGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTag" ADD CONSTRAINT "ContentTag_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTag" ADD CONSTRAINT "ContentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWarning" ADD CONSTRAINT "ContentWarning_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWarning" ADD CONSTRAINT "ContentWarning_warningTypeId_fkey" FOREIGN KEY ("warningTypeId") REFERENCES "ContentWarningType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTerritory" ADD CONSTRAINT "ContentTerritory_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_currentPublishedVersionId_fkey" FOREIGN KEY ("currentPublishedVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_currentDraftVersionId_fkey" FOREIGN KEY ("currentDraftVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_legalDocumentId_fkey" FOREIGN KEY ("legalDocumentId") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomepageSectionItem" ADD CONSTRAINT "HomepageSectionItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "HomepageSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomepageSectionItem" ADD CONSTRAINT "HomepageSectionItem_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_bannerAssetId_fkey" FOREIGN KEY ("bannerAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_desktopAssetId_fkey" FOREIGN KEY ("desktopAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_mobileAssetId_fkey" FOREIGN KEY ("mobileAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_linkedContentId_fkey" FOREIGN KEY ("linkedContentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

