-- Add per-route response streaming toggle
ALTER TABLE "routes" ADD COLUMN "streamResponse" BOOLEAN NOT NULL DEFAULT false;
