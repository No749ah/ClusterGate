-- Target type per route (for tool-specific handling, e.g. n8n)
CREATE TYPE "TargetType" AS ENUM ('GENERIC', 'N8N');
ALTER TABLE "routes" ADD COLUMN "targetType" "TargetType" NOT NULL DEFAULT 'GENERIC';

-- Extended API key usage tracking
ALTER TABLE "api_keys" ADD COLUMN "lastUsedIp" TEXT;
ALTER TABLE "api_keys" ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;
