-- Non-sensitive key preview (first/last chars) shown when expanding a key
ALTER TABLE "api_keys" ADD COLUMN "keyHint" TEXT;
