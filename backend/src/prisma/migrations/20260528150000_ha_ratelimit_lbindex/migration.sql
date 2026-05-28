-- Shared (HA) rate-limit counters across replicas
CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
  "key" TEXT PRIMARY KEY,
  "windowStart" BIGINT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "rate_limit_counters_windowStart_idx" ON "rate_limit_counters" ("windowStart");

-- Shared round-robin index so load balancing is consistent across replicas
ALTER TABLE "routes" ADD COLUMN "lbRrIndex" INTEGER NOT NULL DEFAULT 0;
