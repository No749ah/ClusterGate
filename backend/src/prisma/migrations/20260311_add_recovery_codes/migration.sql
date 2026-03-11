-- AlterTable
ALTER TABLE "users" ADD COLUMN "recoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
