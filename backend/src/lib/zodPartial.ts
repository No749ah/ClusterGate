import { z } from 'zod'

/**
 * Like `schema.partial()`, but without field defaults.
 *
 * Zod 4 applies `.default()` values even when the field is wrapped in
 * `.optional()`, so `schema.partial().parse({ name: 'x' })` fills in every
 * defaulted field. For PATCH/PUT update bodies that would silently reset
 * settings the client did not send, so omitted fields must stay undefined.
 */
export function partialUpdate<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape: Record<string, z.ZodType> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    shape[key] = stripDefault(field as z.ZodType).optional()
  }
  return z.object(shape) as unknown as ReturnType<z.ZodObject<T>['partial']>
}

function stripDefault(field: z.ZodType): z.ZodType {
  if (field instanceof z.ZodDefault) return stripDefault(field.unwrap() as z.ZodType)
  if (field instanceof z.ZodOptional) return stripDefault(field.unwrap() as z.ZodType)
  return field
}
