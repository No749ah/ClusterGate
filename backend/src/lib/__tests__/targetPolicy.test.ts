import { describe, it, expect, vi, beforeEach } from 'vitest'

// No real DNS: validateTargetUrl's resolve4/6 find nothing, and lookups are
// injected per test through the `lookup` option.
vi.mock('dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns/promises')>()
  const fail = () => Promise.reject(new Error('ENOTFOUND'))
  const mocked = { ...actual, resolve4: fail, resolve6: fail, lookup: fail }
  return { ...mocked, default: mocked }
})

import { buildDenyList } from '../targetDenylist'
import {
  assertTargetAllowed,
  kubeNamespaceOf,
  orgPolicyAllows,
  isValidHostEntry,
  isValidNamespace,
  OrgTargetPolicy,
} from '../targetPolicy'

const denyList = buildDenyList({
  kubernetesServiceHost: '10.96.0.1',
  databaseUrl: 'postgresql://cg:secret@clustergate-postgres:5432/clustergate',
})

function policy(p: Partial<OrgTargetPolicy> = {}): OrgTargetPolicy {
  return {
    organizationId: 'org1',
    organizationName: 'Team A',
    restrictTargets: true,
    allowedTargetNamespaces: [],
    allowedTargetHosts: [],
    ...p,
  }
}

const noDns = async () => [] as string[]
const resolvesTo = (...addrs: string[]) => async () => addrs

