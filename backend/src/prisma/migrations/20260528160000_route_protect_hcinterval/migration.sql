-- Per-route health check interval (minutes) and deletion protection flag
ALTER TABLE "routes" ADD COLUMN "healthCheckInterval" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "routes" ADD COLUMN "protected" BOOLEAN NOT NULL DEFAULT false;
