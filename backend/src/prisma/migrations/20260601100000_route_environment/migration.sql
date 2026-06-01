-- Environment label (prod/staging/dev) per route
CREATE TYPE "Environment" AS ENUM ('NONE', 'PRODUCTION', 'STAGING', 'DEVELOPMENT');

ALTER TABLE "routes" ADD COLUMN "environment" "Environment" NOT NULL DEFAULT 'NONE';
