'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { Pagination } from '@/components/ui/pagination'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Plus,
  Search,
  MoreHorizontal,
  Play,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Trash2,
  Edit,
  Eye,
  Filter,
  Power,
  PowerOff,
  Building2,
  Terminal,
  FileDown,
  Tag as TagIcon,
  Layers,
  Upload,
  Archive,
  KeyRound,
  Loader2,
  Folder,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Pencil,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRoutes, usePublishRoute, useDeactivateRoute, useDuplicateRoute, useDeleteRoute, useBulkPublish, useBulkDeactivate, useBulkUpdate, useBulkDelete } from '@/hooks/useRoutes'
import { useAuth } from '@/hooks/useAuth'
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder, useAssignRoutesToFolder, useRemoveRouteFromFolder } from '@/hooks/useFolders'
import { api } from '@/lib/api'
import { RouteStatusBadge } from '@/components/routes/RouteStatusBadge'
import { EnvironmentBadge } from '@/components/routes/EnvironmentBadge'
import { HealthIndicator } from '@/components/routes/HealthIndicator'
import { CircuitBreakerBadge } from '@/components/routes/CircuitBreakerBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { formatRelativeTime, copyToClipboard } from '@/lib/utils'
import { useProxyOrigin } from '@/hooks/useProxyOrigin'
import { routeUrl, routeEdit } from '@/lib/urls'
import { toExportConfig, prepareForPaste, parseConfigs, buildCurl, downloadJson } from '@/lib/routeExport'
import { Route, RouteStatus, Environment, RouteFolder } from '@/types'

const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-500 bg-green-500/10 border-green-500/20',
  POST: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  PUT: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  PATCH: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  DELETE: 'text-red-500 bg-red-500/10 border-red-500/20',
  HEAD: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
}

