-- Add 2FA single-use challenge nonce and brute-force lockout fields to users
ALTER TABLE "users" ADD COLUMN "twoFactorChallenge" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "twoFactorLockedUntil" TIMESTAMP(3);
