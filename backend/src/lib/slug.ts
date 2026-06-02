/**
 * Convert a free-text name into a URL-safe slug:
 *   "My Cool Route!" -> "my-cool-route"
 *   "  Docs / API  " -> "docs-api"
 *
 * Returns `null` for inputs that have no slug-friendly characters at all so
 * callers can fall back to the underlying id.
 */
export function slugify(input: string | null | undefined): string | null {
  if (!input) return null
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
  return s || null
}

/**
 * Pick a slug that doesn't collide with `existing`. Adds -2, -3, … if needed.
 */
export function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base
  let i = 2
  while (existing.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

/** Cuid v1/v2 detection — used to decide id-vs-slug when resolving URLs. */
export function looksLikeCuid(value: string): boolean {
  // cuid v1: starts with 'c' and 25 chars lowercase alphanumeric
  // cuid v2: 24 lowercase letters/digits, may start with any letter
  return /^c[a-z0-9]{20,30}$/.test(value)
}
