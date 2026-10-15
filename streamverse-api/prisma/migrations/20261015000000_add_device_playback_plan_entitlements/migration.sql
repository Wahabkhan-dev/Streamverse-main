-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PlaybackSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');

-- AlterTable: add entitlement columns to Plan (absent from 20260114100000_billing_stripe)
ALTER TABLE "Plan"
  ADD COLUMN IF NOT EXISTS "maxDevices"          INTEGER,
  ADD COLUMN IF NOT EXISTS "maxConcurrentStreams" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxVideoQuality"      TEXT,
  ADD COLUMN IF NOT EXISTS "ebooksEnabled"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "audiobooksEnabled"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "moviesEnabled"        BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Device" (
    "id"               TEXT        NOT NULL,
    "userId"           TEXT        NOT NULL,
    "deviceIdentifier" TEXT        NOT NULL,
    "deviceName"       TEXT,
    "deviceType"       TEXT,
    "platform"         TEXT,
    "status"           "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybackSession" (
    "id"              TEXT        NOT NULL,
    "userId"          TEXT        NOT NULL,
    "deviceId"        TEXT,
    "contentId"       TEXT        NOT NULL,
    "contentType"     "ContentType" NOT NULL,
    "status"          "PlaybackSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"         TIMESTAMP(3),

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_deviceIdentifier_key" ON "Device"("userId", "deviceIdentifier");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "PlaybackSession_userId_status_idx" ON "PlaybackSession"("userId", "status");

-- CreateIndex
CREATE INDEX "PlaybackSession_contentId_idx" ON "PlaybackSession"("contentId");

-- CreateIndex
CREATE INDEX "PlaybackSession_lastHeartbeatAt_idx" ON "PlaybackSession"("lastHeartbeatAt");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
