import { RequestSource } from '@prisma/client'

// User agents of uptime monitors and load-balancer / orchestrator probes. A
// request from one of these is a health check, not real traffic, so the log
// marks it and hides it by default.
const HEALTH_CHECK_AGENTS: RegExp[] = [
  /^kube-probe\//i,
  /uptime-?kuma/i,
  /uptimerobot/i,
  /pingdom/i,
  /statuscake/i,
  /better ?(uptime|stack)/i,
  /blackbox[ _-]?exporter/i,
  /^ELB-HealthChecker\//i,
  /^GoogleHC\//i,
  /consul health check/i,
  /site24x7/i,
  /datadog.*synthetics/i,
  /newrelicpinger/i,
  /checkly/i,
  /^gatus\//i,
  /healthchecks?\.io/i,
  /^ClusterGate-HealthCheck\//i,
]

export function isHealthCheckUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false
  return HEALTH_CHECK_AGENTS.some((re) => re.test(userAgent))
}

/**
 * Classify a proxied request for the request log. Test-panel runs are tagged
 * by the caller (they never come from an external client); everything else
 * is classified by user agent.
 */
export function classifyRequestSource(userAgent: string | undefined | null, explicit?: RequestSource): RequestSource {
  if (explicit) return explicit
  return isHealthCheckUserAgent(userAgent) ? RequestSource.HEALTH_CHECK : RequestSource.TRAFFIC
}
