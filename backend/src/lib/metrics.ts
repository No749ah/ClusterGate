import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'
import { config } from '../config'

export const registry = new Registry()

// Default Node.js metrics
if (config.METRICS_ENABLED) {
  collectDefaultMetrics({ register: registry, prefix: 'clustergate_' })
}

export const httpRequestsTotal = new Counter({
  name: 'clustergate_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
})

export const httpRequestDuration = new Histogram({
  name: 'clustergate_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
})

export const proxyRequestsTotal = new Counter({
  name: 'clustergate_proxy_requests_total',
  help: 'Total proxy requests',
  labelNames: ['route_id', 'method', 'status'],
  registers: [registry],
})

export const proxyRequestDuration = new Histogram({
  name: 'clustergate_proxy_request_duration_seconds',
  help: 'Proxy request duration in seconds',
  labelNames: ['route_id'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
})

export const activeRoutesTotal = new Gauge({
  name: 'clustergate_active_routes_total',
  help: 'Number of active published routes',
  registers: [registry],
})

export const healthCheckStatus = new Gauge({
  name: 'clustergate_route_health_status',
  help: 'Health status of proxy routes (1=healthy, 0=unhealthy)',
  labelNames: ['route_id', 'route_name'],
  registers: [registry],
})
