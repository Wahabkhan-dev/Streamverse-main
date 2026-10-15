-- CreateEnum
CREATE TYPE "HistoryActivityType" AS ENUM ('WATCHED', 'READ', 'LISTENED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_RELEASE', 'SUBSCRIPTION', 'RECOMMENDATION', 'ACCOUNT', 'SYSTEM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ageVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "hasActiveSubscriptionDev" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserSavedContent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSavedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovieProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbookProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ebookId" TEXT NOT NULL,
    "location" TEXT,
    "page" INTEGER,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbookProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudiobookProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audiobookId" TEXT NOT NULL,
    "chapterId" TEXT,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudiobookProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "activityType" "HistoryActivityType" NOT NULL,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "UserHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbookBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ebookId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "page" INTEGER,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbookBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSavedContent_contentId_idx" ON "UserSavedContent"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSavedContent_userId_contentId_key" ON "UserSavedContent"("userId", "contentId");

-- CreateIndex
CREATE INDEX "LibraryItem_contentId_idx" ON "LibraryItem"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryItem_userId_contentId_key" ON "LibraryItem"("userId", "contentId");

-- CreateIndex
CREATE INDEX "MovieProgress_movieId_idx" ON "MovieProgress"("movieId");

-- CreateIndex
CREATE UNIQUE INDEX "MovieProgress_userId_movieId_key" ON "MovieProgress"("userId", "movieId");

-- CreateIndex
CREATE INDEX "EbookProgress_ebookId_idx" ON "EbookProgress"("ebookId");

-- CreateIndex
CREATE UNIQUE INDEX "EbookProgress_userId_ebookId_key" ON "EbookProgress"("userId", "ebookId");

-- CreateIndex
CREATE INDEX "AudiobookProgress_audiobookId_idx" ON "AudiobookProgress"("audiobookId");

-- CreateIndex
CREATE UNIQUE INDEX "AudiobookProgress_userId_audiobookId_key" ON "AudiobookProgress"("userId", "audiobookId");

-- CreateIndex
CREATE INDEX "UserHistory_contentId_idx" ON "UserHistory"("contentId");

-- CreateIndex
CREATE INDEX "UserHistory_userId_lastAccessedAt_idx" ON "UserHistory"("userId", "lastAccessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserHistory_userId_contentId_key" ON "UserHistory"("userId", "contentId");

-- CreateIndex
CREATE INDEX "EbookBookmark_userId_ebookId_idx" ON "EbookBookmark"("userId", "ebookId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserSavedContent" ADD CONSTRAINT "UserSavedContent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedContent" ADD CONSTRAINT "UserSavedContent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieProgress" ADD CONSTRAINT "MovieProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieProgress" ADD CONSTRAINT "MovieProgress_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookProgress" ADD CONSTRAINT "EbookProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookProgress" ADD CONSTRAINT "EbookProgress_ebookId_fkey" FOREIGN KEY ("ebookId") REFERENCES "Ebook"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookProgress" ADD CONSTRAINT "AudiobookProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookProgress" ADD CONSTRAINT "AudiobookProgress_audiobookId_fkey" FOREIGN KEY ("audiobookId") REFERENCES "Audiobook"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiobookProgress" ADD CONSTRAINT "AudiobookProgress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "AudiobookChapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserHistory" ADD CONSTRAINT "UserHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserHistory" ADD CONSTRAINT "UserHistory_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookBookmark" ADD CONSTRAINT "EbookBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookBookmark" ADD CONSTRAINT "EbookBookmark_ebookId_fkey" FOREIGN KEY ("ebookId") REFERENCES "Ebook"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

