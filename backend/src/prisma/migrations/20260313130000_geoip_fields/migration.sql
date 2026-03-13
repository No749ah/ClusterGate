-- AlterTable request_logs: add GeoIP columns
ALTER TABLE "request_logs" ADD COLUMN "geoCountry" TEXT;
ALTER TABLE "request_logs" ADD COLUMN "geoCity" TEXT;
ALTER TABLE "request_logs" ADD COLUMN "geoLatitude" DOUBLE PRECISION;
ALTER TABLE "request_logs" ADD COLUMN "geoLongitude" DOUBLE PRECISION;

-- Index for country-level analytics
CREATE INDEX "request_logs_geoCountry_createdAt_idx" ON "request_logs"("geoCountry", "createdAt");
