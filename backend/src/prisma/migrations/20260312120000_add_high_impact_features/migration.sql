-- CreateEnum
CREATE TYPE "LBStrategy" AS ENUM ('ROUND_ROBIN', 'WEIGHTED', 'FAILOVER');

-- CreateEnum
CREATE TYPE "TransformPhase" AS ENUM ('REQUEST', 'RESPONSE');

-- CreateEnum
CREATE TYPE "TransformType" AS ENUM ('SET_HEADER', 'REMOVE_HEADER', 'REWRITE_BODY_JSON', 'SET_QUERY_PARAM', 'REMOVE_QUERY_PARAM', 'MAP_STATUS_CODE');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pathPrefix" TEXT NOT NULL,
    "defaultTimeout" INTEGER,
    "defaultRetryCount" INTEGER,
    "defaultRateLimitEnabled" BOOLEAN,
    "defaultRateLimitMax" INTEGER,
    "defaultRateLimitWindow" INTEGER,
    "defaultAuthType" "AuthType",
    "defaultAuthValue" TEXT,
    "defaultAddHeaders" JSONB,
    "defaultRemoveHeaders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultCorsEnabled" BOOLEAN,
    "defaultCorsOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultIpAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT,
    CONSTRAINT "route_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_targets" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isHealthy" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "route_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transform_rules" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "phase" "TransformPhase" NOT NULL,
    "type" "TransformType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "condition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "transform_rules_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add new fields to routes
ALTER TABLE "routes" ADD COLUMN "wsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "routes" ADD COLUMN "circuitBreakerEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "routes" ADD COLUMN "cbFailureThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "routes" ADD COLUMN "cbRecoveryTimeout" INTEGER NOT NULL DEFAULT 30000;
ALTER TABLE "routes" ADD COLUMN "cbState" TEXT NOT NULL DEFAULT 'CLOSED';
ALTER TABLE "routes" ADD COLUMN "cbFailureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "routes" ADD COLUMN "cbLastFailureAt" TIMESTAMP(3);
ALTER TABLE "routes" ADD COLUMN "cbOpenedAt" TIMESTAMP(3);
ALTER TABLE "routes" ADD COLUMN "lbStrategy" "LBStrategy" NOT NULL DEFAULT 'ROUND_ROBIN';
ALTER TABLE "routes" ADD COLUMN "routeGroupId" TEXT;
ALTER TABLE "routes" ADD COLUMN "organizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "org_memberships_userId_organizationId_key" ON "org_memberships"("userId", "organizationId");
CREATE INDEX "org_memberships_organizationId_idx" ON "org_memberships"("organizationId");
CREATE UNIQUE INDEX "teams_organizationId_name_key" ON "teams"("organizationId", "name");
CREATE UNIQUE INDEX "team_memberships_userId_teamId_key" ON "team_memberships"("userId", "teamId");
CREATE UNIQUE INDEX "route_groups_pathPrefix_key" ON "route_groups"("pathPrefix");
CREATE INDEX "route_targets_routeId_idx" ON "route_targets"("routeId");
CREATE INDEX "transform_rules_routeId_phase_order_idx" ON "transform_rules"("routeId", "phase", "order");

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "route_groups" ADD CONSTRAINT "route_groups_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "route_targets" ADD CONSTRAINT "route_targets_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transform_rules" ADD CONSTRAINT "transform_rules_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routes" ADD CONSTRAINT "routes_routeGroupId_fkey" FOREIGN KEY ("routeGroupId") REFERENCES "route_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "routes" ADD CONSTRAINT "routes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
