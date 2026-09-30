import net from 'net'
import dns from 'dns/promises'

// =============================================================================
// Target denylist — upstreams no route may point at, whatever its organization
//
// ClusterGate runs inside the cluster, so a route is a way into anything the
// backend pod can reach. A few of those targets are never legitimate to
// expose: the pod itself (loopback), the Kubernetes API server (the pod's
// service account token is one header away) and ClusterGate's own database.
// These are denied on route create/update and again at connection time via
// safeLookup, so a hostname that later re-resolves to one of them is still
// refused. Operators can extend the list with TARGET_DENY_EXTRA or switch the
// built-in rules off with TARGET_DENY_DEFAULTS=false.
// =============================================================================

type Rule =
  | { kind: 'host'; value: string; reason: string }
  | { kind: 'suffix'; value: string; reason: string }
  | { kind: 'cidr'; value: string; list: net.BlockList; reason: string }

export interface DenyListOptions {
  /** Include loopback, Kubernetes API and database rules (default true). */
  defaults?: boolean
  /** Comma-separated extra entries: hosts, *.suffixes, IPs or CIDRs. */
  extra?: string
  /** Kubernetes cluster DNS domain (default cluster.local). */
  clusterDomain?: string
  /** Value of KUBERNETES_SERVICE_HOST (set automatically inside pods). */
  kubernetesServiceHost?: string
  /** ClusterGate's own DATABASE_URL. */
  databaseUrl?: string
}

const REASON_LOOPBACK = 'loopback / unspecified address (ClusterGate itself)'
const REASON_KUBE_API = 'Kubernetes API server'
const REASON_DATABASE = "ClusterGate's own database"
const REASON_EXTRA = 'denied by TARGET_DENY_EXTRA'

/** Lower-case, strip IPv6 brackets, zone index and a trailing root dot. */
export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  const zone = h.indexOf('%')
  if (zone !== -1 && h.includes(':')) h = h.slice(0, zone)
  if (h.endsWith('.')) h = h.slice(0, -1)
  return h
}

/** IPv4-mapped IPv6 (::ffff:10.0.0.1 / ::ffff:a00:1) → plain IPv4. */
export function unmapIp(addr: string): string {
  const a = normalizeHost(addr)
  const dotted = a.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) return dotted[1]
  const hex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
  }
  return a
}

function family(addr: string): 'ipv4' | 'ipv6' | null {
  const v = net.isIP(addr)
  return v === 4 ? 'ipv4' : v === 6 ? 'ipv6' : null
}

/**
 * Parse an IP or CIDR ("10.0.0.0/8", "fd00::/8", "10.1.2.3") into a
 * BlockList. Returns null when the string is neither.
 */
export function parseCidr(entry: string): net.BlockList | null {
  const [rawAddr, rawPrefix, ...rest] = entry.split('/')
  if (rest.length) return null
  const addr = unmapIp(rawAddr)
  const fam = family(addr)
  if (!fam) return null
  const max = fam === 'ipv4' ? 32 : 128
  const prefix = rawPrefix === undefined ? max : Number(rawPrefix)
  if (!/^\d+$/.test(rawPrefix ?? String(max)) || prefix < 0 || prefix > max) return null
  const list = new net.BlockList()
  list.addSubnet(addr, prefix, fam)
  return list
}

/** True if `ip` (v4 or v6, mapped addresses included) lies inside `list`. */
export function ipInList(list: net.BlockList, ip: string): boolean {
  const addr = unmapIp(ip)
  const fam = family(addr)
  return fam !== null && list.check(addr, fam)
}

export class DenyList {
  private rules: Rule[] = []

  addHost(value: string, reason: string) {
    const h = normalizeHost(value)
    if (!h) return
    const list = parseCidr(h)
    if (list) this.rules.push({ kind: 'cidr', value: h, list, reason })
    else if (h.startsWith('*.')) this.rules.push({ kind: 'suffix', value: h.slice(1), reason })
    else this.rules.push({ kind: 'host', value: h, reason })
  }

