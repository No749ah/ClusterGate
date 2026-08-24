import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // Dedicated key for encrypting route secrets at rest (AES-256-GCM). Kept
  // separate from JWT_SECRET so signing-key rotation doesn't destroy stored
  // secrets. Required in production; dev falls back to JWT_SECRET (see
  // lib/crypto.ts).
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  // Express 'trust proxy' setting. Number = number of trusted proxy hops,
  // 'false' = trust none (use when ClusterGate is exposed directly to the
  // internet so clients cannot spoof X-Forwarded-For to defeat IP allowlists
  // and rate limiting). Defaults to 1 (single ingress/LB in front, e.g. k8s).
  TRUST_PROXY: z.string().default('1'),
  PROXY_TIMEOUT: z.coerce.number().default(30000),
  // Max request body size forwarded through the proxy (raw passthrough)
  PROXY_BODY_LIMIT: z.string().default('50mb'),
  // Stream request bodies straight to the target (unbuffered) for large uploads.
  // Bodies are still buffered when a route needs them (webhook signature or
  // request transforms). Off by default (uses the buffered raw parser).
  PROXY_STREAM_REQUESTS: z.coerce.boolean().default(false),
  // Run `prisma migrate deploy` automatically on backend startup. Default on so
  // schema changes apply on every deploy/self-update without manual steps.
  AUTO_MIGRATE: z.coerce.boolean().default(true),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('./logs'),
  // Serve the interactive API docs (/api/docs + /api/docs.json). Both are
  // behind authentication; unset means on in dev and off in production.
  SWAGGER_ENABLED: z.string().optional(),
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_SECRET: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),
  LOG_RETENTION_DAYS: z.coerce.number().default(90),
  BACKUP_CRON_ENABLED: z.coerce.boolean().default(false),
  BACKUP_CRON_SCHEDULE: z.string().default('0 3 * * *'),
  BACKUP_RETENTION_COUNT: z.coerce.number().default(10),
  // OpenTelemetry distributed tracing. Off by default; when enabled, spans are
  // exported over OTLP/HTTP to OTEL_EXPORTER_OTLP_ENDPOINT (e.g. a collector,
  // Tempo, Jaeger, Honeycomb). Trace/span IDs are also attached to logs.
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_SERVICE_NAME: z.string().default('clustergate-backend'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

// Refuse to start in production without a dedicated encryption key — silently
// deriving it from JWT_SECRET breaks key separation and ties stored secrets to
// the JWT signing key's lifecycle.
if (parsed.data.NODE_ENV === 'production' && !parsed.data.ENCRYPTION_KEY) {
  console.error('❌ ENCRYPTION_KEY is required in production (min. 32 characters).')
  console.error('   Generate one with: openssl rand -hex 32')
  process.exit(1)
}

export const config = {
  ...parsed.data,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  trustProxy: parseTrustProxy(parsed.data.TRUST_PROXY),
  swaggerEnabled:
    parsed.data.SWAGGER_ENABLED !== undefined
      ? ['true', '1', 'yes'].includes(parsed.data.SWAGGER_ENABLED.toLowerCase())
      : parsed.data.NODE_ENV !== 'production',
}

function parseTrustProxy(value: string): boolean | number {
  if (value === 'false') return false
  if (value === 'true') return true
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? 1 : n
}
