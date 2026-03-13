-- CreateEnum IncidentStatus
CREATE TYPE "IncidentStatus" AS ENUM ('ACTIVE', 'INVESTIGATING', 'RESOLVED');

-- CreateEnum IncidentSeverity
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum ChangeRequestStatus
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- AlterTable organizations: add changeRequestsEnabled
ALTER TABLE "organizations" ADD COLUMN "changeRequestsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable incidents
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "routeId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable incident_events
CREATE TABLE "incident_events" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable change_requests
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "routeId" TEXT,
    "type" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB NOT NULL,
    "diff" JSONB,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable achievements
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "incidents_status_idx" ON "incidents"("status");
CREATE INDEX "incidents_routeId_idx" ON "incidents"("routeId");
CREATE INDEX "incidents_startedAt_idx" ON "incidents"("startedAt");
CREATE INDEX "incident_events_incidentId_createdAt_idx" ON "incident_events"("incidentId", "createdAt");
CREATE INDEX "change_requests_status_idx" ON "change_requests"("status");
CREATE INDEX "change_requests_routeId_idx" ON "change_requests"("routeId");
CREATE INDEX "change_requests_requestedById_idx" ON "change_requests"("requestedById");
CREATE INDEX "achievements_userId_idx" ON "achievements"("userId");

-- Unique constraints
CREATE UNIQUE INDEX "achievements_userId_key_key" ON "achievements"("userId", "key");

-- Foreign keys
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
