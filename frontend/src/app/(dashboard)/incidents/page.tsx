'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Incident, IncidentStatus, IncidentSeverity } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import {
  AlertTriangle,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Route,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

const severityColors: Record<IncidentSeverity, string> = {
  LOW: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  MEDIUM: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const statusIcons: Record<IncidentStatus, React.ReactNode> = {
  ACTIVE: <AlertCircle className="w-4 h-4 text-red-400" />,
  INVESTIGATING: <Search className="w-4 h-4 text-yellow-400" />,
  RESOLVED: <CheckCircle2 className="w-4 h-4 text-green-400" />,
}

const statusColors: Record<IncidentStatus, string> = {
  ACTIVE: 'bg-red-500/10 text-red-400 border-red-500/20',
  INVESTIGATING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  RESOLVED: 'bg-green-500/10 text-green-400 border-green-500/20',
}

export default function IncidentsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OPERATOR'
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', description: '', severity: 'MEDIUM' as string })
  const [noteForm, setNoteForm] = useState({ title: '', description: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', statusFilter, page],
    queryFn: () => api.incidents.list({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      pageSize: 20,
    }),
  })

  const detailQuery = useQuery({
    queryKey: ['incident', selectedIncident?.id],
    queryFn: () => api.incidents.getById(selectedIncident!.id),
    enabled: !!selectedIncident,
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.incidents.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['incident'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description?: string; severity?: string }) => api.incidents.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      setCreateOpen(false)
      setCreateForm({ title: '', description: '', severity: 'MEDIUM' })
    },
  })

  const addEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { type: string; title: string; description?: string } }) =>
      api.incidents.addEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident'] })
      setNoteForm({ title: '', description: '' })
    },
  })

  const incidents = data?.data || []
  const incident = detailQuery.data?.data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor and manage service incidents</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Incident
          </Button>
        )}
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
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INVESTIGATING">Investigating</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Incident List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">No incidents</p>
          <p className="text-sm mt-1">All systems operational</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <button
              key={inc.id}
              onClick={() => setSelectedIncident(inc)}
              className="w-full text-left rounded-lg border border-border bg-card p-4 hover:bg-card/80 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{statusIcons[inc.status]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{inc.title}</span>
                    <Badge variant="outline" className={severityColors[inc.severity]}>
                      {inc.severity}
                    </Badge>
                    <Badge variant="outline" className={statusColors[inc.status]}>
                      {inc.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(inc.startedAt), { addSuffix: true })}
                    </span>
                    {inc.route && (
                      <span className="flex items-center gap-1">
                        <Route className="w-3 h-3" />
                        {inc.route.name}
                      </span>
                    )}
                    {inc._count && (
                      <span>{inc._count.events} events</span>
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Incident Detail Dialog */}
      <Dialog open={!!selectedIncident} onOpenChange={(open) => !open && setSelectedIncident(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {incident && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {statusIcons[incident.status]}
                  {incident.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status & actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={severityColors[incident.severity]}>{incident.severity}</Badge>
                  <Badge variant="outline" className={statusColors[incident.status]}>{incident.status}</Badge>
                  {incident.route && (
                    <Badge variant="outline" className="bg-muted/50">
                      <Route className="w-3 h-3 mr-1" />
                      {incident.route.name}
                    </Badge>
                  )}
                  <div className="flex-1" />
                  {isAdmin && incident.status !== 'RESOLVED' && (
                    <div className="flex gap-2">
                      {incident.status === 'ACTIVE' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: incident.id, status: 'INVESTIGATING' })}
                        >
                          Investigate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: incident.id, status: 'RESOLVED' })}
                      >
                        Resolve
                      </Button>
                    </div>
                  )}
                </div>

                {incident.description && (
                  <p className="text-sm text-muted-foreground">{incident.description}</p>
                )}

                <div className="text-xs text-muted-foreground flex gap-4">
                  <span>Started: {format(new Date(incident.startedAt), 'MMM d, yyyy HH:mm')}</span>
                  {incident.resolvedAt && (
                    <span>Resolved: {format(new Date(incident.resolvedAt), 'MMM d, yyyy HH:mm')}</span>
                  )}
                </div>

                {/* Timeline */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Timeline</h3>
                  <div className="space-y-0">
                    {(incident.events || []).map((event, i) => (
                      <div key={event.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                          {i < (incident.events?.length || 0) - 1 && (
                            <div className="w-px flex-1 bg-border mt-1" />
                          )}
                        </div>
                        <div className="pb-4 flex-1 min-w-0">
                          <p className="text-sm font-medium">{event.title}</p>
                          {event.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(event.createdAt), 'MMM d, HH:mm:ss')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add note */}
                {isAdmin && incident.status !== 'RESOLVED' && (
                  <div className="border-t border-border pt-4">
                    <h3 className="text-sm font-medium mb-2">Add Note</h3>
                    <div className="space-y-2">
                      <Input
                        placeholder="Note title"
                        value={noteForm.title}
                        onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                      />
                      <Input
                        placeholder="Description (optional)"
                        value={noteForm.description}
                        onChange={(e) => setNoteForm({ ...noteForm, description: e.target.value })}
                      />
                      <Button
                        size="sm"
                        disabled={!noteForm.title}
                        onClick={() => addEventMutation.mutate({
                          id: incident.id,
                          data: { type: 'manual_note', title: noteForm.title, description: noteForm.description || undefined },
                        })}
                      >
                        Add Note
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Incident Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Incident title"
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
            />
            <Input
              placeholder="Description (optional)"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            />
            <Select value={createForm.severity} onValueChange={(v) => setCreateForm({ ...createForm, severity: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!createForm.title || createMutation.isPending}
              onClick={() => createMutation.mutate({
                title: createForm.title,
                description: createForm.description || undefined,
                severity: createForm.severity,
              })}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
