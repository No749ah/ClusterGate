-- User-defined path allowlist templates (built-ins live in code)
CREATE TABLE "path_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "path_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "path_templates_organizationId_idx" ON "path_templates"("organizationId");

ALTER TABLE "path_templates" ADD CONSTRAINT "path_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
