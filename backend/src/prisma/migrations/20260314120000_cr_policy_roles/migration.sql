-- Change Request Policy: configurable bypass and approver roles

-- Organization: who can bypass CR and who can approve
ALTER TABLE "organizations" ADD COLUMN "crBypassRoles" "OrgRole"[] NOT NULL DEFAULT ARRAY['OWNER']::"OrgRole"[];
ALTER TABLE "organizations" ADD COLUMN "crApproverRoles" "OrgRole"[] NOT NULL DEFAULT ARRAY['OWNER', 'ADMIN']::"OrgRole"[];

-- RouteGroup: per-group CR override (null = inherit from org)
ALTER TABLE "route_groups" ADD COLUMN "changeRequestsEnabled" BOOLEAN;
ALTER TABLE "route_groups" ADD COLUMN "crBypassRoles" "OrgRole"[] NOT NULL DEFAULT ARRAY[]::"OrgRole"[];
ALTER TABLE "route_groups" ADD COLUMN "crApproverRoles" "OrgRole"[] NOT NULL DEFAULT ARRAY[]::"OrgRole"[];
