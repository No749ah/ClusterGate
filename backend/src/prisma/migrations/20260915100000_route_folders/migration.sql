-- Route folders: organizational grouping of routes; API keys can be bound to a folder
CREATE TABLE "route_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_folders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "route_folders_organizationId_idx" ON "route_folders"("organizationId");

ALTER TABLE "route_folders" ADD CONSTRAINT "route_folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routes" ADD COLUMN "folderId" TEXT;

CREATE INDEX "routes_folderId_idx" ON "routes"("folderId");

ALTER TABLE "routes" ADD CONSTRAINT "routes_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "route_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "api_key_folders" (
    "apiKeyId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,

    CONSTRAINT "api_key_folders_pkey" PRIMARY KEY ("apiKeyId","folderId")
);

CREATE INDEX "api_key_folders_folderId_idx" ON "api_key_folders"("folderId");

ALTER TABLE "api_key_folders" ADD CONSTRAINT "api_key_folders_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_key_folders" ADD CONSTRAINT "api_key_folders_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "route_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
