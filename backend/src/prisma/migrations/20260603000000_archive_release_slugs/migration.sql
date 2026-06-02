-- When a route is archived (soft-deleted) the publicPath was already mangled
-- with __deleted_<id> so it doesn't block a new route from claiming the same
-- path. The slug column was left untouched until now — meaning an archived
-- route's slug still blocked the human-friendly identifier. Free the slugs of
-- already-archived rows so users can reuse them.
UPDATE "routes"
SET "slug" = "slug" || '__deleted_' || id
WHERE "deletedAt" IS NOT NULL
  AND "slug" IS NOT NULL
  AND POSITION('__deleted_' IN "slug") = 0;
