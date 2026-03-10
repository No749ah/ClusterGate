-- Add sslVerify field to routes table
ALTER TABLE "routes" ADD COLUMN "sslVerify" BOOLEAN NOT NULL DEFAULT true;
