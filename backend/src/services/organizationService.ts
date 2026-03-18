import { OrgRole } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

// ============================================================================
// Organizations
// ============================================================================

export async function getOrganizations(userId?: string) {
  if (userId) {
    // Return only orgs the user is a member of
    const memberships = await prisma.orgMembership.findMany({
      where: { userId },
      include: {
        organization: {
          include: { _count: { select: { memberships: true, teams: true, routes: true } } },
        },
      },
      orderBy: { organization: { name: 'asc' } },
    })
    return memberships.map((m) => ({ ...m.organization, role: m.role }))
  }

  return prisma.organization.findMany({
    include: { _count: { select: { memberships: true, teams: true, routes: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function getOrganizationById(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      teams: {
        include: { _count: { select: { members: true, routeGroups: true } } },
        orderBy: { name: 'asc' },
      },
      _count: { select: { routes: true } },
    },
  })
  if (!org) throw AppError.notFound('Organization')
  return org
}

export async function createOrganization(data: { name: string; slug: string; description?: string }, creatorId: string) {
  // Validate slug
  const existing = await prisma.organization.findUnique({ where: { slug: data.slug } })
  if (existing) throw AppError.conflict(`Organization slug "${data.slug}" is already taken`)

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
      },
    })

    // Creator becomes OWNER
    await tx.orgMembership.create({
      data: {
        userId: creatorId,
        organizationId: org.id,
        role: 'OWNER',
      },
    })

    return org
  })
}

export async function updateOrganization(id: string, data: { name?: string; description?: string | null; isActive?: boolean }) {
  const org = await prisma.organization.findUnique({ where: { id } })
  if (!org) throw AppError.notFound('Organization')
  return prisma.organization.update({ where: { id }, data })
}

export async function deleteOrganization(id: string) {
  const org = await prisma.organization.findUnique({ where: { id } })
  if (!org) throw AppError.notFound('Organization')
  await prisma.organization.delete({ where: { id } })
}

// ============================================================================
// Organization Members
// ============================================================================

export async function getOrgMembership(orgId: string, userId: string) {
  return prisma.orgMembership.findFirst({
    where: { organizationId: orgId, userId },
  })
}

export async function addOrgMember(organizationId: string, userId: string, role: OrgRole = 'MEMBER') {
  const existing = await prisma.orgMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  })
  if (existing) throw AppError.conflict('User is already a member of this organization')

  return prisma.orgMembership.create({
    data: { userId, organizationId, role },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
}

export async function updateOrgMemberRole(organizationId: string, userId: string, role: OrgRole) {
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  })
  if (!membership) throw AppError.notFound('Membership')

  return prisma.orgMembership.update({
    where: { id: membership.id },
    data: { role },
  })
}

export async function removeOrgMember(organizationId: string, userId: string) {
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  })
  if (!membership) throw AppError.notFound('Membership')

  // Don't allow removing the last OWNER
  if (membership.role === 'OWNER') {
    const ownerCount = await prisma.orgMembership.count({
      where: { organizationId, role: 'OWNER' },
    })
    if (ownerCount <= 1) {
      throw AppError.badRequest('Cannot remove the last owner of an organization')
    }
  }

  await prisma.orgMembership.delete({ where: { id: membership.id } })
}

// ============================================================================
// Teams
// ============================================================================

export async function getTeams(organizationId: string) {
  return prisma.team.findMany({
    where: { organizationId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { members: true, routeGroups: true } },
    },
    orderBy: { name: 'asc' },
  })
}

export async function getTeamById(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      routeGroups: {
        include: { _count: { select: { routes: true } } },
      },
    },
  })
  if (!team) throw AppError.notFound('Team')
  return team
}

export async function createTeam(organizationId: string, data: { name: string; description?: string }) {
  return prisma.team.create({
    data: {
      organizationId,
      name: data.name,
      description: data.description,
    },
    include: { _count: { select: { members: true, routeGroups: true } } },
  })
}

export async function updateTeam(teamId: string, data: { name?: string; description?: string | null }) {
  const team = await prisma.team.findUnique({ where: { id: teamId } })
  if (!team) throw AppError.notFound('Team')
  return prisma.team.update({ where: { id: teamId }, data })
}

export async function deleteTeam(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } })
  if (!team) throw AppError.notFound('Team')
  await prisma.team.delete({ where: { id: teamId } })
}

export async function addTeamMember(teamId: string, userId: string) {
  const existing = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  })
  if (existing) throw AppError.conflict('User is already a member of this team')

  return prisma.teamMembership.create({
    data: { userId, teamId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
}

export async function removeTeamMember(teamId: string, userId: string) {
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  })
  if (!membership) throw AppError.notFound('Team membership')
  await prisma.teamMembership.delete({ where: { id: membership.id } })
}