  get size() {
    return this.rules.length
  }

  /** Reason the hostname (or IP literal) is denied, or null. */
  matchHost(host: string): string | null {
    const h = normalizeHost(host)
    for (const r of this.rules) {
      if (r.kind === 'host' && r.value === h) return r.reason
      if (r.kind === 'suffix' && h.endsWith(r.value)) return r.reason
    }
    return family(unmapIp(h)) ? this.matchIp(h) : null
  }

  /** Reason the resolved address is denied, or null. */
  matchIp(ip: string): string | null {
    for (const r of this.rules) {
      if (r.kind === 'cidr' && ipInList(r.list, ip)) return r.reason
    }
    return null
  }
}

function hostOfUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    return normalizeHost(new URL(url).hostname) || null
  } catch {
    return null
  }
}

export function buildDenyList(opts: DenyListOptions = {}): DenyList {
  const list = new DenyList()
  const clusterDomain = normalizeHost(opts.clusterDomain || 'cluster.local')

  if (opts.defaults !== false) {
    list.addHost('localhost', REASON_LOOPBACK)
    list.addHost('*.localhost', REASON_LOOPBACK)
    list.addHost('127.0.0.0/8', REASON_LOOPBACK)
    list.addHost('0.0.0.0/8', REASON_LOOPBACK)
    list.addHost('::1', REASON_LOOPBACK)
    list.addHost('::', REASON_LOOPBACK)

    for (const h of ['kubernetes', 'kubernetes.default', 'kubernetes.default.svc', `kubernetes.default.svc.${clusterDomain}`]) {
      list.addHost(h, REASON_KUBE_API)
    }
    if (opts.kubernetesServiceHost) list.addHost(opts.kubernetesServiceHost, REASON_KUBE_API)

    const dbHost = hostOfUrl(opts.databaseUrl)
    if (dbHost) list.addHost(dbHost, REASON_DATABASE)
  }

  for (const entry of (opts.extra ?? '').split(',')) {
    if (entry.trim()) list.addHost(entry, REASON_EXTRA)
  }
  return list
}

// -----------------------------------------------------------------------------
// Process-wide default list, built from the environment
// -----------------------------------------------------------------------------

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase())
}

let defaultList: DenyList | null = null
let databaseResolvedAt = 0
const DATABASE_RESOLVE_TTL_MS = 5 * 60 * 1000

export function getDefaultDenyList(): DenyList {
  if (!defaultList) {
    defaultList = buildDenyList({
      defaults: envFlag(process.env.TARGET_DENY_DEFAULTS, true),
      extra: process.env.TARGET_DENY_EXTRA,
      clusterDomain: process.env.CLUSTER_DOMAIN,
      kubernetesServiceHost: process.env.KUBERNETES_SERVICE_HOST,
      databaseUrl: process.env.DATABASE_URL,
    })
  }
  return defaultList
}

/** Drop the cached list so the next call re-reads the environment (tests). */
export function resetDefaultDenyList() {
  defaultList = null
  databaseResolvedAt = 0
}

/**
 * Add the database host's current addresses to the default list, so a route
 * to the DB's IP (or to another name for it) is refused too — including at
 * connection time, where safeLookup can only compare IPs. Cached for a few
 * minutes; DNS failures are ignored (the hostname rule still applies).
 */
export async function refreshDatabaseAddresses(): Promise<void> {
  if (!envFlag(process.env.TARGET_DENY_DEFAULTS, true)) return
  if (Date.now() - databaseResolvedAt < DATABASE_RESOLVE_TTL_MS) return
  databaseResolvedAt = Date.now()
  const host = hostOfUrl(process.env.DATABASE_URL)
  if (!host || family(unmapIp(host))) return
  try {
    const addrs = await dns.lookup(host, { all: true })
    const list = getDefaultDenyList()
    for (const a of addrs) {
      if (!list.matchIp(a.address)) list.addHost(a.address, REASON_DATABASE)
    }
  } catch {
    /* unresolvable from here — nothing to add */
  }
}
