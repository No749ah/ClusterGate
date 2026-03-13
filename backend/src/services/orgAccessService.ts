import { OrgRole, Role } from '@prisma/client'
import { prisma } from '../lib/prisma'

/**
 * Get organization IDs the user is a member of.
 */
export async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId },
    select: { organizationId: true },
  })
  return memberships.map((m) => m.organizationId)
}

/**
 * Get user's org role for a specific organization.
 */
export async function getUserOrgRole(userId: string, organizationId: string): Promise<OrgRole | null> {
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  })
  return membership?.role ?? null
}

/**
 * Check if user can manage routes in an organization (create/edit/publish).
 * Requires org OWNER or ADMIN role, or system ADMIN.
 */
export async function canManageOrgRoutes(userId: string, systemRole: string, organizationId: string): Promise<boolean> {
  if (systemRole === 'ADMIN') return true

  const orgRole = await getUserOrgRole(userId, organizationId)
  return orgRole === 'OWNER' || orgRole === 'ADMIN'
}

/**
 * Check if user can delete routes in an organization.
 * Requires org OWNER role or system ADMIN.
 */
export async function canDeleteOrgRoutes(userId: string, systemRole: string, organizationId: string): Promise<boolean> {
  if (systemRole === 'ADMIN') return true

  const orgRole = await getUserOrgRole(userId, organizationId)
  return orgRole === 'OWNER'
}

/**
 * Check if user can view a route (member of route's org, or system admin, or route has no org).
 */
export async function canViewRoute(userId: string, systemRole: string, routeOrganizationId: string | null): Promise<boolean> {
  if (systemRole === 'ADMIN') return true
  if (!routeOrganizationId) return false // unassigned routes only visible to admins

  const orgRole = await getUserOrgRole(userId, routeOrganizationId)
  return orgRole !== null
}

/**
 * Check if user can manage a specific route (edit/publish).
 */
export async function canManageRoute(userId: string, systemRole: string, routeId: string): Promise<boolean> {
  if (systemRole === 'ADMIN') return true

  const route = await prisma.route.findUnique({
    where: { id: routeId, deletedAt: null },
    select: { organizationId: true },
  })

  if (!route) return false
  if (!route.organizationId) return false // unassigned routes only manageable by admins

  return canManageOrgRoutes(userId, systemRole, route.organizationId)
}

/**
 * Check if user can delete a specific route.
 */
export async function canDeleteRoute(userId: string, systemRole: string, routeId: string): Promise<boolean> {
  if (systemRole === 'ADMIN') return true

  const route = await prisma.route.findUnique({
    where: { id: routeId, deletedAt: null },
    select: { organizationId: true },
  })

  if (!route) return false
  if (!route.organizationId) return false

  return canDeleteOrgRoutes(userId, systemRole, route.organizationId)
}
