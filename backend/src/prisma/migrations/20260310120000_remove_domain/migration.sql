-- Remove domain column from routes table
-- Routes are now matched by path only

-- Drop old unique constraint and index on (domain, publicPath)
DROP INDEX IF EXISTS "routes_domain_publicPath_key";
ALTER TABLE "routes" DROP CONSTRAINT IF EXISTS "routes_domain_publicPath_key";

-- Drop domain index
DROP INDEX IF EXISTS "routes_domain_idx";

-- Drop domain column
ALTER TABLE "routes" DROP COLUMN IF EXISTS "domain";

-- Add new unique constraint on publicPath only
ALTER TABLE "routes" ADD CONSTRAINT "routes_publicPath_key" UNIQUE ("publicPath");
