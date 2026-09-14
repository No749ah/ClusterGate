-- Additional routes an API key is valid for, beyond its owning route
CREATE TABLE "api_key_routes" (
    "apiKeyId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,

    CONSTRAINT "api_key_routes_pkey" PRIMARY KEY ("apiKeyId","routeId")
);

CREATE INDEX "api_key_routes_routeId_idx" ON "api_key_routes"("routeId");

ALTER TABLE "api_key_routes" ADD CONSTRAINT "api_key_routes_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_key_routes" ADD CONSTRAINT "api_key_routes_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
