-- Per-organization route target allowlist (off by default: existing orgs keep
-- their current behaviour until a system admin enables it)
ALTER TABLE "organizations" ADD COLUMN "restrictTargets" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "allowedTargetNamespaces" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "organizations" ADD COLUMN "allowedTargetHosts" TEXT[] DEFAULT ARRAY[]::TEXT[];
