import { cn } from '@/lib/utils'
import { RequestLog } from '@/types'

const LABELS: Record<string, { label: string; title: string; tone: string }> = {
  TEST: {
    label: 'Test',
    title: 'Sent from the route test panel',
    tone: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  },
  HEALTH_CHECK: {
    label: 'Health',
    title: 'Health check or uptime monitor (detected by user agent)',
    tone: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  },
}

/** Marks test-panel runs and health-check probes in log lists; real traffic gets no badge. */
export function LogSourceBadge({ source, className }: { source?: RequestLog['source']; className?: string }) {
  const meta = source ? LABELS[source] : undefined
  if (!meta) return null
  return (
    <span
      title={meta.title}
      className={cn('inline-flex items-center px-1.5 py-px rounded border text-[10px] font-medium uppercase tracking-wide', meta.tone, className)}
    >
      {meta.label}
    </span>
  )
}
