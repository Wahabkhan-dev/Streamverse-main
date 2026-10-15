-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `status` ENUM('ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `country` VARCHAR(191) NULL,
    `preferredLanguage` VARCHAR(191) NULL,
    `subtitleLanguage` VARCHAR(191) NULL,
    `audioLanguage` VARCHAR(191) NULL,
    `videoQuality` VARCHAR(191) NULL,
    `audiobookSpeed` DOUBLE NULL,
    `stripeCustomerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_stripeCustomerId_key`(`stripeCustomerId`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,

    UNIQUE INDEX `AuthSession_tokenHash_key`(`tokenHash`),
    INDEX `AuthSession_userId_idx`(`userId`),
    INDEX `AuthSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentSequence` (
    `type` ENUM('MOVIE', 'EBOOK', 'AUDIOBOOK') NOT NULL,
    `lastValue` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Content` (
    `id` VARCHAR(191) NOT NULL,
    `contentCode` VARCHAR(191) NOT NULL,
    `type` ENUM('MOVIE', 'EBOOK', 'AUDIOBOOK') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `description` TEXT NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED', 'PROCESSING', 'PROCESSING_FAILED') NOT NULL DEFAULT 'DRAFT',
    `visibility` ENUM('PUBLIC', 'SUBSCRIBERS_ONLY', 'HIDDEN') NOT NULL DEFAULT 'PUBLIC',
    `ageRating` VARCHAR(191) NULL,
    `ageRestricted` BOOLEAN NOT NULL DEFAULT false,
    `minimumAge` INTEGER NULL,
    `territoryMode` ENUM('WORLDWIDE', 'INCLUDE', 'EXCLUDE') NOT NULL DEFAULT 'WORLDWIDE',
    `releaseDate` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishAt` DATETIME(3) NULL,
    `availableFrom` DATETIME(3) NULL,
    `availableUntil` DATETIME(3) NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `trending` BOOLEAN NOT NULL DEFAULT false,
    `popular` BOOLEAN NOT NULL DEFAULT false,
    `newRelease` BOOLEAN NOT NULL DEFAULT false,
    `seoTitle` VARCHAR(191) NULL,
    `seoDescription` VARCHAR(191) NULL,
    `seoKeywords` JSON NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Content_contentCode_key`(`contentCode`),
    UNIQUE INDEX `Content_slug_key`(`slug`),
    INDEX `Content_contentCode_idx`(`contentCode`),
    INDEX `Content_slug_idx`(`slug`),
    INDEX `Content_type_idx`(`type`),
    INDEX `Content_status_idx`(`status`),
    INDEX `Content_visibility_idx`(`visibility`),
    INDEX `Content_publishedAt_idx`(`publishedAt`),
    INDEX `Content_releaseDate_idx`(`releaseDate`),
    INDEX `Content_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Movie` (
    `contentId` VARCHAR(191) NOT NULL,
    `runtimeMinutes` INTEGER NULL,
    `productionStudio` VARCHAR(191) NULL,
    `countryOfOrigin` VARCHAR(191) NULL,
    `copyrightOwner` VARCHAR(191) NULL,
    `copyrightYear` INTEGER NULL,
    `rightsNotes` VARCHAR(191) NULL,
    `posterAssetId` VARCHAR(191) NULL,
    `backdropAssetId` VARCHAR(191) NULL,
    `thumbnailAssetId` VARCHAR(191) NULL,
    `masterAssetId` VARCHAR(191) NULL,
    `trailerAssetId` VARCHAR(191) NULL,
    `teaserAssetId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Movie_posterAssetId_key`(`posterAssetId`),
    UNIQUE INDEX `Movie_backdropAssetId_key`(`backdropAssetId`),
    UNIQUE INDEX `Movie_thumbnailAssetId_key`(`thumbnailAssetId`),
    UNIQUE INDEX `Movie_masterAssetId_key`(`masterAssetId`),
    UNIQUE INDEX `Movie_trailerAssetId_key`(`trailerAssetId`),
    UNIQUE INDEX `Movie_teaserAssetId_key`(`teaserAssetId`),
    PRIMARY KEY (`contentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MovieCaption` (
    `id` VARCHAR(191) NOT NULL,
    `movieId` VARCHAR(191) NOT NULL,
    `languageId` VARCHAR(191) NOT NULL,
    `type` ENUM('SUBTITLE', 'CLOSED_CAPTION', 'SDH') NOT NULL,
    `mediaAssetId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'READY', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MovieCaption_mediaAssetId_key`(`mediaAssetId`),
    INDEX `MovieCaption_movieId_idx`(`movieId`),
    UNIQUE INDEX `MovieCaption_movieId_languageId_type_key`(`movieId`, `languageId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MovieAudioTrack` (
    `id` VARCHAR(191) NOT NULL,
    `movieId` VARCHAR(191) NOT NULL,
    `languageId` VARCHAR(191) NOT NULL,
    `mediaAssetId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'READY', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MovieAudioTrack_mediaAssetId_key`(`mediaAssetId`),
    INDEX `MovieAudioTrack_movieId_idx`(`movieId`),
    UNIQUE INDEX `MovieAudioTrack_movieId_languageId_key`(`movieId`, `languageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MovieCast` (
    `id` VARCHAR(191) NOT NULL,
    `movieId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `characterName` VARCHAR(191) NULL,
    `imageAssetId` VARCHAR(191) NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MovieCast_imageAssetId_key`(`imageAssetId`),
    INDEX `MovieCast_movieId_idx`(`movieId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MovieCrew` (
    `id` VARCHAR(191) NOT NULL,
    `movieId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('DIRECTOR', 'PRODUCER', 'WRITER', 'CINEMATOGRAPHER', 'COMPOSER', 'EDITOR', 'OTHER') NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MovieCrew_movieId_idx`(`movieId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ebook` (
    `contentId` VARCHAR(191) NOT NULL,
    `author` VARCHAR(191) NULL,
    `coAuthor` VARCHAR(191) NULL,
    `editor` VARCHAR(191) NULL,
    `publisher` VARCHAR(191) NULL,
    `isbn` VARCHAR(191) NULL,
    `edition` VARCHAR(191) NULL,
    `series` VARCHAR(191) NULL,
    `seriesNumber` INTEGER NULL,
    `pageCount` INTEGER NULL,
    `publicationDate` DATETIME(3) NULL,
    `copyrightOwner` VARCHAR(191) NULL,
    `copyrightYear` INTEGER NULL,
    `rightsNotes` VARCHAR(191) NULL,
    `epubAssetId` VARCHAR(191) NULL,
    `pdfAssetId` VARCHAR(191) NULL,
    `sampleAssetId` VARCHAR(191) NULL,
    `frontCoverAssetId` VARCHAR(191) NULL,
    `backCoverAssetId` VARCHAR(191) NULL,
    `spineAssetId` VARCHAR(191) NULL,
    `fullWrapAssetId` VARCHAR(191) NULL,
    `thumbnailAssetId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Ebook_epubAssetId_key`(`epubAssetId`),
    UNIQUE INDEX `Ebook_pdfAssetId_key`(`pdfAssetId`),
    UNIQUE INDEX `Ebook_sampleAssetId_key`(`sampleAssetId`),
    UNIQUE INDEX `Ebook_frontCoverAssetId_key`(`frontCoverAssetId`),
    UNIQUE INDEX `Ebook_backCoverAssetId_key`(`backCoverAssetId`),
    UNIQUE INDEX `Ebook_spineAssetId_key`(`spineAssetId`),
    UNIQUE INDEX `Ebook_fullWrapAssetId_key`(`fullWrapAssetId`),
    UNIQUE INDEX `Ebook_thumbnailAssetId_key`(`thumbnailAssetId`),
    PRIMARY KEY (`contentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EbookEdition` (
    `id` VARCHAR(191) NOT NULL,
    `ebookId` VARCHAR(191) NOT NULL,
    `languageId` VARCHAR(191) NOT NULL,
    `translatedTitle` VARCHAR(191) NOT NULL,
    `translator` VARCHAR(191) NULL,
    `epubAssetId` VARCHAR(191) NULL,
    `pdfAssetId` VARCHAR(191) NULL,
    `coverAssetId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EbookEdition_epubAssetId_key`(`epubAssetId`),
    UNIQUE INDEX `EbookEdition_pdfAssetId_key`(`pdfAssetId`),
    UNIQUE INDEX `EbookEdition_coverAssetId_key`(`coverAssetId`),
    INDEX `EbookEdition_ebookId_idx`(`ebookId`),
    UNIQUE INDEX `EbookEdition_ebookId_languageId_key`(`ebookId`, `languageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Audiobook` (
    `contentId` VARCHAR(191) NOT NULL,
    `author` VARCHAR(191) NULL,
    `narrator` VARCHAR(191) NULL,
    `publisher` VARCHAR(191) NULL,
    `isbn` VARCHAR(191) NULL,
    `series` VARCHAR(191) NULL,
    `seriesNumber` INTEGER NULL,
    `releaseDate` DATETIME(3) NULL,
    `durationSeconds` INTEGER NULL,
    `deliveryMode` ENUM('SINGLE_FILE', 'CHAPTER_FILES') NOT NULL DEFAULT 'SINGLE_FILE',
    `copyrightOwner` VARCHAR(191) NULL,
    `copyrightYear` INTEGER NULL,
    `rightsNotes` VARCHAR(191) NULL,
    `mainAssetId` VARCHAR(191) NULL,
    `previewAssetId` VARCHAR(191) NULL,
    `coverAssetId` VARCHAR(191) NULL,
    `thumbnailAssetId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Audiobook_mainAssetId_key`(`mainAssetId`),
    UNIQUE INDEX `Audiobook_previewAssetId_key`(`previewAssetId`),
    UNIQUE INDEX `Audiobook_coverAssetId_key`(`coverAssetId`),
    UNIQUE INDEX `Audiobook_thumbnailAssetId_key`(`thumbnailAssetId`),
    PRIMARY KEY (`contentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AudiobookEdition` (
    `id` VARCHAR(191) NOT NULL,
    `audiobookId` VARCHAR(191) NOT NULL,
    `languageId` VARCHAR(191) NOT NULL,
    `narrator` VARCHAR(191) NOT NULL,
    `narratorBio` VARCHAR(191) NULL,
    `narratorImageAssetId` VARCHAR(191) NULL,
    `audioAssetId` VARCHAR(191) NULL,
    `durationSeconds` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AudiobookEdition_narratorImageAssetId_key`(`narratorImageAssetId`),
    UNIQUE INDEX `AudiobookEdition_audioAssetId_key`(`audioAssetId`),
    INDEX `AudiobookEdition_audiobookId_idx`(`audiobookId`),
    UNIQUE INDEX `AudiobookEdition_audiobookId_languageId_key`(`audiobookId`, `languageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AudiobookChapter` (
    `id` VARCHAR(191) NOT NULL,
    `audiobookId` VARCHAR(191) NOT NULL,
    `chapterNumber` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `audioAssetId` VARCHAR(191) NULL,
    `durationSeconds` INTEGER NULL,
    `startTimeSeconds` INTEGER NULL,
    `endTimeSeconds` INTEGER NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AudiobookChapter_audioAssetId_key`(`audioAssetId`),
    INDEX `AudiobookChapter_audiobookId_idx`(`audiobookId`),
    UNIQUE INDEX `AudiobookChapter_audiobookId_chapterNumber_key`(`audiobookId`, `chapterNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Language` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Language_code_key`(`code`),
    INDEX `Language_code_idx`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentLanguage` (
    `id` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `languageId` VARCHAR(191) NOT NULL,
    `role` ENUM('PRIMARY', 'ORIGINAL', 'ADDITIONAL_AUDIO', 'TRANSLATION') NOT NULL,

    INDEX `ContentLanguage_contentId_idx`(`contentId`),
    INDEX `ContentLanguage_languageId_idx`(`languageId`),
    UNIQUE INDEX `ContentLanguage_contentId_languageId_role_key`(`contentId`, `languageId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Genre` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `contentType` ENUM('MOVIE', 'EBOOK', 'AUDIOBOOK') NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Genre_slug_key`(`slug`),
    INDEX `Genre_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentGenre` (
    `contentId` VARCHAR(191) NOT NULL,
    `genreId` VARCHAR(191) NOT NULL,

    INDEX `ContentGenre_genreId_idx`(`genreId`),
    PRIMARY KEY (`contentId`, `genreId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tag_slug_key`(`slug`),
    INDEX `Tag_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentTag` (
    `contentId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,

    INDEX `ContentTag_tagId_idx`(`tagId`),
    PRIMARY KEY (`contentId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentWarningType` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ContentWarningType_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentWarning` (
    `contentId` VARCHAR(191) NOT NULL,
    `warningTypeId` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191) NULL,

    INDEX `ContentWarning_warningTypeId_idx`(`warningTypeId`),
    PRIMARY KEY (`contentId`, `warningTypeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentTerritory` (
    `contentId` VARCHAR(191) NOT NULL,
    `countryCode` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`contentId`, `countryCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NULL,
    `type` ENUM('MOVIE_MASTER', 'POSTER', 'BACKDROP', 'THUMBNAIL', 'NORMAL_BANNER', 'HERO_BANNER', 'LATEST_RELEASE_BANNER', 'MOBILE_BANNER', 'TRAILER', 'TEASER', 'CAPTION', 'AUDIO_TRACK', 'EBOOK_EPUB', 'EBOOK_PDF', 'EBOOK_SAMPLE', 'EBOOK_FRONT_COVER', 'EBOOK_BACK_COVER', 'EBOOK_SPINE', 'EBOOK_FULL_WRAP', 'AUDIOBOOK_FILE', 'AUDIOBOOK_PREVIEW', 'AUDIOBOOK_COVER', 'AUDIOBOOK_CHAPTER', 'NARRATOR_IMAGE') NOT NULL,
    `storageKey` VARCHAR(191) NULL,
    `originalFileName` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationSeconds` INTEGER NULL,
    `checksum` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'MISSING', 'DELETED') NOT NULL DEFAULT 'PENDING',
    `processingError` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `sourceAssetId` VARCHAR(191) NULL,
    `variant` VARCHAR(191) NULL,
    `bitrate` INTEGER NULL,
    `resolution` VARCHAR(191) NULL,
    `codec` VARCHAR(191) NULL,
    `languageId` VARCHAR(191) NULL,
    `hlsManifestKey` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `expiresAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `checkedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MediaAsset_storageKey_key`(`storageKey`),
    INDEX `MediaAsset_contentId_idx`(`contentId`),
    INDEX `MediaAsset_type_idx`(`type`),
    INDEX `MediaAsset_status_idx`(`status`),
    INDEX `MediaAsset_sourceAssetId_idx`(`sourceAssetId`),
    INDEX `MediaAsset_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MultipartUpload` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `providerUploadId` VARCHAR(191) NOT NULL,
    `parts` JSON NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MultipartUpload_assetId_key`(`assetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LegalDocument` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('PRIVACY_POLICY', 'TERMS_AND_CONDITIONS', 'REFUND_POLICY') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `currentPublishedVersionId` VARCHAR(191) NULL,
    `currentDraftVersionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LegalDocument_type_key`(`type`),
    UNIQUE INDEX `LegalDocument_slug_key`(`slug`),
    UNIQUE INDEX `LegalDocument_currentPublishedVersionId_key`(`currentPublishedVersionId`),
    UNIQUE INDEX `LegalDocument_currentDraftVersionId_key`(`currentDraftVersionId`),
    INDEX `LegalDocument_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LegalDocumentVersion` (
    `id` VARCHAR(191) NOT NULL,
    `legalDocumentId` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `seoTitle` VARCHAR(191) NULL,
    `seoDescription` TEXT NULL,
    `effectiveAt` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,

    INDEX `LegalDocumentVersion_legalDocumentId_idx`(`legalDocumentId`),
    INDEX `LegalDocumentVersion_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `type` ENUM('BOOLEAN', 'STRING', 'NUMBER', 'JSON') NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HomepageSection` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `displayTitle` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `itemLimit` INTEGER NOT NULL DEFAULT 12,
    `type` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HomepageSection_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HomepageSectionItem` (
    `id` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `HomepageSectionItem_contentId_idx`(`contentId`),
    UNIQUE INDEX `HomepageSectionItem_sectionId_contentId_key`(`sectionId`, `contentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Collection` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `bannerAssetId` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Collection_slug_key`(`slug`),
    UNIQUE INDEX `Collection_bannerAssetId_key`(`bannerAssetId`),
    INDEX `Collection_slug_idx`(`slug`),
    INDEX `Collection_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectionItem` (
    `id` VARCHAR(191) NOT NULL,
    `collectionId` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `CollectionItem_contentId_idx`(`contentId`),
    UNIQUE INDEX `CollectionItem_collectionId_contentId_key`(`collectionId`, `contentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Banner` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('HERO', 'NORMAL', 'LATEST_RELEASE', 'PROMOTIONAL') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `desktopAssetId` VARCHAR(191) NULL,
    `mobileAssetId` VARCHAR(191) NULL,
    `linkedContentId` VARCHAR(191) NULL,
    `buttonText` VARCHAR(191) NULL,
    `priority` INTEGER NOT NULL DEFAULT 1,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Banner_desktopAssetId_key`(`desktopAssetId`),
    UNIQUE INDEX `Banner_mobileAssetId_key`(`mobileAssetId`),
    INDEX `Banner_linkedContentId_idx`(`linkedContentId`),
    INDEX `Banner_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `requestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSavedContent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserSavedContent_contentId_idx`(`contentId`),
    UNIQUE INDEX `UserSavedContent_userId_contentId_key`(`userId`, `contentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LibraryItem` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(191) NULL,

    INDEX `LibraryItem_contentId_idx`(`contentId`),
    UNIQUE INDEX `LibraryItem_userId_contentId_key`(`userId`, `contentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MovieProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `movieId` VARCHAR(191) NOT NULL,
    `positionSeconds` INTEGER NOT NULL DEFAULT 0,
    `durationSeconds` INTEGER NULL,
    `percentage` DOUBLE NOT NULL DEFAULT 0,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MovieProgress_movieId_idx`(`movieId`),
    UNIQUE INDEX `MovieProgress_userId_movieId_key`(`userId`, `movieId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EbookProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `ebookId` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NULL,
    `page` INTEGER NULL,
    `percentage` DOUBLE NOT NULL DEFAULT 0,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EbookProgress_ebookId_idx`(`ebookId`),
    UNIQUE INDEX `EbookProgress_userId_ebookId_key`(`userId`, `ebookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AudiobookProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `audiobookId` VARCHAR(191) NOT NULL,
    `chapterId` VARCHAR(191) NULL,
    `positionSeconds` INTEGER NOT NULL DEFAULT 0,
    `percentage` DOUBLE NOT NULL DEFAULT 0,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AudiobookProgress_audiobookId_idx`(`audiobookId`),
    UNIQUE INDEX `AudiobookProgress_userId_audiobookId_key`(`userId`, `audiobookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserHistory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `activityType` ENUM('WATCHED', 'READ', 'LISTENED') NOT NULL,
    `lastAccessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removedAt` DATETIME(3) NULL,

    INDEX `UserHistory_contentId_idx`(`contentId`),
    INDEX `UserHistory_userId_lastAccessedAt_idx`(`userId`, `lastAccessedAt`),
    UNIQUE INDEX `UserHistory_userId_contentId_key`(`userId`, `contentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EbookBookmark` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `ebookId` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `page` INTEGER NULL,
    `label` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EbookBookmark_userId_ebookId_idx`(`userId`, `ebookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('NEW_RELEASE', 'SUBSCRIPTION', 'RECOMMENDATION', 'ACCOUNT', 'SYSTEM') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `readAt` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    INDEX `Notification_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Plan` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `stripeProductId` VARCHAR(191) NULL,
    `stripePriceId` VARCHAR(191) NOT NULL,
    `priceAmount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `billingInterval` ENUM('MONTHLY', 'YEARLY') NOT NULL,
    `trialDays` INTEGER NULL,
    `maxDevices` INTEGER NULL,
    `maxConcurrentStreams` INTEGER NULL,
    `maxVideoQuality` VARCHAR(191) NULL,
    `ebooksEnabled` BOOLEAN NOT NULL DEFAULT false,
    `audiobooksEnabled` BOOLEAN NOT NULL DEFAULT false,
    `moviesEnabled` BOOLEAN NOT NULL DEFAULT true,
    `features` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Plan_slug_key`(`slug`),
    UNIQUE INDEX `Plan_stripePriceId_key`(`stripePriceId`),
    INDEX `Plan_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `stripeCustomerId` VARCHAR(191) NOT NULL,
    `stripeSubscriptionId` VARCHAR(191) NOT NULL,
    `stripePriceId` VARCHAR(191) NOT NULL,
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED') NOT NULL,
    `currentPeriodStart` DATETIME(3) NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `canceledAt` DATETIME(3) NULL,
    `trialEnd` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Subscription_userId_key`(`userId`),
    UNIQUE INDEX `Subscription_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    INDEX `Subscription_status_idx`(`status`),
    INDEX `Subscription_stripeCustomerId_idx`(`stripeCustomerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NULL,
    `stripePaymentIntentId` VARCHAR(191) NULL,
    `stripeInvoiceId` VARCHAR(191) NULL,
    `stripeChargeId` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED') NOT NULL,
    `description` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payment_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    UNIQUE INDEX `Payment_stripeInvoiceId_key`(`stripeInvoiceId`),
    UNIQUE INDEX `Payment_stripeChargeId_key`(`stripeChargeId`),
    INDEX `Payment_userId_idx`(`userId`),
    INDEX `Payment_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Refund` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `stripeRefundId` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED') NOT NULL,
    `createdByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Refund_stripeRefundId_key`(`stripeRefundId`),
    INDEX `Refund_paymentId_idx`(`paymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserAgeVerification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `verifiedAge` INTEGER NULL,
    `method` VARCHAR(191) NOT NULL DEFAULT 'SELF_DECLARED',
    `verifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,

    UNIQUE INDEX `UserAgeVerification_userId_key`(`userId`),
    INDEX `UserAgeVerification_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Device` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceIdentifier` VARCHAR(191) NOT NULL,
    `deviceName` VARCHAR(191) NULL,
    `deviceType` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Device_userId_idx`(`userId`),
    INDEX `Device_status_idx`(`status`),
    UNIQUE INDEX `Device_userId_deviceIdentifier_key`(`userId`, `deviceIdentifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlaybackSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `contentType` ENUM('MOVIE', 'EBOOK', 'AUDIOBOOK') NOT NULL,
    `status` ENUM('ACTIVE', 'ENDED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastHeartbeatAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,

    INDEX `PlaybackSession_userId_status_idx`(`userId`, `status`),
    INDEX `PlaybackSession_contentId_idx`(`contentId`),
    INDEX `PlaybackSession_lastHeartbeatAt_idx`(`lastHeartbeatAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `contentId` VARCHAR(191) NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AnalyticsEvent_eventType_idx`(`eventType`),
    INDEX `AnalyticsEvent_contentId_idx`(`contentId`),
    INDEX `AnalyticsEvent_userId_idx`(`userId`),
    INDEX `AnalyticsEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StripeEvent` (
    `id` VARCHAR(191) NOT NULL,
    `stripeEventId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL,
    `error` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StripeEvent_stripeEventId_key`(`stripeEventId`),
    INDEX `StripeEvent_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AuthSession` ADD CONSTRAINT `AuthSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Content` ADD CONSTRAINT `Content_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movie` ADD CONSTRAINT `Movie_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movie` ADD CONSTRAINT `Movie_posterAssetId_fkey` FOREIGN KEY (`posterAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movie` ADD CONSTRAINT `Movie_backdropAssetId_fkey` FOREIGN KEY (`backdropAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movie` ADD CONSTRAINT `Movie_thumbnailAssetId_fkey` FOREIGN KEY (`thumbnailAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movie` ADD CONSTRAINT `Movie_masterAssetId_fkey` FOREIGN KEY (`masterAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movie` ADD CONSTRAINT `Movie_trailerAssetId_fkey` FOREIGN KEY (`trailerAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movie` ADD CONSTRAINT `Movie_teaserAssetId_fkey` FOREIGN KEY (`teaserAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieCaption` ADD CONSTRAINT `MovieCaption_movieId_fkey` FOREIGN KEY (`movieId`) REFERENCES `Movie`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieCaption` ADD CONSTRAINT `MovieCaption_languageId_fkey` FOREIGN KEY (`languageId`) REFERENCES `Language`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieCaption` ADD CONSTRAINT `MovieCaption_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieAudioTrack` ADD CONSTRAINT `MovieAudioTrack_movieId_fkey` FOREIGN KEY (`movieId`) REFERENCES `Movie`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieAudioTrack` ADD CONSTRAINT `MovieAudioTrack_languageId_fkey` FOREIGN KEY (`languageId`) REFERENCES `Language`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieAudioTrack` ADD CONSTRAINT `MovieAudioTrack_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieCast` ADD CONSTRAINT `MovieCast_movieId_fkey` FOREIGN KEY (`movieId`) REFERENCES `Movie`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieCast` ADD CONSTRAINT `MovieCast_imageAssetId_fkey` FOREIGN KEY (`imageAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieCrew` ADD CONSTRAINT `MovieCrew_movieId_fkey` FOREIGN KEY (`movieId`) REFERENCES `Movie`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_epubAssetId_fkey` FOREIGN KEY (`epubAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_pdfAssetId_fkey` FOREIGN KEY (`pdfAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_sampleAssetId_fkey` FOREIGN KEY (`sampleAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_frontCoverAssetId_fkey` FOREIGN KEY (`frontCoverAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_backCoverAssetId_fkey` FOREIGN KEY (`backCoverAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_spineAssetId_fkey` FOREIGN KEY (`spineAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_fullWrapAssetId_fkey` FOREIGN KEY (`fullWrapAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_thumbnailAssetId_fkey` FOREIGN KEY (`thumbnailAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookEdition` ADD CONSTRAINT `EbookEdition_ebookId_fkey` FOREIGN KEY (`ebookId`) REFERENCES `Ebook`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookEdition` ADD CONSTRAINT `EbookEdition_languageId_fkey` FOREIGN KEY (`languageId`) REFERENCES `Language`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookEdition` ADD CONSTRAINT `EbookEdition_epubAssetId_fkey` FOREIGN KEY (`epubAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookEdition` ADD CONSTRAINT `EbookEdition_pdfAssetId_fkey` FOREIGN KEY (`pdfAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookEdition` ADD CONSTRAINT `EbookEdition_coverAssetId_fkey` FOREIGN KEY (`coverAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Audiobook` ADD CONSTRAINT `Audiobook_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Audiobook` ADD CONSTRAINT `Audiobook_mainAssetId_fkey` FOREIGN KEY (`mainAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Audiobook` ADD CONSTRAINT `Audiobook_previewAssetId_fkey` FOREIGN KEY (`previewAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Audiobook` ADD CONSTRAINT `Audiobook_coverAssetId_fkey` FOREIGN KEY (`coverAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Audiobook` ADD CONSTRAINT `Audiobook_thumbnailAssetId_fkey` FOREIGN KEY (`thumbnailAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookEdition` ADD CONSTRAINT `AudiobookEdition_audiobookId_fkey` FOREIGN KEY (`audiobookId`) REFERENCES `Audiobook`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookEdition` ADD CONSTRAINT `AudiobookEdition_languageId_fkey` FOREIGN KEY (`languageId`) REFERENCES `Language`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookEdition` ADD CONSTRAINT `AudiobookEdition_narratorImageAssetId_fkey` FOREIGN KEY (`narratorImageAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookEdition` ADD CONSTRAINT `AudiobookEdition_audioAssetId_fkey` FOREIGN KEY (`audioAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookChapter` ADD CONSTRAINT `AudiobookChapter_audiobookId_fkey` FOREIGN KEY (`audiobookId`) REFERENCES `Audiobook`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookChapter` ADD CONSTRAINT `AudiobookChapter_audioAssetId_fkey` FOREIGN KEY (`audioAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentLanguage` ADD CONSTRAINT `ContentLanguage_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentLanguage` ADD CONSTRAINT `ContentLanguage_languageId_fkey` FOREIGN KEY (`languageId`) REFERENCES `Language`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentGenre` ADD CONSTRAINT `ContentGenre_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentGenre` ADD CONSTRAINT `ContentGenre_genreId_fkey` FOREIGN KEY (`genreId`) REFERENCES `Genre`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentTag` ADD CONSTRAINT `ContentTag_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentTag` ADD CONSTRAINT `ContentTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentWarning` ADD CONSTRAINT `ContentWarning_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentWarning` ADD CONSTRAINT `ContentWarning_warningTypeId_fkey` FOREIGN KEY (`warningTypeId`) REFERENCES `ContentWarningType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentTerritory` ADD CONSTRAINT `ContentTerritory_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_sourceAssetId_fkey` FOREIGN KEY (`sourceAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_languageId_fkey` FOREIGN KEY (`languageId`) REFERENCES `Language`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MultipartUpload` ADD CONSTRAINT `MultipartUpload_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegalDocument` ADD CONSTRAINT `LegalDocument_currentPublishedVersionId_fkey` FOREIGN KEY (`currentPublishedVersionId`) REFERENCES `LegalDocumentVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegalDocument` ADD CONSTRAINT `LegalDocument_currentDraftVersionId_fkey` FOREIGN KEY (`currentDraftVersionId`) REFERENCES `LegalDocumentVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegalDocumentVersion` ADD CONSTRAINT `LegalDocumentVersion_legalDocumentId_fkey` FOREIGN KEY (`legalDocumentId`) REFERENCES `LegalDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegalDocumentVersion` ADD CONSTRAINT `LegalDocumentVersion_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AppSetting` ADD CONSTRAINT `AppSetting_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HomepageSectionItem` ADD CONSTRAINT `HomepageSectionItem_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `HomepageSection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HomepageSectionItem` ADD CONSTRAINT `HomepageSectionItem_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_bannerAssetId_fkey` FOREIGN KEY (`bannerAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionItem` ADD CONSTRAINT `CollectionItem_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `Collection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionItem` ADD CONSTRAINT `CollectionItem_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Banner` ADD CONSTRAINT `Banner_desktopAssetId_fkey` FOREIGN KEY (`desktopAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Banner` ADD CONSTRAINT `Banner_mobileAssetId_fkey` FOREIGN KEY (`mobileAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Banner` ADD CONSTRAINT `Banner_linkedContentId_fkey` FOREIGN KEY (`linkedContentId`) REFERENCES `Content`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSavedContent` ADD CONSTRAINT `UserSavedContent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSavedContent` ADD CONSTRAINT `UserSavedContent_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LibraryItem` ADD CONSTRAINT `LibraryItem_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LibraryItem` ADD CONSTRAINT `LibraryItem_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieProgress` ADD CONSTRAINT `MovieProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieProgress` ADD CONSTRAINT `MovieProgress_movieId_fkey` FOREIGN KEY (`movieId`) REFERENCES `Movie`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookProgress` ADD CONSTRAINT `EbookProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookProgress` ADD CONSTRAINT `EbookProgress_ebookId_fkey` FOREIGN KEY (`ebookId`) REFERENCES `Ebook`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookProgress` ADD CONSTRAINT `AudiobookProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookProgress` ADD CONSTRAINT `AudiobookProgress_audiobookId_fkey` FOREIGN KEY (`audiobookId`) REFERENCES `Audiobook`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudiobookProgress` ADD CONSTRAINT `AudiobookProgress_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `AudiobookChapter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserHistory` ADD CONSTRAINT `UserHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserHistory` ADD CONSTRAINT `UserHistory_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookBookmark` ADD CONSTRAINT `EbookBookmark_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EbookBookmark` ADD CONSTRAINT `EbookBookmark_ebookId_fkey` FOREIGN KEY (`ebookId`) REFERENCES `Ebook`(`contentId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAgeVerification` ADD CONSTRAINT `UserAgeVerification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Device` ADD CONSTRAINT `Device_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaybackSession` ADD CONSTRAINT `PlaybackSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaybackSession` ADD CONSTRAINT `PlaybackSession_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
