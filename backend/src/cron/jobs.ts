import cron from 'node-cron'
import { runAllHealthChecks } from '../services/healthService'
import { cleanOldLogs } from '../services/logService'
import { logger } from '../lib/logger'
import { config } from '../config'

const jobs: cron.ScheduledTask[] = []

export function startCronJobs() {
  // Health checks every 5 minutes
  const healthCheckJob = cron.schedule('*/5 * * * *', async () => {
    try {
      await runAllHealthChecks()
    } catch (err) {
      logger.error('Health check cron failed', { error: (err as Error).message })
    }
  })
  jobs.push(healthCheckJob)
  logger.info('Health check cron started (every 5 minutes)')

  // Log cleanup at 2am daily
  const logCleanupJob = cron.schedule('0 2 * * *', async () => {
    try {
      await cleanOldLogs(config.LOG_RETENTION_DAYS)
    } catch (err) {
      logger.error('Log cleanup cron failed', { error: (err as Error).message })
    }
  })
  jobs.push(logCleanupJob)
  logger.info('Log cleanup cron started (daily at 2am)')
}

export function stopCronJobs() {
  for (const job of jobs) {
    job.stop()
  }
  logger.info('All cron jobs stopped')
}
