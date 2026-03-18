import cron, { ScheduledTask } from 'node-cron'
import { runAllHealthChecks } from '../services/healthService'
import { achievementService } from '../services/achievementService'
import { prisma } from '../lib/prisma'
import { cleanOldLogs } from '../services/logService'
import { runScheduledUpdateCheck } from '../services/updateService'
import { createBackup, enforceRetentionPolicy } from '../services/backupService'
import { logger } from '../lib/logger'
import { config } from '../config'

const jobs: ScheduledTask[] = []

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

  // Update check every 6 hours
  const updateCheckJob = cron.schedule('0 */6 * * *', async () => {
    try {
      await runScheduledUpdateCheck()
    } catch (err) {
      logger.error('Update check cron failed', { error: (err as Error).message })
    }
  })
  jobs.push(updateCheckJob)
  logger.info('Update check cron started (every 6 hours)')

  // Achievement checks daily at 3am (speed_demon, zero_downtime)
  const achievementJob = cron.schedule('0 3 * * *', async () => {
    try {
      const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } })
      for (const user of users) {
        await achievementService.checkSpeedDemon(user.id).catch(() => {})
        await achievementService.checkZeroDowntime(user.id).catch(() => {})
      }
    } catch (err) {
      logger.error('Achievement check cron failed', { error: (err as Error).message })
    }
  })
  jobs.push(achievementJob)
  logger.info('Achievement check cron started (daily at 3am)')

  // Scheduled backup (if enabled)
  if (config.BACKUP_CRON_ENABLED) {
    const backupJob = cron.schedule(config.BACKUP_CRON_SCHEDULE, async () => {
      try {
        const backup = await createBackup()
        logger.info('Scheduled backup created', { filename: backup.filename, size: backup.size })
        const deleted = await enforceRetentionPolicy(config.BACKUP_RETENTION_COUNT)
        if (deleted > 0) {
          logger.info('Backup retention enforced', { deleted, maxBackups: config.BACKUP_RETENTION_COUNT })
        }
      } catch (err) {
        logger.error('Scheduled backup cron failed', { error: (err as Error).message })
      }
    })
    jobs.push(backupJob)
    logger.info(`Scheduled backup cron started (${config.BACKUP_CRON_SCHEDULE}), retention: ${config.BACKUP_RETENTION_COUNT}`)
  }

  // Run initial update check after 30 seconds (let the server start up first)
  setTimeout(() => {
    runScheduledUpdateCheck().catch((err) => {
      logger.error('Initial update check failed', { error: (err as Error).message })
    })
  }, 30000)
}

export function stopCronJobs() {
  for (const job of jobs) {
    job.stop()
  }
  logger.info('All cron jobs stopped')
}
