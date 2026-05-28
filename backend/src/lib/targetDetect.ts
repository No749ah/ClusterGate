// Heuristic + explicit detection of n8n targets. n8n chat/webhook endpoints
// reject requests without chatInput + sessionId, so connection tests inject them.

export function looksLikeN8n(targetUrl: string): boolean {
  try {
    const u = new URL(targetUrl)
    return /n8n/i.test(u.hostname) || u.pathname.includes('/webhook/')
  } catch {
    return false
  }
}

/**
 * Whether a target should be treated as n8n. An explicit N8N targetType always
 * wins; otherwise fall back to the URL heuristic.
 */
export function isN8nTarget(targetType: string | undefined, targetUrl: string): boolean {
  if (targetType === 'N8N') return true
  return looksLikeN8n(targetUrl)
}
