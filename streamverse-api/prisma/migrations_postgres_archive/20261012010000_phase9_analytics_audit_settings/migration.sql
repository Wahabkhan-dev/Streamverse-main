-- Phase 9: Analytics Event (new), AuditLog (already exists), AppSetting (already exists).
-- AuditLog and AppSetting were created in earlier phases; only AnalyticsEvent is new here.

-- AnalyticsEvent: lightweight forward-compatibility event log
CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT,
    "contentId" TEXT,
    "eventType" TEXT         NOT NULL,
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnalyticsEvent_eventType_idx" ON "AnalyticsEvent"("eventType");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_contentId_idx" ON "AnalyticsEvent"("contentId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_userId_idx"    ON "AnalyticsEvent"("userId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");
