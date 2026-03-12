-- DropIndex (old indexes)
DROP INDEX IF EXISTS "request_logs_routeId_createdAt_idx";
DROP INDEX IF EXISTS "request_logs_responseStatus_idx";

-- CreateIndex (optimized compound indexes for analytics queries)
CREATE INDEX "request_logs_routeId_createdAt_duration_idx" ON "request_logs"("routeId", "createdAt", "duration");
CREATE INDEX "request_logs_createdAt_responseStatus_idx" ON "request_logs"("createdAt", "responseStatus");
CREATE INDEX "request_logs_routeId_createdAt_responseStatus_idx" ON "request_logs"("routeId", "createdAt", "responseStatus");

-- CreateIndex (route group and org indexes)
CREATE INDEX IF NOT EXISTS "routes_routeGroupId_idx" ON "routes"("routeGroupId");
CREATE INDEX IF NOT EXISTS "routes_organizationId_idx" ON "routes"("organizationId");
