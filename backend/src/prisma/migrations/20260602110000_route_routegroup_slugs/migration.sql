-- URL-safe slug for Route and RouteGroup so detail pages read /routes/docs-proxy
-- instead of /routes/cm…cuid. Nullable + unique; backfilled from name with
-- a suffix on collisions.
ALTER TABLE "routes" ADD COLUMN "slug" TEXT;
ALTER TABLE "route_groups" ADD COLUMN "slug" TEXT;

-- Helper that turns a free-text name into a URL slug:
--   lowercase, ASCII letters/digits/hyphen only, no double hyphens, trimmed.
CREATE OR REPLACE FUNCTION pg_temp.slugify(input TEXT) RETURNS TEXT AS $$
  SELECT trim(both '-' from regexp_replace(
    regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
$$ LANGUAGE SQL IMMUTABLE;

-- Backfill routes with a deterministic slug; on collisions append the cuid
-- suffix so the constraint holds without dropping rows.
WITH base AS (
  SELECT id, NULLIF(pg_temp.slugify(name), '') AS s FROM "routes"
)
UPDATE "routes" r
SET "slug" = CASE
  WHEN base.s IS NULL THEN NULL
  WHEN EXISTS (
    SELECT 1 FROM "routes" o
    WHERE o.id < r.id AND NULLIF(pg_temp.slugify(o.name), '') = base.s
  ) THEN base.s || '-' || substr(r.id, length(r.id) - 5)
  ELSE base.s
END
FROM base WHERE base.id = r.id;

WITH base AS (
  SELECT id, NULLIF(pg_temp.slugify(name), '') AS s FROM "route_groups"
)
UPDATE "route_groups" g
SET "slug" = CASE
  WHEN base.s IS NULL THEN NULL
  WHEN EXISTS (
    SELECT 1 FROM "route_groups" o
    WHERE o.id < g.id AND NULLIF(pg_temp.slugify(o.name), '') = base.s
  ) THEN base.s || '-' || substr(g.id, length(g.id) - 5)
  ELSE base.s
END
FROM base WHERE base.id = g.id;

CREATE UNIQUE INDEX "routes_slug_key" ON "routes"("slug");
CREATE UNIQUE INDEX "route_groups_slug_key" ON "route_groups"("slug");
