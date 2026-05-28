-- Upstream (ClusterGate -> target) auth fields, e.g. a key the target requires
ALTER TABLE "routes" ADD COLUMN "upstreamAuthType" "AuthType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "routes" ADD COLUMN "upstreamAuthValue" TEXT;
ALTER TABLE "routes" ADD COLUMN "upstreamAuthHeader" TEXT DEFAULT 'X-API-Key';
