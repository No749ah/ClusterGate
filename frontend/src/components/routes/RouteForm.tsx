'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Plus, Trash2, ArrowLeft, ArrowRight, Check, Shuffle, AlertCircle, CheckCircle2, Building2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { RouteFormData, Organization } from '@/types'
import { useAuth } from '@/hooks/useAuth'

const routeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  publicPath: z.string().min(4, 'Path is required').refine((v) => v.startsWith('/r/'), { message: 'Invalid path' }),
  targetUrl: z.string().url('Must be a valid URL (include http:// or https://)'),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])).min(1, 'Select at least one method'),
  tags: z.array(z.string()).default([]),
  timeout: z.coerce.number().int().min(1000).max(120000).default(30000),
  retryCount: z.coerce.number().int().min(0).max(5).default(0),
  retryDelay: z.coerce.number().int().min(100).max(10000).default(1000),
  stripPrefix: z.boolean().default(false),
  sslVerify: z.boolean().default(true),
  streamResponse: z.boolean().default(false),
  rewriteRedirects: z.boolean().default(true),
  requestBodyLimit: z.string().default('10mb'),
  addHeaders: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  removeHeaders: z.string().default(''),
  rewriteRules: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  corsEnabled: z.boolean().default(false),
  corsOrigins: z.string().default(''),
  ipAllowlist: z.string().default(''),
  requireAuth: z.boolean().default(false),
  authType: z.enum(['NONE', 'API_KEY', 'BASIC', 'BEARER']).default('NONE'),
  authValue: z.string().optional(),
  upstreamAuthType: z.enum(['NONE', 'API_KEY', 'BASIC', 'BEARER']).default('NONE'),
  upstreamAuthValue: z.string().optional(),
  upstreamAuthHeader: z.string().default('X-API-Key'),
  targetType: z.enum(['GENERIC', 'N8N']).default('GENERIC'),
  environment: z.enum(['NONE', 'PRODUCTION', 'STAGING', 'DEVELOPMENT']).default('NONE'),
  healthCheckMethod: z.enum(['HEAD', 'GET', 'POST']).default('HEAD'),
  healthCheckPath: z.string().optional(),
  healthCheckBody: z.string().optional(),
  healthCheckInterval: z.coerce.number().default(5),
  protected: z.boolean().default(false),
  webhookSecret: z.string().optional(),
  rateLimitEnabled: z.boolean().default(false),
  rateLimitMax: z.coerce.number().int().min(1).max(100000).default(100),
  rateLimitWindowSeconds: z.coerce.number().int().min(1).max(3600).default(60),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().optional(),
  wsEnabled: z.boolean().default(false),
  circuitBreakerEnabled: z.boolean().default(false),
  cbFailureThreshold: z.coerce.number().int().min(1).max(100).default(5),
  cbRecoveryTimeout: z.coerce.number().int().min(1000).max(300000).default(30000),
  lbStrategy: z.enum(['ROUND_ROBIN', 'WEIGHTED', 'FAILOVER']).default('ROUND_ROBIN'),
  routeGroupId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
})

type RouteFormValues = z.infer<typeof routeSchema>

const STEPS = ['Identity', 'Target', 'Endpoint', 'Scope', 'Behavior', 'Security', 'Transforms']
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

function generateRandomPath(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `/r/${id}`
}

interface RouteFormProps {
  defaultValues?: Partial<RouteFormData>
  onSubmit: (data: RouteFormData) => Promise<void>
  isSubmitting?: boolean
  submitLabel?: string
  editRouteId?: string
}

