-- Mark route test-panel runs and health-check probes in the request log so
-- they can be hidden from the traffic view
CREATE TYPE "RequestSource" AS ENUM ('TRAFFIC', 'TEST', 'HEALTH_CHECK');

ALTER TABLE "request_logs" ADD COLUMN "source" "RequestSource" NOT NULL DEFAULT 'TRAFFIC';

CREATE INDEX "request_logs_source_createdAt_idx" ON "request_logs"("source", "createdAt");

-- Backfill: test-panel runs were sent with a mock request whose host is
-- "localhost", which the proxy recorded as X-Forwarded-Host
UPDATE "request_logs" SET "source" = 'TEST'
WHERE "requestHeaders"->>'X-Forwarded-Host' = 'localhost';

-- Backfill: known uptime monitors / probes (same list as lib/requestSource.ts)
UPDATE "request_logs" SET "source" = 'HEALTH_CHECK'
WHERE "source" = 'TRAFFIC' AND "userAgent" ~* '(^kube-probe/|uptime-?kuma|uptimerobot|pingdom|statuscake|better ?(uptime|stack)|blackbox[ _-]?exporter|^ELB-HealthChecker/|^GoogleHC/|consul health check|site24x7|datadog.*synthetics|newrelicpinger|checkly|^gatus/|healthchecks?\.io|^ClusterGate-HealthCheck/)';
