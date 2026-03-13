'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ChangeRequest, ChangeRequestStatus } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import {
  GitPullRequest,
  Check,
  X,
  Clock,
  ChevronRight,
  Filter,
  Eye,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDistanceToNow, format } from 'date-fns'

const statusColors: Record<ChangeRequestStatus, string> = {
  PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  APPROVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
  APPLIED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

const statusIcons: Record<ChangeRequestStatus, React.ReactNode> = {
  PENDING: <Clock className="w-4 h-4 text-yellow-400" />,
  APPROVED: <Check className="w-4 h-4 text-green-400" />,
  REJECTED: <X className="w-4 h-4 text-red-400" />,
  APPLIED: <Check className="w-4 h-4 text-blue-400" />,
}

export default function ChangeRequestsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'ADMIN'
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedCR, setSelectedCR] = useState<ChangeRequest | null>(null)
  const [reviewComment, setReviewComment] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['change-requests', statusFilter, page],
    queryFn: () => api.changeRequests.list({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      pageSize: 20,
    }),
  })

  const detailQuery = useQuery({
    queryKey: ['change-request', selectedCR?.id],
    queryFn: () => api.changeRequests.getById(selectedCR!.id),
    enabled: !!selectedCR,
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => api.changeRequests.approve(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change-requests'] })
      queryClient.invalidateQueries({ queryKey: ['change-request'] })
      setSelectedCR(null)
      setReviewComment('')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => api.changeRequests.reject(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change-requests'] })
      queryClient.invalidateQueries({ queryKey: ['change-request'] })
      setSelectedCR(null)
      setReviewComment('')
    },
  })

  const changeRequests = data?.data || []
  const cr = detailQuery.data?.data || selectedCR

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Change Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and approve route configuration changes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="APPLIED">Applied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* CR List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
      ) : changeRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <GitPullRequest className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">No change requests</p>
          <p className="text-sm mt-1">Change requests appear when organizations have approval workflows enabled</p>
        </div>
      ) : (
        <div className="space-y-3">
          {changeRequests.map((cr) => (
            <button
              key={cr.id}
              onClick={() => setSelectedCR(cr)}
              className="w-full text-left rounded-lg border border-border bg-card p-4 hover:bg-card/80 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{statusIcons[cr.status]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{cr.title}</span>
                    <Badge variant="outline" className={statusColors[cr.status]}>{cr.status}</Badge>
                    <Badge variant="outline" className="bg-muted/50 text-xs">{cr.type}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {cr.requestedBy?.name || 'Unknown'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(cr.createdAt), { addSuffix: true })}
                    </span>
                    {cr.route && (
                      <span className="truncate">{cr.route.name}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      {/* CR Detail Dialog */}
      <Dialog open={!!selectedCR} onOpenChange={(open) => { if (!open) { setSelectedCR(null); setReviewComment('') } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {cr && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <GitPullRequest className="w-5 h-5" />
                  {cr.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={statusColors[cr.status]}>{cr.status}</Badge>
                  <Badge variant="outline" className="bg-muted/50">{cr.type}</Badge>
                  {cr.route && <Badge variant="outline">{cr.route.name}</Badge>}
                </div>

                {cr.description && (
                  <p className="text-sm text-muted-foreground">{cr.description}</p>
                )}

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Requested by: {cr.requestedBy?.name} ({cr.requestedBy?.email})</p>
                  <p>Created: {format(new Date(cr.createdAt), 'MMM d, yyyy HH:mm')}</p>
                  {cr.reviewedBy && (
                    <p>Reviewed by: {cr.reviewedBy.name} at {format(new Date(cr.reviewedAt!), 'MMM d, yyyy HH:mm')}</p>
                  )}
                  {cr.reviewComment && (
                    <p className="mt-2 p-2 bg-muted/30 rounded text-sm">Review comment: {cr.reviewComment}</p>
                  )}
                </div>

                {/* Diff / Payload view */}
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Proposed Changes
                  </h3>
                  {cr.diff ? (
                    <div className="space-y-1.5 bg-muted/20 rounded-lg p-3 text-xs font-mono max-h-60 overflow-y-auto">
                      {Object.entries(cr.diff).map(([key, change]: [string, any]) => (
                        <div key={key} className="flex gap-2">
                          <span className="text-muted-foreground min-w-[120px]">{key}:</span>
                          {change?.from !== undefined ? (
                            <span>
                              <span className="text-red-400 line-through">{JSON.stringify(change.from)}</span>
                              {' → '}
                              <span className="text-green-400">{JSON.stringify(change.to)}</span>
                            </span>
                          ) : (
                            <span className="text-green-400">{JSON.stringify(change)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="bg-muted/20 rounded-lg p-3 text-xs font-mono max-h-60 overflow-y-auto">
                      {JSON.stringify(cr.payload, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Review actions */}
                {isAdmin && cr.status === 'PENDING' && (
                  <div className="border-t border-border pt-4 space-y-3">
                    <Input
                      placeholder="Review comment (optional)"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => approveMutation.mutate({ id: cr.id, comment: reviewComment || undefined })}
                        disabled={approveMutation.isPending}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Approve & Apply
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => rejectMutation.mutate({ id: cr.id, comment: reviewComment || undefined })}
                        disabled={rejectMutation.isPending}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
