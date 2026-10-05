import { describe, it, expect } from 'vitest'
import { classifyRequestSource, isHealthCheckUserAgent } from '../requestSource'

describe('classifyRequestSource', () => {
  it.each([
    'kube-probe/1.30',
    'Uptime-Kuma/1.23.11',
    'Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
    'Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)',
    'ELB-HealthChecker/2.0',
    'GoogleHC/1.0',
    'Consul Health Check',
    'Blackbox Exporter/0.25.0',
    'Gatus/1.0',
  ])('marks %s as a health check', (ua) => {
    expect(isHealthCheckUserAgent(ua)).toBe(true)
    expect(classifyRequestSource(ua)).toBe('HEALTH_CHECK')
  })

  it.each([
    'Python/3.11 aiohttp/3.13.5',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36',
    'curl/8.7.1',
    'n8n',
    '',
  ])('treats %j as traffic', (ua) => {
    expect(classifyRequestSource(ua)).toBe('TRAFFIC')
  })

  it('treats a missing user agent as traffic', () => {
    expect(classifyRequestSource(undefined)).toBe('TRAFFIC')
  })

  it('lets the caller tag a test run regardless of user agent', () => {
    expect(classifyRequestSource('Mozilla/5.0', 'TEST')).toBe('TEST')
  })
})
