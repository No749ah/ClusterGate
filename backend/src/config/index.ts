import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  // Express 'trust proxy' setting. Number = number of trusted proxy hops,
  // 'false' = trust none (use when ClusterGate is exposed directly to the
  // internet so clients cannot spoof X-Forwarded-For to defeat IP allowlists
  // and rate limiting). Defaults to 1 (single ingress/LB in front, e.g. k8s).
  TRUST_PROXY: z.string().default('1'),
  PROXY_TIMEOUT: z.coerce.number().default(30000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('./logs'),
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_SECRET: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),
  LOG_RETENTION_DAYS: z.coerce.number().default(90),
  BACKUP_CRON_ENABLED: z.coerce.boolean().default(false),
  BACKUP_CRON_SCHEDULE: z.string().default('0 3 * * *'),
  BACKUP_RETENTION_COUNT: z.coerce.number().default(10),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = {
  ...parsed.data,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  trustProxy: parseTrustProxy(parsed.data.TRUST_PROXY),
}

function parseTrustProxy(value: string): boolean | number {
  if (value === 'false') return false
  if (value === 'true') return true
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? 1 : n
}
