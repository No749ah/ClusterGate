import type { Router, Request, Response, NextFunction } from 'express'
import { looksLikeCuid } from '../lib/slug'
import { resolveRouteId } from '../services/routeService'

// Express param middleware that rewrites a slug in req.params[name] to the
// underlying route cuid before handlers run. Lets sub-resource routers
// (api-keys, targets, transforms, ...) accept the same friendly URL as the
// main /api/routes/:id endpoints without each service having to call
// findRouteByIdOrSlug.
export function attachRouteParamResolver(router: Router, name: string): void {
  router.param(name, async (req: Request, _res: Response, next: NextFunction, value: string) => {
    try {
      if (typeof value === 'string' && value && !looksLikeCuid(value)) {
        const real = await resolveRouteId(value)
        if (real) req.params[name] = real
      }
    } catch { /* fall through — handler will produce its own 404 */ }
    next()
  })
}
