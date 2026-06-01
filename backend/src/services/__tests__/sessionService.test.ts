import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { validateSession, revokeSession, revokeOtherSessions } from '../sessionService'
import { prisma } from '../../lib/prisma'

const findUnique = prisma.session.findUnique as unknown as ReturnType<typeof vi.fn>
const update = prisma.session.update as unknown as ReturnType<typeof vi.fn>
const updateMany = prisma.session.updateMany as unknown as ReturnType<typeof vi.fn>

describe('validateSession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns false when the session does not exist', async () => {
    findUnique.mockResolvedValue(null)
    expect(await validateSession('missing')).toBe(false)
  })

  it('returns false for a revoked session', async () => {
    findUnique.mockResolvedValue({ revokedAt: new Date(), expiresAt: new Date(Date.now() + 1000) })
    expect(await validateSession('revoked')).toBe(false)
  })

  it('returns false for an expired session', async () => {
    findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() - 1000) })
    expect(await validateSession('expired')).toBe(false)
  })

  it('returns true for a live session and touches lastSeenAt once per window', async () => {
    findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    update.mockResolvedValue({})
    expect(await validateSession('live-1', '1.2.3.4')).toBe(true)
    // first call touches; immediate second call should be throttled (no extra update)
    expect(await validateSession('live-1', '1.2.3.4')).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
  })
})

describe('revokeSession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws when the session belongs to another user', async () => {
    findUnique.mockResolvedValue({ userId: 'someone-else' })
    await expect(revokeSession('me', 's1')).rejects.toThrow()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('revokes a session the user owns', async () => {
    findUnique.mockResolvedValue({ userId: 'me' })
    updateMany.mockResolvedValue({ count: 1 })
    await revokeSession('me', 's1')
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 's1', revokedAt: null }),
    }))
  })
})

describe('revokeOtherSessions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('revokes every active session except the one kept', async () => {
    updateMany.mockResolvedValue({ count: 3 })
    const n = await revokeOtherSessions('me', 'keep-this')
    expect(n).toBe(3)
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'me', revokedAt: null, id: { not: 'keep-this' } }),
    }))
  })
})
