-- New routes default to a 120s upstream timeout (LLM/agent upstreams routinely exceed 30s)
ALTER TABLE "routes" ALTER COLUMN "timeout" SET DEFAULT 120000;
