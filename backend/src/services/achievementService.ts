import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface AchievementDef {
  key: string
  title: string
  description: string
  icon: string  // emoji
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_route', title: 'First Steps', description: 'Create your first route', icon: '🚀', rarity: 'common' },
  { key: 'ten_routes', title: 'Route Builder', description: 'Create 10 routes', icon: '🛤️', rarity: 'common' },
  { key: 'fifty_routes', title: 'Highway System', description: 'Create 50 routes', icon: '🏗️', rarity: 'rare' },
  { key: 'century', title: 'Century', description: 'Create 100 routes', icon: '💯', rarity: 'epic' },
  { key: 'first_publish', title: 'Go Live', description: 'Publish your first route', icon: '📡', rarity: 'common' },
  { key: 'websocket_master', title: 'Socket Wizard', description: 'Enable WebSocket on a route', icon: '🔌', rarity: 'rare' },
  { key: 'circuit_breaker', title: 'Safety First', description: 'Enable circuit breaker on a route', icon: '⚡', rarity: 'rare' },
  { key: 'load_balancer', title: 'Load Master', description: 'Add multiple targets to a route', icon: '⚖️', rarity: 'rare' },
  { key: 'night_owl', title: 'Night Owl', description: 'Make a change between 2am and 5am', icon: '🦉', rarity: 'rare' },
  { key: 'speed_demon', title: 'Speed Demon', description: 'Route with under 10ms avg response time', icon: '⚡', rarity: 'epic' },
  { key: 'zero_downtime_7d', title: 'Rock Solid', description: '7 days with zero downtime on all routes', icon: '🪨', rarity: 'epic' },
  { key: 'party_animal', title: 'Party Animal', description: 'Trigger party mode', icon: '🎉', rarity: 'rare' },
  { key: 'backup_hero', title: 'Backup Hero', description: 'Create your first backup', icon: '💾', rarity: 'common' },
  { key: 'team_player', title: 'Team Player', description: 'Join an organization', icon: '🤝', rarity: 'common' },
  { key: 'two_factor', title: 'Fort Knox', description: 'Enable two-factor authentication', icon: '🔐', rarity: 'common' },
  { key: 'first_incident_resolved', title: 'Fire Fighter', description: 'Resolve your first incident', icon: '🧑‍🚒', rarity: 'rare' },
  { key: 'reviewer', title: 'Gatekeeper', description: 'Review a change request', icon: '🔍', rarity: 'rare' },
]

export const achievementService = {
  async unlock(userId: string, key: string): Promise<AchievementDef | null> {
    const def = ACHIEVEMENTS.find((a) => a.key === key)
    if (!def) return null

    // Check if already unlocked
    const existing = await prisma.achievement.findUnique({
      where: { userId_key: { userId, key } },
    })
    if (existing) return null

    await prisma.achievement.create({
      data: { userId, key },
    })

    // Create notification
    await prisma.notification.create({
      data: {
        userId,
        type: 'achievement',
        title: `Achievement Unlocked: ${def.title}`,
        message: `${def.icon} ${def.description}`,
      },
    })

    return def
  },

  async getUserAchievements(userId: string) {
    const unlocked = await prisma.achievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
    })

    return ACHIEVEMENTS.map((def) => {
      const found = unlocked.find((a) => a.key === def.key)
      return {
        ...def,
        unlocked: !!found,
        unlockedAt: found?.unlockedAt ?? null,
      }
    })
  },

  async getUnlockedCount(userId: string): Promise<number> {
    return prisma.achievement.count({ where: { userId } })
  },

  // Check and unlock route-count-based achievements
  async checkRouteCount(userId: string) {
    const count = await prisma.route.count({ where: { createdById: userId, deletedAt: null } })
    if (count >= 1) await this.unlock(userId, 'first_route')
    if (count >= 10) await this.unlock(userId, 'ten_routes')
    if (count >= 50) await this.unlock(userId, 'fifty_routes')
    if (count >= 100) await this.unlock(userId, 'century')
  },

  // Check night owl (2am-5am)
  async checkNightOwl(userId: string) {
    const hour = new Date().getHours()
    if (hour >= 2 && hour < 5) {
      await this.unlock(userId, 'night_owl')
    }
  },

  async checkPublish(userId: string) {
    await this.unlock(userId, 'first_publish')
  },

  async checkWebSocket(userId: string) {
    await this.unlock(userId, 'websocket_master')
  },

  async checkCircuitBreaker(userId: string) {
    await this.unlock(userId, 'circuit_breaker')
  },

  async checkLoadBalancer(userId: string) {
    await this.unlock(userId, 'load_balancer')
  },

  async checkBackup(userId: string) {
    await this.unlock(userId, 'backup_hero')
  },

  async checkTwoFactor(userId: string) {
    await this.unlock(userId, 'two_factor')
  },

  async checkTeamPlayer(userId: string) {
    await this.unlock(userId, 'team_player')
  },

  async checkIncidentResolved(userId: string) {
    await this.unlock(userId, 'first_incident_resolved')
  },

  async checkReviewer(userId: string) {
    await this.unlock(userId, 'reviewer')
  },

  async checkPartyMode(userId: string) {
    await this.unlock(userId, 'party_animal')
  },

  get totalCount() {
    return ACHIEVEMENTS.length
  },
}
