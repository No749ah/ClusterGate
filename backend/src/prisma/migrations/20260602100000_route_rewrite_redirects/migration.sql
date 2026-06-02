-- Per-route toggle: rewrite upstream Location headers so 3xx redirects stay
-- under the public /r/<route>/... path instead of bouncing to the upstream host.
ALTER TABLE "routes" ADD COLUMN "rewriteRedirects" BOOLEAN NOT NULL DEFAULT true;
