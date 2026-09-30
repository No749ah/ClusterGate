import dns from 'dns/promises'
import net from 'net'
import { validateTargetUrl } from './security'
import {
  DenyList,
  getDefaultDenyList,
  refreshDatabaseAddresses,
  normalizeHost,
  unmapIp,
  parseCidr,
  ipInList,
} from './targetDenylist'

// =============================================================================
// Route target policy
//
// Every route target passes three checks, in order:
//   1. validateTargetUrl — scheme and cloud metadata endpoints (security.ts)
//   2. the global denylist — loopback, Kubernetes API, ClusterGate's database
//   3. the organization's allowlist, when the org has restrictTargets on:
//      the host must be a Kubernetes service in an allowed namespace, or match
//      an allowed host entry (exact host, *.wildcard, IP or CIDR)
// =============================================================================

export interface OrgTargetPolicy {
  organizationId: string
  organizationName: string
  restrictTargets: boolean
  allowedTargetNamespaces: string[]
  allowedTargetHosts: string[]
}

export class TargetPolicyError extends Error {}

const NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/
const HOST_RE = /^(\*\.)?([a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?)(\.[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?)*$/

export function isValidNamespace(ns: string): boolean {
  return NAMESPACE_RE.test(ns)
}

/** Allowlist host entry: hostname, *.suffix, IP or CIDR. */
export function isValidHostEntry(entry: string): boolean {
  const e = normalizeHost(entry)
  if (!e || e.length > 253) return false
  if (parseCidr(e)) return true
  return HOST_RE.test(e)
}

/**
 * Namespace of a Kubernetes service hostname, or null if the host isn't one.
 * Only the explicit forms count — `svc.ns.svc` and `svc.ns.svc.<cluster
 * domain>` (plus pod-level names under them). The short `svc.ns` form is
 * ambiguous with public domains (`evil.dev`) and is not recognised.
 */
export function kubeNamespaceOf(host: string, clusterDomain = 'cluster.local'): string | null {
  const h = normalizeHost(host)
  const fqdnSuffix = `.svc.${normalizeHost(clusterDomain)}`
  let base: string | null = null
  if (h.endsWith(fqdnSuffix)) base = h.slice(0, -fqdnSuffix.length)
  else if (h.endsWith('.svc')) base = h.slice(0, -'.svc'.length)
  if (!base) return null
  const labels = base.split('.')
  if (labels.length < 2 || labels.some((l) => !l)) return null
  return labels[labels.length - 1]
}

function hostEntryMatches(entry: string, host: string, addresses: string[]): boolean {
  const e = normalizeHost(entry)
  const cidr = parseCidr(e)
  if (cidr) {
    if (net.isIP(unmapIp(host))) return ipInList(cidr, host)
    // A hostname is covered by an IP range only if everything it resolves to
    // is inside it — otherwise it could point anywhere.
    return addresses.length > 0 && addresses.every((a) => ipInList(cidr, a))
  }
  if (e.startsWith('*.')) return host.endsWith(e.slice(1))
  return host === e
}

/** Whether an org allowlist admits the host. Unrestricted orgs admit all. */
export function orgPolicyAllows(
  policy: OrgTargetPolicy,
  host: string,
  addresses: string[],
  clusterDomain = 'cluster.local'
): boolean {
  if (!policy.restrictTargets) return true
  const h = normalizeHost(host)
  const ns = kubeNamespaceOf(h, clusterDomain)
  if (ns && policy.allowedTargetNamespaces.includes(ns)) return true
  return policy.allowedTargetHosts.some((e) => hostEntryMatches(e, h, addresses))
}

async function lookupAll(host: string): Promise<string[]> {
  if (net.isIP(unmapIp(host))) return [host]
  try {
    const res = await dns.lookup(host, { all: true, verbatim: true })
    return res.map((r) => r.address)
  } catch {
    // Unresolvable now — the proxy re-checks at connection time (safeLookup)
    return []
  }
}

export interface AssertOptions {
  denyList?: DenyList
  clusterDomain?: string
  lookup?: (host: string) => Promise<string[]>
}

/**
 * Throw TargetPolicyError (or the metadata-guard error) unless `targetUrl`
 * may be used as a route target under `policy` (null = no org restriction).
 */
export async function assertTargetAllowed(
  targetUrl: string,
  policy: OrgTargetPolicy | null,
  opts: AssertOptions = {}
): Promise<void> {
  await validateTargetUrl(targetUrl)

  const host = normalizeHost(new URL(targetUrl).hostname)
  const clusterDomain = opts.clusterDomain ?? process.env.CLUSTER_DOMAIN ?? 'cluster.local'
  let denyList = opts.denyList
  if (!denyList) {
    await refreshDatabaseAddresses()
    denyList = getDefaultDenyList()
  }

  const hostReason = denyList.matchHost(host)
  if (hostReason) throw new TargetPolicyError(`Blocked target ${host}: ${hostReason}`)

  const addresses = await (opts.lookup ?? lookupAll)(host)
  for (const addr of addresses) {
    const reason = denyList.matchIp(addr)
    if (reason) throw new TargetPolicyError(`Blocked target ${host}: resolves to ${addr} (${reason})`)
  }

  if (policy && !orgPolicyAllows(policy, host, addresses, clusterDomain)) {
    throw new TargetPolicyError(
      `Target ${host} is not in the allowed targets of organization "${policy.organizationName}". ` +
        'Ask a system admin to add its namespace or host to the organization.'
    )
  }
}
