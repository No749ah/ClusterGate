-- Opt-in CSP sandbox for proxied pages (same-origin isolation)
ALTER TABLE "routes" ADD COLUMN "sandbox" BOOLEAN NOT NULL DEFAULT false;
