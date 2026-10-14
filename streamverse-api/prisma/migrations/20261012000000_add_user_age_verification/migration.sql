-- Phase 8: UserAgeVerification model
-- Replaces the Phase 5 `User.ageVerifiedAt` placeholder with a proper per-user record that stores
-- date-of-birth (for server-side age computation) and an explicit verification method.

CREATE TABLE "UserAgeVerification" (
  "id"          TEXT         NOT NULL,
  "userId"      TEXT         NOT NULL,
  "dateOfBirth" TIMESTAMP(3),
  "verifiedAge" INTEGER,
  "method"      TEXT         NOT NULL DEFAULT 'SELF_DECLARED',
  "verifiedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3),

  CONSTRAINT "UserAgeVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAgeVerification_userId_key" ON "UserAgeVerification"("userId");
CREATE INDEX "UserAgeVerification_userId_idx" ON "UserAgeVerification"("userId");

ALTER TABLE "UserAgeVerification"
  ADD CONSTRAINT "UserAgeVerification_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
