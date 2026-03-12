import { Prisma, TransformPhase, TransformType, TransformRule } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

/**
 * Apply request-phase transformations before forwarding the proxy request.
 */
export function applyRequestTransforms(
  rules: TransformRule[],
  headers: Record<string, string>,
  queryParams: Record<string, string>,
  body: any
): { headers: Record<string, string>; queryParams: Record<string, string>; body: any } {
  const requestRules = rules
    .filter((r) => r.phase === 'REQUEST' && r.isActive)
    .sort((a, b) => a.order - b.order)

  for (const rule of requestRules) {
    const config = rule.config as Record<string, any>

    // Check condition if present
    if (rule.condition && !evaluateCondition(rule.condition as Record<string, any>, headers, queryParams)) {
      continue
    }

    switch (rule.type) {
      case 'SET_HEADER':
        if (config.key && config.value !== undefined) {
          headers[config.key] = config.value
        }
        break
      case 'REMOVE_HEADER':
        if (config.key) {
          delete headers[config.key]
          delete headers[config.key.toLowerCase()]
        }
        break
      case 'SET_QUERY_PARAM':
        if (config.key && config.value !== undefined) {
          queryParams[config.key] = config.value
        }
        break
      case 'REMOVE_QUERY_PARAM':
        if (config.key) {
          delete queryParams[config.key]
        }
        break
      case 'REWRITE_BODY_JSON':
        if (body && typeof body === 'object' && config.path && config.value !== undefined) {
          setNestedValue(body, config.path, config.value)
        }
        break
    }
  }

  return { headers, queryParams, body }
}

/**
 * Apply response-phase transformations before returning the response to the client.
 */
export function applyResponseTransforms(
  rules: TransformRule[],
  statusCode: number,
  headers: Record<string, string>,
  body: Buffer
): { statusCode: number; headers: Record<string, string>; body: Buffer } {
  const responseRules = rules
    .filter((r) => r.phase === 'RESPONSE' && r.isActive)
    .sort((a, b) => a.order - b.order)

  for (const rule of responseRules) {
    const config = rule.config as Record<string, any>

    switch (rule.type) {
      case 'SET_HEADER':
        if (config.key && config.value !== undefined) {
          headers[config.key] = config.value
        }
        break
      case 'REMOVE_HEADER':
        if (config.key) {
          delete headers[config.key]
          delete headers[config.key.toLowerCase()]
        }
        break
      case 'MAP_STATUS_CODE':
        if (config.from && config.to && statusCode === Number(config.from)) {
          statusCode = Number(config.to)
        }
        break
      case 'REWRITE_BODY_JSON':
        try {
          const bodyStr = body.toString('utf8')
          const json = JSON.parse(bodyStr)
          if (config.path && config.value !== undefined) {
            setNestedValue(json, config.path, config.value)
          }
          body = Buffer.from(JSON.stringify(json), 'utf8')
        } catch {
          // Not JSON, skip
        }
        break
    }
  }

  return { statusCode, headers, body }
}

function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.')
  let current = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {}
    }
    current = current[parts[i]]
  }
  current[parts[parts.length - 1]] = value
}

function evaluateCondition(
  condition: Record<string, any>,
  headers: Record<string, string>,
  queryParams: Record<string, string>
): boolean {
  // Simple condition: { header: { key: "X-Test", value: "true" } }
  if (condition.header) {
    const headerVal = headers[condition.header.key] || headers[condition.header.key?.toLowerCase()]
    return headerVal === condition.header.value
  }
  // Simple condition: { queryParam: { key: "debug", value: "true" } }
  if (condition.queryParam) {
    return queryParams[condition.queryParam.key] === condition.queryParam.value
  }
  return true
}

// ============================================================================
// CRUD for transform rules
// ============================================================================

export async function getTransformRules(routeId: string) {
  return prisma.transformRule.findMany({
    where: { routeId },
    orderBy: [{ phase: 'asc' }, { order: 'asc' }],
  })
}

export async function createTransformRule(routeId: string, data: {
  phase: TransformPhase
  type: TransformType
  name: string
  config: Record<string, any>
  order?: number
  isActive?: boolean
  condition?: Record<string, any> | null
}) {
  return prisma.transformRule.create({
    data: {
      routeId,
      phase: data.phase,
      type: data.type,
      name: data.name,
      config: data.config,
      order: data.order ?? 0,
      isActive: data.isActive ?? true,
      condition: data.condition === null ? Prisma.DbNull : (data.condition ?? undefined),
    },
  })
}

export async function updateTransformRule(ruleId: string, data: {
  phase?: TransformPhase
  type?: TransformType
  name?: string
  config?: Record<string, any>
  order?: number
  isActive?: boolean
  condition?: Record<string, any> | null
}) {
  const { condition, ...rest } = data
  const updateData: any = { ...rest }
  if (condition === null) {
    updateData.condition = Prisma.DbNull
  } else if (condition !== undefined) {
    updateData.condition = condition
  }
  return prisma.transformRule.update({
    where: { id: ruleId },
    data: updateData,
  })
}

export async function deleteTransformRule(ruleId: string) {
  return prisma.transformRule.delete({
    where: { id: ruleId },
  })
}
