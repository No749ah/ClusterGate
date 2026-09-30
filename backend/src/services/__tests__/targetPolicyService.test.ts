import { describe, it, expect, vi, beforeEach } from 'vitest'

// No real DNS in these tests: every lookup fails, so only host names and IP
// literals decide.
vi.mock('dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns/promises')>()
  const fail = () => Promise.reject(new Error('ENOTFOUND'))
  const mocked = { ...actual, resolve4: fail, resolve6: fail, lookup: fail }
  return { ...mocked, default: mocked }
})

vi.mock('../../lib/prisma', () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    orgMembership: { findUnique: vi.fn(), findMany: vi.fn() },
    route: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    routeTarget: { findMany: vi.fn() },
    routeVersion: { create: vi.fn() },
  },
}))

import { prisma } from '../../lib/prisma'
import { assertRouteTargetAllowed, assertTargetAllowedForUser } from '../targetPolicyService'
import { createRoute, updateRoute } from '../routeService'

const db = prisma as unknown as {
  organization: { findUnique: ReturnType<typeof vi.fn> }
  orgMembership: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  route: Record<'findUnique' | 'findFirst' | 'create' | 'update', ReturnType<typeof vi.fn>>
  routeTarget: { findMany: ReturnType<typeof vi.fn> }
  routeVersion: { create: ReturnType<typeof vi.fn> }
}

const restricted = {
  id: 'org-pay',
  name: 'Payments',
  restrictTargets: true,
  allowedTargetNamespaces: ['payments'],
  allowedTargetHosts: ['*.partner.com'],
}
const open = { id: 'org-open', name: 'Open', restrictTargets: false, allowedTargetNamespaces: [], allowedTargetHosts: [] }

beforeEach(() => {
  vi.clearAllMocks()
  db.organization.findUnique.mockImplementation(({ where }: any) =>
    Promise.resolve(where.id === restricted.id ? restricted : where.id === open.id ? open : null)
  )
})

describe('assertRouteTargetAllowed', () => {
  it('applies the organization allowlist', async () => {
    await expect(assertRouteTargetAllowed('http://api.payments.svc:80', 'org-pay')).resolves.toBeUndefined()
    await expect(assertRouteTargetAllowed('https://hooks.partner.com', 'org-pay')).resolves.toBeUndefined()
    await expect(assertRouteTargetAllowed('http://grafana.monitoring.svc', 'org-pay')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/organization "Payments"/),
    })
  })

  it('applies only the global checks to routes without an organization', async () => {
    await expect(assertRouteTargetAllowed('http://grafana.monitoring.svc', null)).resolves.toBeUndefined()
    await expect(assertRouteTargetAllowed('https://kubernetes.default.svc', null)).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})

describe('assertTargetAllowedForUser (connection tests)', () => {
  const operator = { userId: 'u1', role: 'OPERATOR' }

  it('requires manage rights in the given organization', async () => {
    db.orgMembership.findUnique.mockResolvedValue({ role: 'MEMBER' })
    await expect(assertTargetAllowedForUser('http://api.payments.svc', operator, 'org-pay')).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it("enforces the given organization's allowlist", async () => {
    db.orgMembership.findUnique.mockResolvedValue({ role: 'ADMIN' })
    await expect(assertTargetAllowedForUser('http://api.payments.svc', operator, 'org-pay')).resolves.toBeUndefined()
    await expect(assertTargetAllowedForUser('http://db.billing.svc', operator, 'org-pay')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('without an organization, passes if any org the user manages admits the target', async () => {
    db.orgMembership.findMany.mockResolvedValue([{ organization: restricted }])
    await expect(assertTargetAllowedForUser('http://api.payments.svc', operator)).resolves.toBeUndefined()
    await expect(assertTargetAllowedForUser('http://db.billing.svc', operator)).rejects.toMatchObject({ statusCode: 400 })

    db.orgMembership.findMany.mockResolvedValue([{ organization: restricted }, { organization: open }])
    await expect(assertTargetAllowedForUser('http://db.billing.svc', operator)).resolves.toBeUndefined()
  })

  it('without an organization, rejects users who manage no organization', async () => {
    db.orgMembership.findMany.mockResolvedValue([])
    await expect(assertTargetAllowedForUser('http://db.billing.svc', operator)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('still blocks the denylist for system admins', async () => {
    const admin = { userId: 'a', role: 'ADMIN' }
    await expect(assertTargetAllowedForUser('http://db.billing.svc', admin)).resolves.toBeUndefined()
    await expect(assertTargetAllowedForUser('http://localhost:3001', admin)).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('routeService enforcement', () => {
  const existing = {
    id: 'r1',
    name: 'api',
    targetUrl: 'http://api.payments.svc',
    organizationId: 'org-open',
    publicPath: '/api',
  }

  beforeEach(() => {
    db.route.findUnique.mockResolvedValue(existing)
    db.route.findFirst.mockResolvedValue(null)
    db.route.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', version: 1, ...data }))
    db.route.update.mockImplementation(({ data }: any) => Promise.resolve({ ...existing, version: 2, ...data }))
    db.routeTarget.findMany.mockResolvedValue([])
  })

  it('rejects creating a route to a target outside the org allowlist', async () => {
    await expect(
      createRoute({ name: 'x', publicPath: '/x', targetUrl: 'http://grafana.monitoring.svc', organizationId: 'org-pay' } as any, 'u1')
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(db.route.create).not.toHaveBeenCalled()
  })

  it('rejects creating a route to the Kubernetes API in any org', async () => {
    await expect(
      createRoute({ name: 'x', publicPath: '/x', targetUrl: 'https://kubernetes.default.svc/', organizationId: 'org-open' } as any, 'u1')
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(db.route.create).not.toHaveBeenCalled()
  })

  it('creates a route whose target is allowed', async () => {
    await createRoute({ name: 'x', publicPath: '/x', targetUrl: 'http://api.payments.svc', organizationId: 'org-pay' } as any, 'u1')
    expect(db.route.create).toHaveBeenCalled()
  })

  it('rejects changing the target to a disallowed one', async () => {
    db.route.findUnique.mockResolvedValue({ ...existing, organizationId: 'org-pay' })
    await expect(updateRoute('r1', { targetUrl: 'http://grafana.monitoring.svc' }, 'u1')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(db.route.update).not.toHaveBeenCalled()
  })

  it('re-checks the target and LB targets when a route moves to a stricter org', async () => {
    db.route.findUnique.mockResolvedValue({ ...existing, targetUrl: 'http://api.payments.svc' })
    db.routeTarget.findMany.mockResolvedValue([{ url: 'http://grafana.monitoring.svc' }])
    await expect(updateRoute('r1', { organizationId: 'org-pay' }, 'u1')).rejects.toThrow(/organization "Payments"/)
    expect(db.route.update).not.toHaveBeenCalled()

    db.routeTarget.findMany.mockResolvedValue([{ url: 'http://api-2.payments.svc' }])
    await updateRoute('r1', { organizationId: 'org-pay' }, 'u1')
    expect(db.route.update).toHaveBeenCalled()
  })

  it('does not re-check unrelated updates', async () => {
    db.route.findUnique.mockResolvedValue({ ...existing, targetUrl: 'http://grafana.monitoring.svc', organizationId: 'org-pay' })
    await updateRoute('r1', { description: 'hi' } as any, 'u1')
    expect(db.route.update).toHaveBeenCalled()
  })
})
