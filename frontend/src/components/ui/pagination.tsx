'use client'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAGE_SIZE_OPTIONS } from '@/hooks/usePageSize'

/**
 * Reusable pagination bar for table-style list pages.
 *
 * Shows "X–Y of Z" (zero-cost range over the visible page), a rows-per-page
 * Select wired to `onPageSizeChange`, and Previous / Next buttons. Hides the
 * Next/Previous controls when totalPages ≤ 1 so the bar still renders the
 * row-count + size toggle on small datasets.
 */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (p: number) => void
  onPageSizeChange?: (n: number) => void
  className?: string
}) {
  if (total <= 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border/50 ${className ?? ''}`}>
      <p className="text-xs text-muted-foreground">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Rows</span>
            <Select value={String(pageSize)} onValueChange={(v) => { onPageSizeChange(parseInt(v, 10)); onPageChange(1) }}>
              <SelectTrigger className="h-7 px-2 text-xs w-[70px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {totalPages > 1 && (
          <>
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
          </>
        )}
      </div>
    </div>
  )
}
