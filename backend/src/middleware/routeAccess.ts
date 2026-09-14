import { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors'
import { canViewRouteById, canManageRoute } from '../services/orgAccessService'

// Org-scoped access guards for route-bound endpoints. Denials return 404
// rather than 403 so route existence is never leaked across tenants — the
// same convention the main route endpoints use.

/** Caller must be able to view the route named by req.params[param]. */
export function requireRouteView(param = 'id') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const allowed = await canViewRouteById(req.user!.userId, req.user!.role, req.params[param])
      if (!allowed) throw AppError.notFound('Route')
      next()
    } catch (err) {
      next(err)
    }
  }
}

/** Caller must be able to manage the route (system ADMIN, or org OWNER/ADMIN). */
export function requireRouteManage(param = 'id') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const allowed = await canManageRoute(req.user!.userId, req.user!.role, req.params[param])
      if (!allowed) throw AppError.notFound('Route')
      next()
    } catch (err) {
      next(err)
    }
  }
}

/** True when the caller may manage every route in the list (used for key sharing). */
export async function canManageAllRoutes(userId: string, role: string, routeIds: string[]): Promise<boolean> {
  for (const id of new Set(routeIds)) {
    if (!(await canManageRoute(userId, role, id))) return false
  }
  return true
}