describe('global target denylist', () => {
  it.each([
    'http://localhost:3001/api',
    'http://app.localhost',
    'http://127.0.0.1:5432',
    'http://127.8.9.10',
    'http://0.0.0.0:80',
    'http://[::1]:3001',
    'http://[::ffff:127.0.0.1]/',
  ])('blocks loopback target %s', async (url) => {
    await expect(assertTargetAllowed(url, null, { denyList, lookup: noDns })).rejects.toThrow(/loopback/)
  })

  it.each([
    'https://kubernetes',
    'https://kubernetes.default',
    'https://kubernetes.default.svc',
    'https://kubernetes.default.svc.cluster.local:443/api/v1/secrets',
    'https://10.96.0.1',
  ])('blocks the Kubernetes API at %s', async (url) => {
    await expect(assertTargetAllowed(url, null, { denyList, lookup: noDns })).rejects.toThrow(/Kubernetes API/)
  })

  it("blocks ClusterGate's own database by name", async () => {
    await expect(
      assertTargetAllowed('http://clustergate-postgres:5432', null, { denyList, lookup: noDns })
    ).rejects.toThrow(/database/)
  })

  it('blocks a hostname that resolves to a denied address', async () => {
    await expect(
      assertTargetAllowed('http://sneaky.example.com', null, { denyList, lookup: resolvesTo('10.96.0.1') })
    ).rejects.toThrow(/resolves to 10\.96\.0\.1 \(Kubernetes API/)
  })

  it('still blocks cloud metadata endpoints', async () => {
    await expect(assertTargetAllowed('http://169.254.169.254/latest', null, { denyList, lookup: noDns })).rejects.toThrow(
      /metadata/
    )
  })

  it('allows ordinary in-cluster services when the org is unrestricted', async () => {
    await expect(
      assertTargetAllowed('http://n8n.automation.svc.cluster.local:5678', null, {
        denyList,
        lookup: resolvesTo('10.100.4.2'),
      })
    ).resolves.toBeUndefined()
  })

  it('honours TARGET_DENY_EXTRA entries and can drop the defaults', async () => {
    const custom = buildDenyList({ defaults: false, extra: '10.0.0.0/8, *.internal.corp , vault.infra.svc' })
    expect(custom.matchHost('localhost')).toBeNull()
    expect(custom.matchHost('10.1.2.3')).toMatch(/TARGET_DENY_EXTRA/)
    expect(custom.matchHost('db.internal.corp')).toMatch(/TARGET_DENY_EXTRA/)
    expect(custom.matchHost('vault.infra.svc')).toMatch(/TARGET_DENY_EXTRA/)
    expect(custom.matchIp('::ffff:10.9.9.9')).toMatch(/TARGET_DENY_EXTRA/)
    expect(custom.matchHost('internal.corp')).toBeNull()
  })
})

describe('kubeNamespaceOf', () => {
  it.each([
    ['api.payments.svc', 'payments'],
    ['api.payments.svc.cluster.local', 'payments'],
    ['pod-0.api.payments.svc.cluster.local', 'payments'],
    ['API.Payments.SVC.cluster.local.', 'payments'],
  ])('%s → %s', (host, ns) => {
    expect(kubeNamespaceOf(host)).toBe(ns)
  })

  it.each(['api.payments', 'payments.svc', 'example.com', 'api.payments.svc.other.domain'])(
    'does not treat %s as a service name',
    (host) => {
      expect(kubeNamespaceOf(host)).toBeNull()
    }
  )

  it('respects a custom cluster domain', () => {
    expect(kubeNamespaceOf('api.payments.svc.k8s.acme', 'k8s.acme')).toBe('payments')
  })
})

describe('organization allowlist', () => {
  it('admits everything when the org is not restricted', () => {
    expect(orgPolicyAllows(policy({ restrictTargets: false }), 'anything.example.com', [])).toBe(true)
  })

  it('denies everything when restricted with an empty allowlist', () => {
    expect(orgPolicyAllows(policy(), 'api.payments.svc', [])).toBe(false)
  })

  it('matches services in allowed namespaces only', () => {
    const p = policy({ allowedTargetNamespaces: ['payments'] })
    expect(orgPolicyAllows(p, 'api.payments.svc.cluster.local', [])).toBe(true)
    expect(orgPolicyAllows(p, 'api.billing.svc.cluster.local', [])).toBe(false)
    // Short form is ambiguous with public domains and isn't admitted
    expect(orgPolicyAllows(p, 'api.payments', [])).toBe(false)
  })

  it('matches exact hosts and wildcards', () => {
    const p = policy({ allowedTargetHosts: ['api.partner.com', '*.team-a.example.com'] })
    expect(orgPolicyAllows(p, 'api.partner.com', [])).toBe(true)
    expect(orgPolicyAllows(p, 'www.partner.com', [])).toBe(false)
    expect(orgPolicyAllows(p, 'svc.team-a.example.com', [])).toBe(true)
    expect(orgPolicyAllows(p, 'team-a.example.com', [])).toBe(false)
    expect(orgPolicyAllows(p, 'evilteam-a.example.com', [])).toBe(false)
  })

  it('matches IP literals and fully-covered hostnames against CIDRs', () => {
    const p = policy({ allowedTargetHosts: ['10.20.0.0/16', 'fd12::/16'] })
    expect(orgPolicyAllows(p, '10.20.3.4', [])).toBe(true)
    expect(orgPolicyAllows(p, '10.21.3.4', [])).toBe(false)
    expect(orgPolicyAllows(p, 'fd12::5', [])).toBe(true)
    expect(orgPolicyAllows(p, 'app.example.com', ['10.20.1.1', '10.20.1.2'])).toBe(true)
    // Partly outside the range, or unresolved → not covered
    expect(orgPolicyAllows(p, 'app.example.com', ['10.20.1.1', '8.8.8.8'])).toBe(false)
    expect(orgPolicyAllows(p, 'app.example.com', [])).toBe(false)
  })

  it('rejects a disallowed target with the org name in the message', async () => {
    const p = policy({ allowedTargetNamespaces: ['payments'] })
    await expect(
      assertTargetAllowed('http://grafana.monitoring.svc:3000', p, { denyList, lookup: noDns })
    ).rejects.toThrow(/not in the allowed targets of organization "Team A"/)
    await expect(
      assertTargetAllowed('http://api.payments.svc:8080', p, { denyList, lookup: noDns })
    ).resolves.toBeUndefined()
  })

  it('never lets an allowlist entry override the global denylist', async () => {
    const p = policy({ allowedTargetNamespaces: ['default'], allowedTargetHosts: ['127.0.0.0/8'] })
    await expect(
      assertTargetAllowed('https://kubernetes.default.svc', p, { denyList, lookup: noDns })
    ).rejects.toThrow(/Kubernetes API/)
    await expect(assertTargetAllowed('http://127.0.0.1', p, { denyList, lookup: noDns })).rejects.toThrow(/loopback/)
  })
})

describe('allowlist entry validation', () => {
  it.each(['api.example.com', '*.example.com', '10.0.0.0/8', '10.1.2.3', 'fd00::/8', 'my-svc'])('accepts %s', (e) => {
    expect(isValidHostEntry(e)).toBe(true)
  })

  it.each(['', 'http://x.com', 'a..b', '*', '*.', '10.0.0.0/33', 'foo bar', 'x.com:8080', 'a.*.com'])(
    'rejects %s',
    (e) => {
      expect(isValidHostEntry(e)).toBe(false)
    }
  )

  it('validates namespace names', () => {
    expect(isValidNamespace('payments')).toBe(true)
    expect(isValidNamespace('team-a')).toBe(true)
    expect(isValidNamespace('Team_A')).toBe(false)
    expect(isValidNamespace('-bad')).toBe(false)
  })
})

beforeEach(() => vi.clearAllMocks())