function MethodBadge({ method }: { method: string }) {
  const color = HTTP_METHOD_COLORS[method] ?? 'text-muted-foreground bg-muted border-border'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium border ${color}`}>
      {method}
    </span>
  )
}

const METHOD_PRIORITY = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

// Show the 3 most common methods; collapse the rest behind a clickable "+N".
function MethodBadges({ methods }: { methods: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...methods].sort((a, b) => {
    const ia = METHOD_PRIORITY.indexOf(a), ib = METHOD_PRIORITY.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const shown = expanded ? sorted : sorted.slice(0, 3)
  const hidden = sorted.length - shown.length
  return (
    <div className="flex gap-1 flex-wrap items-center">
      {shown.map((m) => <MethodBadge key={m} method={m} />)}
      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpanded(true) }}
          title={sorted.slice(3).join(', ')}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          +{hidden}
        </button>
      )}
    </div>
  )
}

export default function RoutesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  // Filter / pagination state lives in the URL so the view is bookmarkable,
  // shareable and survives the browser back button.
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const search = searchParams.get('q') ?? ''
  const statusFilter = (searchParams.get('status') ?? 'ALL') as RouteStatus | 'ALL'
  const orgFilter = searchParams.get('org') ?? 'ALL'
  const tagFilter = searchParams.get('tag') ?? 'ALL'
  const envFilter = (searchParams.get('env') ?? 'ALL') as Environment | 'ALL'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const [pageSize, setPageSize] = usePageSize('routes', 20)

  const updateParams = (patch: Record<string, string | null>, opts?: { resetPage?: boolean }) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === 'ALL') next.delete(k)
      else next.set(k, v)
    }
    if (opts?.resetPage) next.delete('page')
    const qs = next.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }
  const setSearch = (v: string) => updateParams({ q: v || null }, { resetPage: true })
  const setStatusFilter = (v: string) => updateParams({ status: v === 'ALL' ? null : v }, { resetPage: true })
  const setOrgFilter = (v: string) => updateParams({ org: v === 'ALL' ? null : v }, { resetPage: true })
  const setTagFilter = (v: string) => updateParams({ tag: v === 'ALL' ? null : v }, { resetPage: true })
  const setEnvFilter = (v: string) => updateParams({ env: v === 'ALL' ? null : v }, { resetPage: true })
  const setPage = (p: number | ((prev: number) => number)) => {
    const value = typeof p === 'function' ? (p as (n: number) => number)(page) : p
    updateParams({ page: value > 1 ? String(value) : null })
  }
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // Group key: one API key valid for every selected route
  const [groupKeyOpen, setGroupKeyOpen] = useState(false)
  const [groupKeyName, setGroupKeyName] = useState('')
  const [groupKeyExpiry, setGroupKeyExpiry] = useState('180')
  const [groupKeyScope, setGroupKeyScope] = useState<'READ' | 'FULL'>('FULL')
  const [groupKeyOwner, setGroupKeyOwner] = useState('')
  const [groupKeyPending, setGroupKeyPending] = useState(false)
  const [groupKeyResult, setGroupKeyResult] = useState<{ key: string; count: number } | null>(null)
  const [groupKeyCopied, setGroupKeyCopied] = useState(false)
  // Folders: organisation of routes in the list + drag & drop targets
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderEditing, setFolderEditing] = useState<RouteFolder | null>(null)
  const [folderNameInput, setFolderNameInput] = useState('')
  const [folderOrgInput, setFolderOrgInput] = useState('__none__')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragIdsRef = useRef<string[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: orgsData } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.organizations.list(),
  })
  const userOrgs = orgsData?.data ?? []

  const { data: groupsData } = useQuery({
    queryKey: ['route-groups'],
    queryFn: () => api.routeGroups.list(),
  })
  const groups = groupsData?.data ?? []

  const { data: foldersData } = useFolders()
  const createFolder = useCreateFolder()
  const updateFolder = useUpdateFolder()
  const deleteFolder = useDeleteFolder()
  const assignRoutes = useAssignRoutesToFolder()
  const removeRoute = useRemoveRouteFromFolder()

  // Fetch all routes (no tag filter) to extract unique tags for the filter dropdown
  const { data: allRoutesData } = useRoutes({ pageSize: 200 })
  const allTags = Array.from(
    new Set((allRoutesData?.data ?? []).flatMap((r) => r.tags))
  ).sort()

  const { data, isLoading } = useRoutes({
    search: search || undefined,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    tags: tagFilter !== 'ALL' ? [tagFilter] : undefined,
    environment: envFilter !== 'ALL' ? envFilter : undefined,
    organizationId: orgFilter !== 'ALL' ? orgFilter : undefined,
    page,
    pageSize,
  })

  const confirm = useConfirm()
  const publish = usePublishRoute()
  const deactivate = useDeactivateRoute()
  const duplicate = useDuplicateRoute()
  const deleteRoute = useDeleteRoute()
  const bulkPublish = useBulkPublish()
  const bulkDeactivate = useBulkDeactivate()
  const bulkUpdate = useBulkUpdate()
  const bulkDelete = useBulkDelete()

  const routes = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const canEdit = user?.role === 'ADMIN' || user?.role === 'OPERATOR'

  const allSelected = routes.length > 0 && routes.every(r => selectedIds.has(r.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(routes.map(r => r.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    const ok = await confirm({
      title: 'Delete Routes',
      description: `Are you sure you want to delete ${ids.length} route(s)? This action cannot be undone.`,
      confirmLabel: 'Delete All',
      variant: 'destructive',
    })
    if (ok) {
      bulkDelete.mutate(ids, { onSuccess: () => setSelectedIds(new Set()) })
    }
  }

  // Copy the selected routes' configs to the clipboard as JSON (Ctrl/Cmd+C).
  async function copySelectedConfigs() {
    const chosen = routes.filter((r) => selectedIds.has(r.id))
    if (chosen.length === 0) return
    await copyToClipboard(JSON.stringify(chosen.map(toExportConfig), null, 2))
    toast.success(`Copied ${chosen.length} route config${chosen.length === 1 ? '' : 's'} to clipboard`)
  }

  // Create routes from JSON route configs on the clipboard (Ctrl/Cmd+V).
  async function pasteConfigs() {
    if (!canEdit) return
    let text = ''
    try { text = await navigator.clipboard.readText() } catch { return }
    const configs = parseConfigs(text)
    if (!configs) return
    const ok = await confirm({
      title: 'Paste routes',
      description: `Create ${configs.length} new draft route(s) from the clipboard? Each gets a unique path and "(copy)" name.`,
      confirmLabel: 'Create',
    })
    if (!ok) return
    const res = await api.routes.import(prepareForPaste(configs))
    const { created, errors } = res.data
    if (created > 0) toast.success(`Created ${created} route(s)`)
    if (errors?.length) toast.error(`${errors.length} failed: ${errors[0]}`)
    queryClient.invalidateQueries({ queryKey: ['routes'] })
  }

  // Global keyboard shortcuts for the routes list. Ignored while typing.
  useEffect(() => {
    function isTyping(el: EventTarget | null): boolean {
      const node = el as HTMLElement | null
      if (!node) return false
      const tag = node.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable
    }
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      // Ctrl/Cmd+K opens the shortcuts cheat-sheet (works from anywhere)
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setShortcutsOpen((v) => !v); return
      }
      // Ctrl/Cmd combos work even from inputs (except they're native there)
      if (mod && e.key.toLowerCase() === 'c' && someSelected && !isTyping(e.target)) {
        e.preventDefault(); copySelectedConfigs(); return
      }
      if (mod && e.key.toLowerCase() === 'v' && !isTyping(e.target)) {
        e.preventDefault(); pasteConfigs(); return
      }
      if (mod && e.key.toLowerCase() === 'a' && !isTyping(e.target) && routes.length > 0) {
        e.preventDefault(); setSelectedIds(new Set(routes.map((r) => r.id))); return
      }
      if (isTyping(e.target)) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (e.key === 'n') { e.preventDefault(); router.push('/routes/new'); return }
      if (e.key === 'Escape' && someSelected) { e.preventDefault(); setSelectedIds(new Set()); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && someSelected && canEdit) { e.preventDefault(); handleBulkDelete(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, someSelected, canEdit])

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    try {
      const text = await file.text()
      const configs = parseConfigs(text)
      if (!configs) {
        toast.error('File does not contain valid route configurations')
        return
      }
      const ok = await confirm({
        title: 'Import routes',
        description: `Import ${configs.length} route(s) from "${file.name}" as new drafts? Each gets a unique path and "(copy)" name.`,
        confirmLabel: 'Import',
      })
      if (!ok) return
      const res = await api.routes.import(prepareForPaste(configs))
      const { created, errors } = res.data
      if (created > 0) toast.success(`Imported ${created} route(s)`)
      if (errors?.length) toast.error(`${errors.length} failed: ${errors[0]}`)
      queryClient.invalidateQueries({ queryKey: ['routes'] })
    } catch (err: any) {
      toast.error(err.message || 'Import failed')
    }
  }

  function applyBulk(patch: { environment?: string; routeGroupId?: string | null; addTags?: string[] }) {
    bulkUpdate.mutate({ ids: Array.from(selectedIds), patch }, { onSuccess: () => setSelectedIds(new Set()) })
  }

  async function bulkAddTag() {
    const tag = window.prompt('Add a tag to the selected routes:')?.trim()
    if (tag) applyBulk({ addTags: [tag] })
  }

  // ---- Folders -------------------------------------------------------------
  const isAdmin = user?.role === 'ADMIN'
  const allFolders: RouteFolder[] = foldersData?.data ?? []
  // With an org filter active only that org's folders (and global ones) are drop targets
  const folders = orgFilter === 'ALL' ? allFolders : allFolders.filter((f) => !f.organizationId || f.organizationId === orgFilter)
  const folderById = new Map(folders.map((f) => [f.id, f]))
  const UNSORTED = '__unsorted__'
  // The current page grouped into folder sections; routes whose folder is not
  // visible (other org filter) fall back to "Unsorted".
  const sections: { id: string; folder: RouteFolder | null; routes: Route[] }[] = folders.length === 0
    ? []
    : [
        ...folders.map((f) => ({ id: f.id, folder: f, routes: routes.filter((r) => r.folderId === f.id) })),
        { id: UNSORTED, folder: null, routes: routes.filter((r) => !r.folderId || !folderById.has(r.folderId)) },
      ]
  const orgName = (id: string | null | undefined) => userOrgs.find((o: any) => o.id === id)?.name ?? null

  function toggleCollapsed(id: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSection(sectionRoutes: Route[]) {
    const all = sectionRoutes.length > 0 && sectionRoutes.every((r) => selectedIds.has(r.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of sectionRoutes) {
        if (all) next.delete(r.id)
        else next.add(r.id)
      }
      return next
    })
  }

  const lookupRoute = (id: string) => routes.find((r) => r.id === id) ?? (allRoutesData?.data ?? []).find((r) => r.id === id)

  // Move routes into a folder (or out of any folder when folderId is null).
  async function moveRoutesToFolder(folderId: string | null, ids: string[]) {
    if (ids.length === 0) return
    try {
      if (folderId) {
        const toMove = ids.filter((id) => lookupRoute(id)?.folderId !== folderId)
        if (toMove.length === 0) return
        await assignRoutes.mutateAsync({ folderId, routeIds: toMove })
        toast.success(`Moved ${toMove.length} route${toMove.length === 1 ? '' : 's'} to "${folderById.get(folderId)?.name ?? 'folder'}"`)
      } else {
        const toRemove = ids.map(lookupRoute).filter((r): r is Route => !!r?.folderId)
        if (toRemove.length === 0) return
        await Promise.all(toRemove.map((r) => removeRoute.mutateAsync({ folderId: r.folderId!, routeId: r.id })))
        toast.success(`Removed ${toRemove.length} route${toRemove.length === 1 ? '' : 's'} from folder`)
      }
      setSelectedIds(new Set())
    } catch {
      // error toast comes from the mutation hook
    }
  }

  // HTML5 drag & drop: dragging a selected row carries the whole selection.
  function onRowDragStart(e: React.DragEvent<HTMLTableRowElement>, route: Route) {
    const ids = selectedIds.has(route.id) ? Array.from(selectedIds) : [route.id]
    dragIdsRef.current = ids
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ids.join(','))
    setDragging(true)
  }
  function onRowDragEnd() {
    dragIdsRef.current = []
    setDragging(false)
    setDragOver(null)
  }
  function dropTargetProps(target: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (dragIdsRef.current.length === 0) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (dragOver !== target) setDragOver(target)
      },
      onDragLeave: () => setDragOver((cur) => (cur === target ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        const ids = dragIdsRef.current
        onRowDragEnd()
        moveRoutesToFolder(target === UNSORTED ? null : target, ids)
      },
    }
  }

  function openFolderDialog(folder?: RouteFolder) {
    setFolderEditing(folder ?? null)
    setFolderNameInput(folder?.name ?? '')
    setFolderOrgInput(folder?.organizationId ?? (orgFilter !== 'ALL' ? orgFilter : (!isAdmin && userOrgs[0]?.id) || '__none__'))
    setFolderDialogOpen(true)
  }

  async function submitFolder() {
    const name = folderNameInput.trim()
    if (!name) return
    try {
      if (folderEditing) {
        await updateFolder.mutateAsync({ id: folderEditing.id, name })
      } else {
        await createFolder.mutateAsync({ name, organizationId: folderOrgInput === '__none__' ? null : folderOrgInput })
      }
      setFolderDialogOpen(false)
    } catch {
      // toast from hook
    }
  }

  async function handleDeleteFolder(folder: RouteFolder) {
    const ok = await confirm({
      title: 'Delete folder',
      description: `Delete "${folder.name}"? Its ${folder.routeCount} route(s) stay and become unsorted.${folder.keyCount > 0 ? ` ${folder.keyCount} API key(s) bound to this folder lose access to these routes.` : ''}`,
      confirmLabel: 'Delete folder',
      variant: 'destructive',
    })
    if (ok) deleteFolder.mutate(folder.id)
  }
  const folderPending = createFolder.isPending || updateFolder.isPending

  const bulkPending = bulkPublish.isPending || bulkDeactivate.isPending || bulkUpdate.isPending || bulkDelete.isPending

  const openGroupKeyDialog = () => {
    setGroupKeyOwner(Array.from(selectedIds)[0] ?? '')
    setGroupKeyName('')
    setGroupKeyResult(null)
    setGroupKeyOpen(true)
  }

  // The key is created on the chosen owner route (where it is managed) and
  // shared with every other selected route.
  async function generateGroupKey() {
    const ids = Array.from(selectedIds)
    const ownerId = ids.includes(groupKeyOwner) ? groupKeyOwner : ids[0]
    if (!ownerId) return
    setGroupKeyPending(true)
    try {
      const res = await api.apiKeys.create(ownerId, {
        name: groupKeyName.trim(),
        expiresAt: groupKeyExpiry !== '0' ? new Date(Date.now() + parseInt(groupKeyExpiry) * 86400000).toISOString() : undefined,
        scope: groupKeyScope,
        routeIds: ids.filter((id) => id !== ownerId),
      })
      setGroupKeyResult({ key: res.data.key, count: ids.length })
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      toast.success(`Group key created for ${ids.length} routes`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create group key')
    } finally {
      setGroupKeyPending(false)
    }
  }
  const selectedRouteName = (id: string) => (allRoutesData?.data ?? routes).find((r) => r.id === id)?.name ?? routes.find((r) => r.id === id)?.name ?? id

  const renderRow = (route: Route) => (
    <RouteRow
      key={route.id}
      route={route}
      selected={selectedIds.has(route.id)}
      onToggle={() => toggleOne(route.id)}
      onPublish={() => publish.mutate(route.id)}
      onDeactivate={() => deactivate.mutate(route.id)}
      onDuplicate={() => duplicate.mutate(route.id)}
      onDelete={async () => {
        if (route.isActive) {
          toast.error('Deactivate this route before deleting it')
          return
        }
        if (route.protected) {
          const ok = await confirm({
            title: 'Delete protected route',
            description: `"${route.name}" is protected (production). This action cannot be undone.`,
            confirmLabel: 'Delete',
            variant: 'destructive',
            requireText: route.name,
          })
          if (ok) deleteRoute.mutate({ id: route.id, confirm: route.name })
          return
        }
        const ok = await confirm({
          title: 'Delete Route',
          description: `Are you sure you want to delete "${route.name}"? This action cannot be undone.`,
          confirmLabel: 'Delete',
          variant: 'destructive',
        })
        if (ok) deleteRoute.mutate(route.id)
      }}
      isLoading={publish.isPending || deactivate.isPending}
      draggable={canEdit && folders.length > 0}
      isDragSource={dragging && dragIdsRef.current.includes(route.id)}
      onDragStart={(e) => onRowDragStart(e, route)}
      onDragEnd={onRowDragEnd}
    />
  )

  return (
    <div className="space-y-6">
      {/* Header — sticks to the top of the viewport while scrolling long lists */}
      <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 -mt-4 md:-mt-6 pt-4 md:pt-6 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Routes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} route{total !== 1 ? 's' : ''} configured
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
          {canEdit && (
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" asChild title="View archived routes">
              <Link href="/routes/archived">
                <Archive className="w-4 h-4 mr-2" />
                Archived
              </Link>
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => openFolderDialog()} title="Group routes into folders — folders can also be bound to API keys">
              <FolderPlus className="w-4 h-4 mr-2" />
              New folder
            </Button>
          )}
          <Button asChild>
            <Link href="/routes/new">
              <Plus className="w-4 h-4 mr-2" />
              New Route
            </Link>
          </Button>
        </div>
      </div>

      {/* Bulk Toolbar */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-3 bg-muted/50 border border-border/50 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                bulkPublish.mutate(Array.from(selectedIds), { onSuccess: () => setSelectedIds(new Set()) })
              }}
              disabled={bulkPending}
            >
              <Power className="w-3.5 h-3.5 mr-1.5" />
              Publish
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                bulkDeactivate.mutate(Array.from(selectedIds), { onSuccess: () => setSelectedIds(new Set()) })
              }}
              disabled={bulkPending}
            >
              <PowerOff className="w-3.5 h-3.5 mr-1.5" />
              Deactivate
            </Button>
            {/* Set environment for all selected */}
            <Select value="" onValueChange={(v) => applyBulk({ environment: v })}>
              <SelectTrigger className="h-8 w-[130px]" disabled={bulkPending}>
                <Layers className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Set env" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">None</SelectItem>
                <SelectItem value="PRODUCTION">Production</SelectItem>
                <SelectItem value="STAGING">Staging</SelectItem>
                <SelectItem value="DEVELOPMENT">Development</SelectItem>
              </SelectContent>
            </Select>
            {groups.length > 0 && (
              <Select value="" onValueChange={(v) => applyBulk({ routeGroupId: v === '__none__' ? null : v })}>
                <SelectTrigger className="h-8 w-[140px]" disabled={bulkPending}>
                  <Building2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Move to group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No group</SelectItem>
                  {groups.map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {allFolders.length > 0 && (
              <Select value="" onValueChange={(v) => moveRoutesToFolder(v === '__none__' ? null : v, Array.from(selectedIds))}>
                <SelectTrigger className="h-8 w-[150px]" disabled={bulkPending || assignRoutes.isPending || removeRoute.isPending}>
                  <Folder className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Move to folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No folder</SelectItem>
                  {allFolders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={bulkAddTag} disabled={bulkPending}>
              <TagIcon className="w-3.5 h-3.5 mr-1.5" />
              Add tag
            </Button>
            <Button size="sm" variant="outline" onClick={copySelectedConfigs} disabled={bulkPending} title="Copy configs (Ctrl/Cmd+C)">
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copy
            </Button>
            {selectedIds.size >= 2 && (
              <Button size="sm" variant="outline" onClick={openGroupKeyDialog} disabled={bulkPending} title="One API key valid for all selected routes">
                <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                Group key
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Group key dialog — one API key for all selected routes */}
      <Dialog open={groupKeyOpen} onOpenChange={(open) => { setGroupKeyOpen(open); if (!open) setGroupKeyResult(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate group key</DialogTitle>
            <DialogDescription>
              One API key that authenticates on all {selectedIds.size} selected routes.
            </DialogDescription>
          </DialogHeader>
          {groupKeyResult ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
                <p className="text-xs font-medium text-green-500 mb-2">
                  Key created — valid for {groupKeyResult.count} routes. Copy it now, it won&apos;t be shown again!
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded break-all">{groupKeyResult.key}</code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await copyToClipboard(groupKeyResult.key)
                      setGroupKeyCopied(true)
                      toast.success('API key copied — store it safely')
                      setTimeout(() => setGroupKeyCopied(false), 2000)
                    }}
                  >
                    {groupKeyCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The key is managed on <span className="text-foreground">{selectedRouteName(groupKeyOwner)}</span> (API Keys tab) and shows up as shared on the other routes.
              </p>
              <DialogFooter>
                <Button onClick={() => { setGroupKeyOpen(false); setGroupKeyResult(null); setSelectedIds(new Set()) }}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Key Name</label>
                  <Input value={groupKeyName} onChange={(e) => setGroupKeyName(e.target.value)} placeholder="Customer XY" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Expires</label>
                    <Select value={groupKeyExpiry} onValueChange={setGroupKeyExpiry}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="180">6 months</SelectItem>
                        <SelectItem value="365">1 year</SelectItem>
                        <SelectItem value="0">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Scope</label>
                    <Select value={groupKeyScope} onValueChange={(v) => setGroupKeyScope(v as 'READ' | 'FULL')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FULL">Full (all methods)</SelectItem>
                        <SelectItem value="READ">Read-only (GET/HEAD)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Managed on</label>
                  <Select value={groupKeyOwner} onValueChange={setGroupKeyOwner}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from(selectedIds).map((id) => (
                        <SelectItem key={id} value={id}>{selectedRouteName(id)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Revoke, regenerate and route changes happen on this route&apos;s API Keys tab; the key works on all {selectedIds.size} routes.
                  </p>
                </div>
                <div className="rounded-md border border-border/50 divide-y divide-border/50 max-h-36 overflow-y-auto">
                  {Array.from(selectedIds).map((id) => (
                    <div key={id} className="px-2.5 py-1.5 text-sm flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="truncate">{selectedRouteName(id)}</span>
                      {id === groupKeyOwner && <Badge variant="outline" className="ml-auto text-[10px]">manages key</Badge>}
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGroupKeyOpen(false)}>Cancel</Button>
                <Button onClick={generateGroupKey} disabled={!groupKeyName.trim() || groupKeyPending}>
                  {groupKeyPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : `Generate for ${selectedIds.size} routes`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Folder create / rename dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{folderEditing ? 'Rename folder' : 'New folder'}</DialogTitle>
            <DialogDescription>
              {folderEditing
                ? 'Folders only organise routes; renaming does not affect routes or keys.'
                : 'Group routes in the list. Drag routes onto a folder to move them. API keys can be bound to a folder and then work for every route in it — including routes added later.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); submitFolder() }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Folder name</label>
              <Input value={folderNameInput} onChange={(e) => setFolderNameInput(e.target.value)} placeholder="Customer XY" autoFocus />
            </div>
            {!folderEditing && (userOrgs.length > 0 || isAdmin) && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Organization</label>
                <Select value={folderOrgInput} onValueChange={setFolderOrgInput}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isAdmin && <SelectItem value="__none__">No organization (global)</SelectItem>}
                    {userOrgs.map((org: any) => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only routes of this organization can be placed in the folder.
                </p>
              </div>
            )}
            {!folderEditing && !isAdmin && userOrgs.length === 0 && (
              <p className="text-xs text-destructive">You need to be a member of an organization to create folders.</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={!folderNameInput.trim() || folderPending || (!folderEditing && !isAdmin && folderOrgInput === '__none__')}
              >
                {folderPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : folderEditing ? 'Save' : 'Create folder'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search routes..."
            value={search}
            onChange={(e) => { setSearch(e.target.value) }}
            className="pl-9 pr-16"
          />
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <kbd>⌘</kbd><kbd>K</kbd>
          </button>
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v) }}>
          <SelectTrigger className="w-36">
            <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
          </SelectContent>
        </Select>
        <Select value={envFilter} onValueChange={(v) => { setEnvFilter(v) }}>
          <SelectTrigger className="w-36">
            <Layers className="w-3 h-3 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Envs</SelectItem>
            <SelectItem value="PRODUCTION">Production</SelectItem>
            <SelectItem value="STAGING">Staging</SelectItem>
            <SelectItem value="DEVELOPMENT">Development</SelectItem>
            <SelectItem value="NONE">No environment</SelectItem>
          </SelectContent>
        </Select>
        {userOrgs.length > 1 && (
          <Select value={orgFilter} onValueChange={(v) => { setOrgFilter(v) }}>
            <SelectTrigger className="w-44">
              <Building2 className="w-3 h-3 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Organizations</SelectItem>
              {userOrgs.map((org: any) => (
                <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {allTags.length > 0 && (
          <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v) }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Tags</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-3 py-3 text-left w-14">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Route
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Target
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Methods
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Health
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Features
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-3"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-10 w-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-8 w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : routes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">No routes found</p>
                        <p className="text-sm">
                          {search ? 'Try a different search term' : 'Create your first route to get started'}
                        </p>
                      </div>
                      {!search && (
                        <Button asChild>
                          <Link href="/routes/new">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Route
                          </Link>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                (folders.length === 0 ? routes : []).map(renderRow)
              )}
              {!isLoading && routes.length > 0 && sections.map((section) => {
                const collapsed = collapsedFolders.has(section.id)
                const sectionAll = section.routes.length > 0 && section.routes.every((r) => selectedIds.has(r.id))
                const sectionSome = !sectionAll && section.routes.some((r) => selectedIds.has(r.id))
                const folder = section.folder
                const isOver = dragOver === section.id
                return (
                  <Fragment key={section.id}>
                    <tr
                      {...(canEdit ? dropTargetProps(section.id) : {})}
                      className={`bg-muted/40 border-y border-border/50 transition-colors ${isOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/50' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={sectionAll ? true : sectionSome ? 'indeterminate' : false}
                          onCheckedChange={() => toggleSection(section.routes)}
                          disabled={section.routes.length === 0}
                          aria-label={`Select all routes in ${folder?.name ?? 'Unsorted'}`}
                        />
                      </td>
                      <td colSpan={8} className="px-4 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(section.id)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={collapsed ? 'Expand' : 'Collapse'}
                          >
                            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          {folder
                            ? <Folder className="w-4 h-4 text-primary shrink-0" />
                            : <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <span className="font-medium text-foreground truncate">{folder?.name ?? 'Unsorted'}</span>
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                            {section.routes.length}{folder && folder.routeCount !== section.routes.length ? ` / ${folder.routeCount}` : ''}
                          </Badge>
                          {folder && folder.keyCount > 0 && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1" title="API keys bound to this folder work for every route in it">
                              <KeyRound className="w-3 h-3" />
                              {folder.keyCount} key{folder.keyCount === 1 ? '' : 's'}
                            </Badge>
                          )}
                          {folder?.organizationId && orgName(folder.organizationId) && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 max-w-[150px] truncate">
                              {orgName(folder.organizationId)}
                            </Badge>
                          )}
                          {dragging && canEdit && (
                            <span className={`text-xs ml-1 ${isOver ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                              {folder ? 'Drop to move here' : 'Drop to remove from folder'}
                            </span>
                          )}
                          {folder && canEdit && (
                            <div className="ml-auto flex items-center gap-1">
                              <Button variant="ghost" size="icon-sm" onClick={() => openFolderDialog(folder)} title="Rename folder">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteFolder(folder)} title="Delete folder (routes stay)">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!collapsed && section.routes.map(renderRow)}
                    {!collapsed && section.routes.length === 0 && (
                      <tr {...(canEdit ? dropTargetProps(section.id) : {})} className={isOver ? 'bg-primary/10' : ''}>
                        <td colSpan={9} className="px-4 py-3 pl-14 text-xs text-muted-foreground italic">
                          {folder && folder.routeCount > 0
                            ? `${folder.routeCount} route${folder.routeCount === 1 ? '' : 's'} in this folder ${folder.routeCount === 1 ? 'is' : 'are'} on another page or filtered out.`
                            : canEdit ? 'Empty — drag routes here or use "Move to folder" in the selection toolbar.' : 'Empty folder.'}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>

          </table>
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Keyboard shortcuts cheat-sheet — opened by Ctrl/Cmd+K or the badge in the search field */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Available on the routes list.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-sm">
            {[
              ['/', 'Focus search'],
              ['n', 'New route'],
              ['Ctrl/⌘ A', 'Select all'],
              ['Ctrl/⌘ C', 'Copy selected configs'],
              ['Ctrl/⌘ V', 'Paste configs as new routes'],
              ['Ctrl/⌘ K', 'Show this dialog'],
              ['Delete', 'Delete selected'],
              ['Esc', 'Clear selection / close dialog'],
              ['Drag', 'Drop rows onto a folder to move them (selection moves together)'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 py-1">
                <span className="text-muted-foreground">{label}</span>
                <kbd className="inline-flex items-center rounded border border-border/50 bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-foreground">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CopyUrlButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const origin = useProxyOrigin()
  const proxyPath = path.startsWith('/r/') ? path : `/r${path.startsWith('/') ? path : `/${path}`}`
  const url = `${origin}${proxyPath}`

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    copyToClipboard(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy: ${url}`}
      className="ml-1 inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
    >
      {copied
        ? <Check className="w-3 h-3 text-green-500" />
        : <Copy className="w-3 h-3" />
      }
    </button>
  )
}

function RouteRow({
  route,
  selected,
  onToggle,
  onPublish,
  onDeactivate,
  onDuplicate,
  onDelete,
  isLoading,
  draggable = false,
  isDragSource = false,
  onDragStart,
  onDragEnd,
}: {
  route: Route
  selected: boolean
  onToggle: () => void
  onPublish: () => void
  onDeactivate: () => void
  onDuplicate: () => void
  onDelete: () => void
  isLoading: boolean
  draggable?: boolean
  isDragSource?: boolean
  onDragStart?: (e: React.DragEvent<HTMLTableRowElement>) => void
  onDragEnd?: () => void
}) {
  const health = route.healthChecks?.[0]
  const proxyOrigin = useProxyOrigin()

  return (
    <tr
      className={`hover:bg-muted/20 transition-colors group ${isDragSource ? 'opacity-40' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          {draggable && (
            <GripVertical
              className="w-3.5 h-3.5 text-muted-foreground/60 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
              aria-hidden
            />
          )}
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={`Select ${route.name}`}
          />
        </div>
      </td>
      <td className="px-4 py-3">
        <div>
          <Link
            href={routeUrl(route)}
            draggable={false}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {route.name}
          </Link>
          <p className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-0.5">
            {route.publicPath}
            <CopyUrlButton path={route.publicPath} />
          </p>
          {(route.tags.length > 0 || (route as any).organization || (route.environment && route.environment !== 'NONE')) && (
            <div className="flex items-center gap-1 mt-1 min-w-0">
              {/* Clicking the env badge filters the list to that env; same for tags */}
              {route.environment && route.environment !== 'NONE' && (
                <Link
                  href={`/routes?env=${route.environment}`}
                  onClick={(e) => e.stopPropagation()}
                  className="contents"
                  title={`Filter by ${route.environment}`}
                >
                  <EnvironmentBadge environment={route.environment} className="text-[10px] py-0 px-1.5 cursor-pointer" />
                </Link>
              )}
              {(route as any).organization && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 max-w-[150px] truncate" title={(route as any).organization.name}>
                  {(route as any).organization.name}
                </Badge>
              )}
              {route.tags.slice(0, 2).map((tag) => (
                <Link
                  key={tag}
                  href={`/routes?tag=${encodeURIComponent(tag)}`}
                  onClick={(e) => e.stopPropagation()}
                  title={`Filter by "${tag}"`}
                >
                  <Badge variant="secondary" className="text-[10px] py-0 px-1 shrink-0 cursor-pointer hover:bg-primary/20">
                    {tag}
                  </Badge>
                </Link>
              ))}
              {route.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground shrink-0" title={route.tags.slice(2).join(', ')}>
                  +{route.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-3 max-w-[200px]">
        <span className="text-xs text-muted-foreground font-mono block truncate" title={route.targetUrl}>
          {route.targetUrl}
        </span>
      </td>
      <td className="px-4 py-3">
        <MethodBadges methods={route.methods} />
      </td>
      <td className="px-4 py-3">
        <RouteStatusBadge status={route.status} isActive={route.isActive} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <HealthIndicator
          status={health?.status}
          responseTime={health?.responseTime}
          showLabel
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {route.wsEnabled && (
            <Badge variant="outline" className="text-xs py-0 px-1.5">WS</Badge>
          )}
          <CircuitBreakerBadge
            enabled={route.circuitBreakerEnabled}
            state={route.cbState}
            failureCount={route.cbFailureCount}
          />
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatRelativeTime(route.updatedAt)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={routeUrl(route)}>
              <Eye className="w-3.5 h-3.5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={routeEdit(route)}>
              <Edit className="w-3.5 h-3.5" />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {route.status === 'DRAFT' || !route.isActive ? (
                <DropdownMenuItem onClick={onPublish} disabled={isLoading}>
                  <Play className="w-4 h-4 mr-2 text-green-500" />
                  Publish
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onDeactivate} disabled={isLoading}>
                  <XCircle className="w-4 h-4 mr-2 text-yellow-500" />
                  Deactivate
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDuplicate} disabled={isLoading}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await copyToClipboard(buildCurl(route, proxyOrigin))
                  toast.success('cURL command copied')
                }}
              >
                <Terminal className="w-4 h-4 mr-2" />
                Copy as cURL
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const slug = route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'route'
                  downloadJson(`route-${slug}.json`, toExportConfig(route))
                }}
              >
                <FileDown className="w-4 h-4 mr-2" />
                Export config
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                disabled={route.isActive}
                title={route.isActive ? 'Deactivate the route before deleting' : undefined}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  )
}
