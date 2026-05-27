import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { logger } from './logger'

/**
 * Resolve the Prisma schema path for the current runtime. In the production
 * image the schema lives at /app/prisma/schema.prisma; in dev it is under src/.
 */
function resolveSchemaPath(): string | null {
  const candidates = [
    join(process.cwd(), 'prisma', 'schema.prisma'),
    join(process.cwd(), 'src', 'prisma', 'schema.prisma'),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

/**
 * Apply pending Prisma migrations via `prisma migrate deploy`. Runs on every
 * backend boot so schema changes are applied automatically regardless of how
 * the container was deployed (Helm, raw manifests, or ClusterGate's own
 * self-update which just rolls new pods). Prisma takes a DB advisory lock, so
 * concurrent replicas starting at once are serialized safely.
 *
 * Throws on failure so the process exits instead of serving against an
 * out-of-date schema; Kubernetes will back off and retry the pod.
 */
export function runMigrations(): void {
  const schemaPath = resolveSchemaPath()
  if (!schemaPath) {
    logger.warn('Auto-migrate: no Prisma schema found — skipping migrations')
    return
  }

  logger.info('Auto-migrate: applying pending database migrations', { schema: schemaPath })
  const output = execFileSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy', '--schema', schemaPath], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  })
  logger.info('Auto-migrate: migrations applied', { output: output.trim().slice(0, 2000) })
}
