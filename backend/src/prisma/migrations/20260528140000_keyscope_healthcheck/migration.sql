-- API key scope (read-only vs full)
CREATE TYPE "KeyScope" AS ENUM ('READ', 'FULL');
ALTER TABLE "api_keys" ADD COLUMN "scope" "KeyScope" NOT NULL DEFAULT 'FULL';

-- Per-route health check configuration
ALTER TABLE "routes" ADD COLUMN "healthCheckMethod" TEXT DEFAULT 'HEAD';
ALTER TABLE "routes" ADD COLUMN "healthCheckPath" TEXT;
ALTER TABLE "routes" ADD COLUMN "healthCheckBody" TEXT;
