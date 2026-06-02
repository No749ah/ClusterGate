'use client'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAGE_SIZE_OPTIONS } from '@/hooks/usePageSize'

/**
 * Single source of truth for list pagination across the dashboard.
 *
 * Layout (3-column grid so widths don't shift as you page through):
 *   [ Showing X–Y of Z ]   [ First Prev 1 … N Next Last ]   [ N / page ▼ ]
 *
 * The page-number window is centred on the current page and shows up to
 * `maxVisible` (default 5) buttons. First/Last + Prev/Next are always
 * present so a single click jumps to the ends of long datasets.
 */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  className,
  maxVisible = 5,
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (p: number) => void
  onPageSizeChange?: (n: number) => void
  className?: string
  maxVisible?: number
}) {
  if (total <= 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const pages: number[] = []
  let start = Math.max(1, page - Math.floor(maxVisible / 2))
  const end = Math.min(totalPages, start + maxVisible - 1)
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div className={`grid grid-cols-3 items-center gap-3 px-4 py-3 border-t border-border/50 ${className ?? ''}`}>
      <p className="text-xs text-muted-foreground justify-self-start">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-1 justify-self-center">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 1} onClick={() => onPageChange(1)}>First</Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Prev</Button>
          {pages.map((p) => (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="sm"
              className="h-7 w-7 px-0 text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === totalPages} onClick={() => onPageChange(totalPages)}>Last</Button>
        </div>
      ) : <div />}
      {onPageSizeChange ? (
        <Select value={String(pageSize)} onValueChange={(v) => { onPageSizeChange(parseInt(v, 10)); onPageChange(1) }}>
          <SelectTrigger className="h-7 px-2 text-xs w-24 justify-self-end"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : <div />}
    </div>
  )
}
