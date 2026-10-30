-- Optional allowlist of sub-paths a (wildcard) route forwards; empty = all
ALTER TABLE "routes" ADD COLUMN "pathAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[];