export function RouteForm({ defaultValues, onSubmit, isSubmitting, submitLabel = 'Save Route', editRouteId }: RouteFormProps) {
  const [step, setStep] = useState(0)
  const [tagInput, setTagInput] = useState('')
  const [pathStatus, setPathStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [pathConflict, setPathConflict] = useState<string | null>(null)
  const [prefixShake, setPrefixShake] = useState(false)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isNew = !defaultValues?.publicPath

  // Fetch user's organizations
  useEffect(() => {
    api.organizations.list().then((res) => {
      const orgList = res.data ?? []
      setOrgs(orgList)
      // Auto-select if user has only one org and no default set
      if (orgList.length === 1 && !defaultValues?.organizationId) {
        setValue('organizationId', orgList[0].id)
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema) as never,
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      publicPath: defaultValues?.publicPath ?? generateRandomPath(),
      targetUrl: defaultValues?.targetUrl ?? '',
      methods: defaultValues?.methods ?? ['GET', 'POST'],
      tags: defaultValues?.tags ?? [],
      timeout: defaultValues?.timeout ?? 30000,
      retryCount: defaultValues?.retryCount ?? 0,
      retryDelay: defaultValues?.retryDelay ?? 1000,
      stripPrefix: defaultValues?.stripPrefix ?? false,
      sslVerify: defaultValues?.sslVerify ?? true,
      streamResponse: defaultValues?.streamResponse ?? false,
      rewriteRedirects: (defaultValues as any)?.rewriteRedirects ?? true,
      requestBodyLimit: defaultValues?.requestBodyLimit ?? '10mb',
      addHeaders: Object.entries(defaultValues?.addHeaders ?? {}).map(([key, value]) => ({ key, value })),
      removeHeaders: defaultValues?.removeHeaders?.join(', ') ?? '',
      rewriteRules: defaultValues?.rewriteRules ?? [],
      corsEnabled: defaultValues?.corsEnabled ?? false,
      corsOrigins: defaultValues?.corsOrigins?.join('\n') ?? '',
      ipAllowlist: defaultValues?.ipAllowlist?.join('\n') ?? '',
      requireAuth: defaultValues?.requireAuth ?? false,
      authType: defaultValues?.authType ?? 'NONE',
      authValue: defaultValues?.authValue ?? '',
      upstreamAuthType: defaultValues?.upstreamAuthType ?? 'NONE',
      upstreamAuthValue: defaultValues?.upstreamAuthValue ?? '',
      upstreamAuthHeader: defaultValues?.upstreamAuthHeader ?? 'X-API-Key',
      targetType: defaultValues?.targetType ?? 'GENERIC',
      environment: (defaultValues as any)?.environment ?? 'NONE',
      healthCheckMethod: (defaultValues as any)?.healthCheckMethod ?? 'HEAD',
      healthCheckPath: (defaultValues as any)?.healthCheckPath ?? '',
      healthCheckBody: (defaultValues as any)?.healthCheckBody ?? '',
      healthCheckInterval: (defaultValues as any)?.healthCheckInterval ?? 5,
      protected: (defaultValues as any)?.protected ?? false,
      webhookSecret: defaultValues?.webhookSecret ?? '',
      rateLimitEnabled: defaultValues?.rateLimitEnabled ?? false,
      rateLimitMax: defaultValues?.rateLimitMax ?? 100,
      rateLimitWindowSeconds: defaultValues?.rateLimitWindow ? defaultValues.rateLimitWindow / 1000 : 60,
      maintenanceMode: defaultValues?.maintenanceMode ?? false,
      maintenanceMessage: defaultValues?.maintenanceMessage ?? '',
      wsEnabled: defaultValues?.wsEnabled ?? false,
      circuitBreakerEnabled: defaultValues?.circuitBreakerEnabled ?? false,
      cbFailureThreshold: defaultValues?.cbFailureThreshold ?? 5,
      cbRecoveryTimeout: defaultValues?.cbRecoveryTimeout ?? 30000,
      lbStrategy: defaultValues?.lbStrategy ?? 'ROUND_ROBIN',
      routeGroupId: defaultValues?.routeGroupId ?? null,
      organizationId: defaultValues?.organizationId ?? null,
    },
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    trigger,
  } = form

  const { fields: headerFields, append: appendHeader, remove: removeHeader } = useFieldArray({
    control: form.control,
    name: 'addHeaders',
  })

  const { fields: rewriteFields, append: appendRewrite, remove: removeRewrite } = useFieldArray({
    control: form.control,
    name: 'rewriteRules',
  })

  const tags = watch('tags')
  const methods = watch('methods')
  const requireAuth = watch('requireAuth')
  const corsEnabled = watch('corsEnabled')
  const rateLimitEnabled = watch('rateLimitEnabled')
  const maintenanceMode = watch('maintenanceMode')
  const circuitBreakerEnabled = watch('circuitBreakerEnabled')
  const authType = watch('authType')
  const upstreamAuthType = watch('upstreamAuthType')
  const publicPath = watch('publicPath')
  const [wildcardEnabled, setWildcardEnabled] = useState(
    defaultValues?.publicPath?.endsWith('/*') ?? false
  )

  // Test connection state
  const [testingConn, setTestingConn] = useState(false)
  const [connResult, setConnResult] = useState<{ ok: boolean; status?: number; duration?: number; error?: string; detectedTool?: string; hint?: string } | null>(null)

  const handleTestConnection = async () => {
    setTestingConn(true)
    setConnResult(null)
    try {
      const res = await api.routes.testConnection({
        targetUrl: form.getValues('targetUrl'),
        method: 'POST',
        sslVerify: form.getValues('sslVerify'),
        targetType: form.getValues('targetType'),
        upstreamAuthType: form.getValues('upstreamAuthType'),
        upstreamAuthValue: form.getValues('upstreamAuthValue') || undefined,
        upstreamAuthHeader: form.getValues('upstreamAuthHeader'),
      })
      setConnResult(res.data)
    } catch (err) {
      setConnResult({ ok: false, error: (err as Error).message })
    } finally {
      setTestingConn(false)
    }
  }

  // Default new routes to requiring an API key when the global policy forces it
  useEffect(() => {
    if (!isNew) return
    api.routes.getApiKeyPolicy().then((res) => {
      if (res.data?.forceApiKeys && !form.getValues('requireAuth')) {
        setValue('requireAuth', true)
        setValue('authType', 'API_KEY')
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew])

  // Debounced path availability check
  const checkPath = useCallback(async (path: string) => {
    if (!path || path === '/') {
      setPathStatus('idle')
      return
    }
    setPathStatus('checking')
    try {
      const res = await api.routes.checkPath(path, editRouteId)
      if (res.data.available) {
        setPathStatus('available')
        setPathConflict(null)
      } else {
        setPathStatus('taken')
        setPathConflict(res.data.existingRoute?.name ?? 'another route')
      }
    } catch {
      setPathStatus('idle')
    }
  }, [editRouteId])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (publicPath && publicPath.length > 1) {
        checkPath(publicPath)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [publicPath, checkPath])

  const toggleMethod = (method: typeof HTTP_METHODS[number]) => {
    const current = methods ?? []
    if (current.includes(method)) {
      setValue('methods', current.filter((m) => m !== method))
    } else {
      setValue('methods', [...current, method])
    }
  }

  const addTag = () => {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag)) {
      setValue('tags', [...tags, tag])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setValue('tags', tags.filter((t) => t !== tag))
  }

  const handleNext = async () => {
    // 7-step guided layout
    const stepFields: (keyof RouteFormValues)[][] = [
      ['name'],                  // Identity
      ['targetUrl'],             // Target
      ['publicPath', 'methods'], // Endpoint
      [],                        // Scope (Org checked manually for non-admins)
      ['timeout', 'retryCount', 'retryDelay'], // Behavior
      [],                        // Security
      [],                        // Transforms & Maintenance
    ]
    const fields = stepFields[step] ?? []
    const valid = fields.length === 0 ? true : await trigger(fields)
    if (step === 3 && !isAdmin && orgs.length > 0 && !form.getValues('organizationId')) {
      return
    }
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  // Keyboard: Enter advances to the next step (instead of submitting) on every
  // step except the last. Textareas keep their normal newline behaviour, and
  // Radix Select/popover handle Enter themselves (they stop propagation).
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    const target = e.target as HTMLElement
    if (target.tagName === 'TEXTAREA') return
    if (step < STEPS.length - 1) {
      e.preventDefault()
      handleNext()
    }
  }

  const handleFormSubmit = async (data: RouteFormValues) => {
    // Prevent accidental submit when not on the last step (e.g. Enter key in input)
    if (step < STEPS.length - 1) return
    if (!isAdmin && !data.organizationId) {
      // Scope step is where the org is picked
      setStep(3)
      return
    }
    const { rateLimitWindowSeconds, ...rest } = data
    // Trim a trailing /* or / from the target URL so wildcard routes append the
    // suffix to a clean base (server also defends against this, but we want the
    // saved form to reflect the cleaned value).
    if (typeof rest.targetUrl === 'string') {
      rest.targetUrl = rest.targetUrl.trim().replace(/\/\*$/, '').replace(/\/$/, '')
    }
    const formData: RouteFormData = {
      ...rest,
      // Production routes are automatically delete-protected (no separate toggle)
      protected: rest.environment === 'PRODUCTION',
      rateLimitWindow: rateLimitWindowSeconds * 1000,
      addHeaders: Object.fromEntries(data.addHeaders.map(({ key, value }) => [key, value])),
      removeHeaders: data.removeHeaders
        ? data.removeHeaders.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      corsOrigins: data.corsOrigins
        ? data.corsOrigins.split('\n').map((s) => s.trim()).filter(Boolean)
        : [],
      ipAllowlist: data.ipAllowlist
        ? data.ipAllowlist.split('\n').map((s) => s.trim()).filter(Boolean)
        : [],
    }
    formData.wsEnabled = data.wsEnabled
    formData.circuitBreakerEnabled = data.circuitBreakerEnabled
    formData.cbFailureThreshold = data.cbFailureThreshold
    formData.cbRecoveryTimeout = data.cbRecoveryTimeout
    formData.lbStrategy = data.lbStrategy
    formData.routeGroupId = data.routeGroupId || null
    formData.organizationId = data.organizationId || null
    await onSubmit(formData)
  }

  const fieldClass = (error?: { message?: string }) =>
    cn(
      'flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      error ? 'border-destructive focus-visible:ring-destructive' : 'border-input'
    )

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} onKeyDown={handleFormKeyDown} className="space-y-6">
      {/* Step indicator — distributes all 7 pills across the row, each pill
          shrinks evenly and truncates its label if width gets too tight. */}
      <div className="flex flex-nowrap gap-1.5 w-full">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            title={s}
            className={cn(
              'group flex items-center gap-1.5 flex-1 min-w-0 rounded-full border py-1 pl-1 pr-2 text-xs font-medium transition-colors cursor-pointer',
              i === step
                ? 'border-primary bg-primary/10 text-foreground'
                : i < step
                ? 'border-green-600/30 bg-green-600/10 text-green-500 hover:bg-green-600/20'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center w-5 h-5 shrink-0 rounded-full text-[10px] font-semibold',
                i === step
                  ? 'bg-primary text-primary-foreground'
                  : i < step
                  ? 'bg-green-600/20 text-green-500'
                  : 'bg-muted-foreground/20 text-muted-foreground'
              )}
            >
              {i < step ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            <span className="truncate min-w-0">{s}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[300px]">
        {/* ============================================================== */}
        {/* Step 1: Target URL + test                                       */}
        {/* ============================================================== */}
        {step === 1 && (
          <div className="space-y-4">
            <Section
              title="Target"
              description="The upstream URL this route forwards to. You can verify it's reachable right here."
            >
              <Field label="Target URL" error={errors.targetUrl?.message} required>
                <input
                  {...register('targetUrl')}
                  placeholder="http://my-service.default.svc.cluster.local:8080"
                  className={fieldClass(errors.targetUrl)}
                  autoFocus
                />
              </Field>

              <SwitchRow
                label="Forward all sub-paths (/*)"
                description="Any path after the Target URL is appended verbatim — useful when the upstream serves many pages under a base path."
                checked={wildcardEnabled}
                onCheckedChange={(v) => {
                  setWildcardEnabled(v)
                  const current = form.getValues('publicPath')
                  if (v && !current.endsWith('/*')) {
                    const base = current.replace(/\/+$/, '')
                    setValue('publicPath', base + '/*')
                    if (form.getValues('stripPrefix')) setValue('stripPrefix', false)
                  } else if (!v && current.endsWith('/*')) {
                    setValue('publicPath', current.slice(0, -2))
                  }
                }}
              />

              <div className="space-y-3 pt-1">
                <Button
                  type="button"
                  variant="default"
                  onClick={handleTestConnection}
                  disabled={testingConn || !watch('targetUrl')}
                  className="w-full"
                >
                  {testingConn ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testing connection...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" />Test target</>
                  )}
                </Button>
                {connResult && (
                  <div className={cn(
                    'rounded-md border p-3 space-y-1.5',
                    connResult.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
                  )}>
                    <div className="flex items-center gap-2 flex-wrap">
                      {connResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <span className={cn('text-sm font-medium', connResult.ok ? 'text-emerald-500' : 'text-red-500')}>
                        {connResult.ok ? `Reachable · HTTP ${connResult.status}` : 'Not reachable'}
                      </span>
                      {connResult.duration !== undefined && (
                        <span className="text-xs text-muted-foreground">· {connResult.duration}ms</span>
                      )}
                    </div>
                    {connResult.error && (
                      <p className="text-xs text-red-500/90 font-mono break-all">{connResult.error}</p>
                    )}
                    {connResult.detectedTool === 'n8n' && (
                      <p className="text-xs text-muted-foreground">
                        n8n detected — <code className="text-foreground">chatInput</code> + <code className="text-foreground">sessionId</code> are sent automatically.
                      </p>
                    )}
                    {connResult.hint && (
                      <p className="text-xs text-muted-foreground">{connResult.hint}</p>
                    )}
                  </div>
                )}
              </div>
            </Section>
          </div>
        )}

        {/* ============================================================== */}
        {/* Step 0: Identity                                                */}
        {/* ============================================================== */}
        {step === 0 && (
          <div className="space-y-4">
            <Section
              title="Identity"
              description="Give this route a name and (optionally) tag it so you can find it again."
            >
              <Field label="Route Name" error={errors.name?.message} required>
                <input {...register('name')} placeholder="My API Service" className={fieldClass(errors.name)} autoFocus />
              </Field>
              <Field label="Description" error={errors.description?.message} hint="Optional — what does this route expose?">
                <Textarea {...register('description')} placeholder="Internal service that handles…" rows={2} />
              </Field>
              <Field label="Tags" hint="Optional — labels for filtering and grouping.">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        // Stop the form-level handler from interpreting this Enter as
                        // "advance to next step" — Enter here only adds a tag.
                        e.preventDefault()
                        e.stopPropagation()
                        addTag()
                      }}
                      placeholder="Add tag and press Enter"
                      className={fieldClass()}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addTag}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1">
                          {tag}
                          <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">×</button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            </Section>
          </div>
        )}

        {/* ============================================================== */}
        {/* Step 2: How? — Public path + methods                            */}
        {/* ============================================================== */}
        {step === 2 && (
          <div className="space-y-4">
            <Section
              title="Endpoint"
              description="The public path clients call and which HTTP methods are accepted."
            >
              <Field label="Public Path" error={errors.publicPath?.message} required hint={wildcardEnabled ? 'Wildcard is on — all sub-paths are proxied.' : 'A short, URL-safe identifier.'}>
                <div className="flex gap-2">
                  <div className="relative flex-1 flex">
                    <span
                      className={cn(
                        'inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm font-mono select-none transition-all',
                        prefixShake && 'animate-[shake_0.4s_ease-in-out] text-destructive border-destructive/50 bg-destructive/10'
                      )}
                    >
                      /r/
                    </span>
                    <input
                      value={publicPath.startsWith('/r/') ? publicPath.slice(3).replace(/\/\*$/, '') : publicPath.replace(/\/\*$/, '')}
                      onChange={(e) => {
                        const val = e.target.value.replace(/^\/+/, '').replace(/\/\*$/, '')
                        setValue('publicPath', `/r/${val}${wildcardEnabled ? '/*' : ''}`, { shouldValidate: true })
                      }}
                      onKeyDown={(e) => {
                        const suffix = publicPath.startsWith('/r/') ? publicPath.slice(3) : publicPath
                        if (e.key === 'Backspace' && suffix === '') {
                          e.preventDefault()
                          setPrefixShake(true)
                          setTimeout(() => setPrefixShake(false), 400)
                        }
                      }}
                      placeholder="my-service"
                      className={cn(fieldClass(errors.publicPath), 'rounded-l-none', wildcardEnabled && 'rounded-r-none')}
                    />
                    {wildcardEnabled && (
                      <span className="inline-flex items-center px-2.5 rounded-r-md border border-l-0 border-input bg-amber-500/10 text-amber-500 text-sm font-mono select-none">
                        /*
                      </span>
                    )}
                    {pathStatus === 'checking' && (
                      <Loader2 className={cn('absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground', wildcardEnabled ? 'right-12' : 'right-3')} />
                    )}
                    {pathStatus === 'available' && (
                      <CheckCircle2 className={cn('absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-500', wildcardEnabled ? 'right-12' : 'right-3')} />
                    )}
                    {pathStatus === 'taken' && (
                      <AlertCircle className={cn('absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-destructive', wildcardEnabled ? 'right-12' : 'right-3')} />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title="Generate random path"
                    onClick={() => {
                      const newPath = generateRandomPath()
                      setValue('publicPath', wildcardEnabled ? newPath + '/*' : newPath)
                    }}
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {pathStatus === 'taken' && (
                  <p className="text-xs text-destructive mt-1">
                    This path is already used by &quot;{pathConflict}&quot;
                  </p>
                )}
              </Field>

              {(() => {
                const t = (watch('targetUrl') || '').trim().replace(/\/\*$/, '').replace(/\/$/, '')
                const pp = publicPath.replace(/\/\*$/, '')
                if (!t || !pp || pp === '/r/') return null
                return (
                  <div className="rounded-md bg-muted/30 px-3 py-2 text-xs font-mono break-all">
                    <span className="text-muted-foreground">Preview: </span>
                    {wildcardEnabled ? (
                      <><span className="text-foreground">{pp}/foo</span> → <span className="text-foreground">{t}/foo</span></>
                    ) : (
                      <><span className="text-foreground">{pp}</span> → <span className="text-foreground">{t}</span></>
                    )}
                  </div>
                )
              })()}

              <Field label="HTTP Methods" error={errors.methods?.message} required hint="Which methods this route accepts.">
                <div className="flex gap-2 flex-wrap">
                  {HTTP_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMethod(m)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium font-mono border transition-colors',
                        methods?.includes(m)
                          ? 'bg-primary/20 border-primary/40 text-primary'
                          : 'bg-transparent border-border text-muted-foreground hover:border-primary/40 hover:text-primary/80'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {errors.methods && <p className="text-xs text-destructive mt-1">{errors.methods.message}</p>}
              </Field>
            </Section>
          </div>
        )}

        {/* ============================================================== */}
        {/* Step 3: Scope — Org + Environment                               */}
        {/* ============================================================== */}
        {step === 3 && (
          <div className="space-y-4">
            <Section
              title="Scope"
              description="Owning organization (for access scoping) and which environment this is."
            >
              {orgs.length > 0 && (
                <Field label="Organization" required={!isAdmin} hint={isAdmin ? 'Admins can leave this empty for global routes.' : 'Required.'}>
                  <Select
                    value={watch('organizationId') ?? '_none'}
                    onValueChange={(v) => setValue('organizationId', v === '_none' ? null : v)}
                  >
                    <SelectTrigger>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <SelectValue placeholder="Select organization..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {isAdmin && <SelectItem value="_none">No organization (global)</SelectItem>}
                      {orgs.map((org) => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isAdmin && !watch('organizationId') && (
                    <p className="text-xs text-destructive">Organization is required</p>
                  )}
                </Field>
              )}

              <Field
                label="Environment"
                hint={watch('environment') === 'PRODUCTION'
                  ? 'Production routes are delete-protected — you have to type the route name to delete them.'
                  : 'Pick the deployment stage. Production routes get automatic delete protection.'}
              >
                <Select value={watch('environment')} onValueChange={(v) => setValue('environment', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="PRODUCTION">Production (protected)</SelectItem>
                    <SelectItem value="STAGING">Staging</SelectItem>
                    <SelectItem value="DEVELOPMENT">Development</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Section>

          </div>
        )}

        {/* ============================================================== */}
        {/* Step 4: Behavior                                                */}
        {/* ============================================================== */}
        {step === 4 && (
          <div className="space-y-4">
            <Section title="Timing & retries" description="How long to wait for the upstream and how often to retry transient failures.">
              <div className="grid grid-cols-3 gap-4">
                <Field label="Timeout (ms)" error={errors.timeout?.message} hint="1000–120000">
                  <input type="number" {...register('timeout')} className={fieldClass(errors.timeout)} />
                </Field>
                <Field label="Retry Count" hint="0–5">
                  <input type="number" {...register('retryCount')} className={fieldClass()} />
                </Field>
                <Field label="Retry Delay (ms)" hint="100–10000">
                  <input type="number" {...register('retryDelay')} className={fieldClass()} />
                </Field>
              </div>
            </Section>

            <Section title="Request handling" description="What the proxy does with the request body and the response stream.">
              <Field label="Request Body Limit">
                <Select value={watch('requestBodyLimit')} onValueChange={(v) => setValue('requestBodyLimit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['1mb', '5mb', '10mb', '25mb', '50mb', '100mb'].map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {/* Switches paired into 2 columns so this section stays compact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                <SwitchRow
                  label="Strip Prefix"
                  description="Forward to the Target URL root only — no path appended. Disabled while wildcard routing is on."
                  checked={watch('stripPrefix') && !wildcardEnabled}
                  onCheckedChange={(v) => !wildcardEnabled && setValue('stripPrefix', v)}
                />
                <SwitchRow
                  label="Verify SSL Certificate"
                  description="Disable for self-signed or internal certificates."
                  checked={watch('sslVerify')}
                  onCheckedChange={(v) => setValue('sslVerify', v)}
                />
                <SwitchRow
                  label="Stream Response"
                  description="Pipe the response unbuffered for SSE / token streaming."
                  checked={watch('streamResponse') ?? false}
                  onCheckedChange={(v) => setValue('streamResponse', v)}
                />
                <SwitchRow
                  label="WebSocket Support"
                  description="Enable WebSocket upgrade handling for this route."
                  checked={watch('wsEnabled') ?? false}
                  onCheckedChange={(v) => setValue('wsEnabled', v)}
                />
                <SwitchRow
                  label="Keep Redirects in Proxy"
                  description="Rewrite upstream Location headers so 3xx redirects stay under /r/… instead of bouncing to the upstream host."
                  checked={watch('rewriteRedirects') ?? true}
                  onCheckedChange={(v) => setValue('rewriteRedirects', v)}
                />
              </div>
            </Section>

            <Section title="Reliability" description="Circuit breaker, rate limiting, and how multiple targets are balanced.">
              <Field label="Load Balancing Strategy" hint="How to distribute traffic across multiple targets (configured separately)">
                <Select value={watch('lbStrategy')} onValueChange={(v) => setValue('lbStrategy', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROUND_ROBIN">Round Robin</SelectItem>
                    <SelectItem value="WEIGHTED">Weighted</SelectItem>
                    <SelectItem value="FAILOVER">Failover</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                <SwitchRow
                  label="Circuit Breaker"
                  description="Stop forwarding after consecutive failures."
                  checked={circuitBreakerEnabled}
                  onCheckedChange={(v) => setValue('circuitBreakerEnabled', v)}
                />
                <SwitchRow
                  label="Rate limiting"
                  description="Limit requests per client IP."
                  checked={rateLimitEnabled}
                  onCheckedChange={(v) => setValue('rateLimitEnabled', v)}
                />
              </div>
              {(circuitBreakerEnabled || rateLimitEnabled) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-3 border-l-2 border-primary/30">
                  {circuitBreakerEnabled && (
                    <>
                      <Field label="Failure Threshold">
                        <input type="number" {...register('cbFailureThreshold')} className={fieldClass()} />
                      </Field>
                      <Field label="Recovery Timeout (ms)">
                        <input type="number" {...register('cbRecoveryTimeout')} className={fieldClass()} />
                      </Field>
                    </>
                  )}
                  {rateLimitEnabled && (
                    <>
                      <Field label="Max Requests" hint="Per window per IP">
                        <input type="number" {...register('rateLimitMax')} className={fieldClass()} />
                      </Field>
                      <Field label="Window (seconds)" hint="1–3600">
                        <input type="number" {...register('rateLimitWindowSeconds')} className={fieldClass()} />
                      </Field>
                    </>
                  )}
                </div>
              )}
            </Section>

            <Section title="Health check" description="How ClusterGate probes the upstream. POST + body works for n8n.">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Interval">
                  <Select value={String(watch('healthCheckInterval'))} onValueChange={(v) => setValue('healthCheckInterval', Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Every 5 minutes</SelectItem>
                      <SelectItem value="15">Every 15 minutes</SelectItem>
                      <SelectItem value="60">Every hour</SelectItem>
                      <SelectItem value="720">Every 12 hours</SelectItem>
                      <SelectItem value="1440">Every 24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Method">
                  <Select value={watch('healthCheckMethod')} onValueChange={(v) => setValue('healthCheckMethod', v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HEAD">HEAD</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Path">
                  <input {...register('healthCheckPath')} placeholder="/health" className={fieldClass()} />
                </Field>
              </div>
              {watch('healthCheckMethod') === 'POST' && (
                <Field label="Body (JSON)">
                  <Textarea {...register('healthCheckBody')} placeholder='{"chatInput":"ping","sessionId":"healthcheck"}' rows={2} className="font-mono text-sm" />
                </Field>
              )}
            </Section>
          </div>
        )}

        {/* ============================================================== */}
        {/* Step 5: Security                                                */}
        {/* ============================================================== */}
        {step === 5 && (
          <div className="space-y-4">
            <Section title="Gateway authentication" description="Require callers to authenticate at ClusterGate before requests are proxied.">
              <SwitchRow
                label="Require auth"
                description="Reject unauthenticated requests with 401."
                checked={requireAuth}
                onCheckedChange={(v) => setValue('requireAuth', v)}
              />
              {requireAuth && (
                <div className="space-y-3 pl-3 border-l-2 border-primary/30">
                  <Field label="Auth Type">
                    <Select value={authType} onValueChange={(v) => setValue('authType', v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="API_KEY">API Key</SelectItem>
                        <SelectItem value="BASIC">Basic Auth</SelectItem>
                        <SelectItem value="BEARER">Bearer Token</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {authType === 'API_KEY' ? (
                    <p className="text-xs text-muted-foreground">
                      Keys are managed in the <span className="font-medium text-foreground">API Keys</span> tab after saving. Clients send the <code className="text-foreground">X-API-Key</code> header.
                    </p>
                  ) : (
                    <Field label="Auth Value">
                      <input type="password" {...register('authValue')} placeholder="••••••••" className={fieldClass()} />
                    </Field>
                  )}
                </div>
              )}
            </Section>

            <Section title="Upstream authentication" description="Credentials ClusterGate sends to the target service (e.g. a key n8n requires).">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Target Type">
                  <Select value={watch('targetType')} onValueChange={(v) => setValue('targetType', v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GENERIC">Generic</SelectItem>
                      <SelectItem value="N8N">n8n</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Auth Type">
                  <Select value={upstreamAuthType} onValueChange={(v) => setValue('upstreamAuthType', v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      <SelectItem value="API_KEY">API Key (header)</SelectItem>
                      <SelectItem value="BEARER">Bearer Token</SelectItem>
                      <SelectItem value="BASIC">Basic (Base64)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {upstreamAuthType !== 'NONE' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-3 border-l-2 border-primary/30">
                  {upstreamAuthType === 'API_KEY' && (
                    <Field label="Header Name">
                      <input {...register('upstreamAuthHeader')} placeholder="X-API-Key" className={fieldClass()} />
                    </Field>
                  )}
                  <Field label="Value">
                    <input type="password" {...register('upstreamAuthValue')} placeholder="••••••••" className={fieldClass()} />
                  </Field>
                </div>
              )}
            </Section>

            <Section title="Webhook signature" description="HMAC-SHA256 verification of X-Hub-Signature-256 / X-Webhook-Signature on incoming requests.">
              <Field label="Secret">
                <div className="flex items-center gap-2">
                  <input type="text" {...register('webhookSecret')} placeholder="Enter or generate" className={fieldClass()} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const bytes = new Uint8Array(32)
                      crypto.getRandomValues(bytes)
                      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
                      setValue('webhookSecret', `whsec_${hex}`, { shouldDirty: true })
                    }}
                  >
                    Generate
                  </Button>
                </div>
              </Field>
            </Section>

            <Section title="Network access" description="Restrict where requests can come from and which origins can call this route.">
              <Field label="IP Allowlist" hint="One IP or CIDR per line. Leave empty to allow all.">
                <Textarea {...register('ipAllowlist')} placeholder={"203.0.113.0/24\n198.51.100.42"} rows={3} />
              </Field>
              <SwitchRow
                label="CORS Enabled"
                description="Allow cross-origin requests from the listed origins."
                checked={corsEnabled}
                onCheckedChange={(v) => setValue('corsEnabled', v)}
              />
              {corsEnabled && (
                <Field label="CORS Origins" hint="One origin per line">
                  <Textarea {...register('corsOrigins')} placeholder={"https://app.yourdomain.com\nhttps://admin.yourdomain.com"} rows={3} />
                </Field>
              )}
            </Section>
          </div>
        )}

        {/* ============================================================== */}
        {/* Step 6: Transforms & Maintenance                                */}
        {/* ============================================================== */}
        {step === 6 && (
          <div className="space-y-4">
            <Section title="Request headers" description="Inject or strip headers on every proxied request.">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Add headers</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => appendHeader({ key: '', value: '' })}>
                    <Plus className="w-3 h-3 mr-1" /> Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {headerFields.map((field, i) => (
                    <div key={field.id} className="flex gap-2">
                      <input {...register(`addHeaders.${i}.key`)} placeholder="X-Custom-Header" className={cn(fieldClass(), 'flex-1')} />
                      <input {...register(`addHeaders.${i}.value`)} placeholder="header-value" className={cn(fieldClass(), 'flex-1')} />
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeHeader(i)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {headerFields.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">No headers added</p>
                  )}
                </div>
              </div>
              <Field label="Remove Headers" hint="Comma-separated header names to strip from requests">
                <input {...register('removeHeaders')} placeholder="X-Forwarded-For, X-Real-IP" className={fieldClass()} />
              </Field>
            </Section>

            <Section title="Path rewrites" description="Regex rewrites applied to the suffix after the public path. Patterns are rejected if they look catastrophic (ReDoS).">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{rewriteFields.length === 0 ? 'No rewrite rules yet.' : `${rewriteFields.length} rule${rewriteFields.length === 1 ? '' : 's'}`}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => appendRewrite({ from: '', to: '' })}>
                  <Plus className="w-3 h-3 mr-1" /> Add Rule
                </Button>
              </div>
              <div className="space-y-2">
                {rewriteFields.map((field, i) => (
                  <div key={field.id} className="flex gap-2 items-center">
                    <input {...register(`rewriteRules.${i}.from`)} placeholder="^/v1/(.*)" className={cn(fieldClass(), 'flex-1 font-mono')} />
                    <span className="text-muted-foreground text-sm">→</span>
                    <input {...register(`rewriteRules.${i}.to`)} placeholder="/api/$1" className={cn(fieldClass(), 'flex-1 font-mono')} />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRewrite(i)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Maintenance" description="Take the route offline temporarily without deleting it.">
              <SwitchRow
                label="Maintenance Mode"
                description="Return 503 to all incoming requests."
                checked={maintenanceMode}
                onCheckedChange={(v) => setValue('maintenanceMode', v)}
              />
              {maintenanceMode && (
                <Field label="Message" hint="Shown to users when maintenance mode is active">
                  <Textarea
                    {...register('maintenanceMessage')}
                    placeholder="This service is temporarily unavailable. Please try again later."
                    rows={3}
                  />
                </Field>
              )}
              {!maintenanceMode && (
                <p className="text-xs text-muted-foreground italic">Service is active — toggle to take it offline.</p>
              )}
            </Section>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-border/50">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0 || isSubmitting}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="flex gap-3">
          {step < STEPS.length - 1 ? (
            <Button key="wizard-next" type="button" onClick={handleNext} disabled={isSubmitting}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button key="wizard-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                submitLabel
              )}
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-lg border border-border/50 bg-card/40 px-4 py-3.5 space-y-3', className)}>
      <header className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  )
}

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function Field({
  label,
  children,
  error,
  hint,
  required,
}: {
  label: string
  children: React.ReactNode
  error?: string
  hint?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
