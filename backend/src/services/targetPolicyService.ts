import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { assertTargetAllowed, OrgTargetPolicy } from '../lib/targetPolicy'

const POLICY_SELECT = {
  id: true,
  name: true,
  restrictTargets: true,
  allowedTargetNamespaces: true,
  allowedTargetHosts: true,
} as const

function toPolicy(org: {
  id: string
  name: string
  restrictTargets: boolean
  allowedTargetNamespaces: string[]
  allowedTargetHosts: string[]
}): OrgTargetPolicy {
  return {
    organizationId: org.id,
    organizationName: org.name,
    restrictTargets: org.restrictTargets,
    allowedTargetNamespaces: org.allowedTargetNamespaces,
    allowedTargetHosts: org.allowedTargetHosts,
  }
}

export async function getOrgTargetPolicy(organizationId: string | null | undefined): Promise<OrgTargetPolicy | null> {
  if (!organizationId) return null
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: POLICY_SELECT })
  return org ? toPolicy(org) : null
}

/**
 * Enforce the target policy for a route target (the route's own targetUrl or
 * a load-balancing target) in the given organization. Throws a 400 AppError
 * carrying the reason.
 */
export async function assertRouteTargetAllowed(targetUrl: string, organizationId: string | null | undefined): Promise<void> {
  try {
    await assertTargetAllowed(targetUrl, await getOrgTargetPolicy(organizationId))
  } catch (err) {
    throw AppError.badRequest((err as Error).message)
  }
}

/**
 * Policy check for an ad-hoc connection test that isn't bound to a route yet.
 * With an organization: the caller must be able to manage its routes and the
 * org's policy applies. Without one: system admins only get the global
 * checks; everyone else passes if at least one org they manage routes in
 * would accept the target (they could create the route there).
 */
export async function assertTargetAllowedForUser(
  targetUrl: string,
  user: { userId: string; role: string },
  organizationId?: string | null
): Promise<void> {
  if (organizationId) {
    if (user.role !== 'ADMIN') {
      const membership = await prisma.orgMembership.findUnique({
        where: { userId_organizationId: { userId: user.userId, organizationId } },
        select: { role: true },
      })
      if (membership?.role !== 'OWNER' && membership?.role !== 'ADMIN') {
        throw AppError.forbidden('You need Owner or Admin role in this organization')
      }
    }
    return assertRouteTargetAllowed(targetUrl, organizationId)
  }

  if (user.role === 'ADMIN') return assertRouteTargetAllowed(targetUrl, null)

  const memberships = await prisma.orgMembership.findMany({
    where: { userId: user.userId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { organization: { select: POLICY_SELECT } },
  })
  if (memberships.length === 0) throw AppError.forbidden('You need Owner or Admin role in an organization')

  const policies = memberships.map((m) => toPolicy(m.organization))
  // An unrestricted org only adds the global checks — test that once.
  const candidates = policies.some((p) => !p.restrictTargets) ? [null] : policies
  let firstError: unknown
  for (const policy of candidates) {
    try {
      await assertTargetAllowed(targetUrl, policy)
      return
    } catch (err) {
      firstError ??= err
    }
  }
  throw AppError.badRequest((firstError as Error).message)
}
