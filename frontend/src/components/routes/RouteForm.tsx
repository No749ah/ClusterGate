'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Plus, Trash2, ArrowLeft, ArrowRight, Check, Shuffle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { RouteFormData } from '@/types'

const routeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  publicPath: z.string().min(1, 'Public path is required').startsWith('/', 'Must start with /'),
  targetUrl: z.string().url('Must be a valid URL (include http:// or https://)'),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])).min(1, 'Select at least one method'),
  tags: z.array(z.string()).default([]),
  timeout: z.coerce.number().int().min(1000).max(120000).default(30000),
  retryCount: z.coerce.number().int().min(0).max(5).default(0),
  retryDelay: z.coerce.number().int().min(100).max(10000).default(1000),
  stripPrefix: z.boolean().default(false),
  sslVerify: z.boolean().default(true),
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
  webhookSecret: z.string().optional(),
  rateLimitEnabled: z.boolean().default(false),
  rateLimitMax: z.coerce.number().int().min(1).max(100000).default(100),
  rateLimitWindowSeconds: z.coerce.number().int().min(1).max(3600).default(60),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().optional(),
})

type RouteFormValues = z.infer<typeof routeSchema>

const STEPS = ['Basic Info', 'Advanced', 'Headers', 'Security', 'Maintenance']
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
  const isNew = !defaultValues?.publicPath

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
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
      webhookSecret: defaultValues?.webhookSecret ?? '',
      rateLimitEnabled: defaultValues?.rateLimitEnabled ?? false,
      rateLimitMax: defaultValues?.rateLimitMax ?? 100,
      rateLimitWindowSeconds: defaultValues?.rateLimitWindow ? defaultValues.rateLimitWindow / 1000 : 60,
      maintenanceMode: defaultValues?.maintenanceMode ?? false,
      maintenanceMessage: defaultValues?.maintenanceMessage ?? '',
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
  const authType = watch('authType')
  const publicPath = watch('publicPath')
  const [wildcardEnabled, setWildcardEnabled] = useState(
    defaultValues?.publicPath?.endsWith('/*') ?? false
  )

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
    const stepFields: (keyof RouteFormValues)[][] = [
      ['name', 'publicPath', 'targetUrl', 'methods'],
      ['timeout', 'retryCount', 'retryDelay'],
      [],
      [],
      [],
    ]
    const valid = await trigger(stepFields[step])
    if (valid) setStep((s) => s + 1)
  }

  const handleFormSubmit = async (data: RouteFormValues) => {
    const { rateLimitWindowSeconds, ...rest } = data
    const formData: RouteFormData = {
      ...rest,
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
    await onSubmit(formData)
  }

  const fieldClass = (error?: { message?: string }) =>
    cn(
      'flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      error ? 'border-destructive focus-visible:ring-destructive' : 'border-input'
    )

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors',
                i === step
                  ? 'bg-primary text-primary-foreground'
                  : i < step
                  ? 'bg-green-600/20 text-green-500 hover:bg-green-600/30 cursor-pointer'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </button>
            <span
              className={cn(
                'text-xs hidden sm:block',
                i === step ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-px w-6 transition-colors',
                  i < step ? 'bg-green-600/50' : 'bg-border'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[300px]">
        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Route Name" error={errors.name?.message} required>
              <input {...register('name')} placeholder="My API Service" className={fieldClass(errors.name)} />
            </Field>
            <Field label="Description" error={errors.description?.message}>
              <Textarea {...register('description')} placeholder="Optional description..." rows={2} />
            </Field>
            <Field label="Public Path" error={errors.publicPath?.message} required hint={wildcardEnabled ? 'All sub-paths will be routed (e.g. /api/v1/*)' : 'e.g. /api/users or /service/health'}>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input {...register('publicPath')} placeholder="/api/my-service" className={fieldClass(errors.publicPath)} />
                    {pathStatus === 'checking' && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                    {pathStatus === 'available' && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-500" />
                    )}
                    {pathStatus === 'taken' && (
                      <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-destructive" />
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
                  <p className="text-xs text-destructive">
                    This path is already used by &quot;{pathConflict}&quot;
                  </p>
                )}
                <div className="flex items-center justify-between p-2 rounded-md border border-border/50 bg-muted/30">
                  <div>
                    <p className="text-xs font-medium">Wildcard routing</p>
                    <p className="text-xs text-muted-foreground">Match all sub-paths (adds /* suffix)</p>
                  </div>
                  <Switch
                    checked={wildcardEnabled}
                    onCheckedChange={(v) => {
                      setWildcardEnabled(v)
                      const current = form.getValues('publicPath')
                      if (v && !current.endsWith('/*')) {
                        const base = current.replace(/\/+$/, '')
                        setValue('publicPath', base + '/*')
                      } else if (!v && current.endsWith('/*')) {
                        setValue('publicPath', current.slice(0, -2))
                      }
                    }}
                  />
                </div>
              </div>
            </Field>
            <Field label="Target URL" error={errors.targetUrl?.message} required hint="Internal service URL or Kubernetes service address">
              <input
                {...register('targetUrl')}
                placeholder="http://my-service.default.svc.cluster.local:8080"
                className={fieldClass(errors.targetUrl)}
              />
            </Field>
            <Field label="HTTP Methods" error={errors.methods?.message} required>
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
            <Field label="Tags">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
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
          </div>
        )}

        {/* Step 1: Advanced */}
        {step === 1 && (
          <div className="space-y-4">
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
            <Field label="Request Body Limit">
              <Select value={watch('requestBodyLimit')} onValueChange={(v) => setValue('requestBodyLimit', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['1mb', '5mb', '10mb', '25mb', '50mb', '100mb'].map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <div>
                <p className="text-sm font-medium">Strip Prefix</p>
                <p className="text-xs text-muted-foreground">Forward to targetUrl root only, no path appended</p>
              </div>
              <Switch
                checked={watch('stripPrefix')}
                onCheckedChange={(v) => setValue('stripPrefix', v)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <div>
                <p className="text-sm font-medium">Verify SSL Certificate</p>
                <p className="text-xs text-muted-foreground">Disable for self-signed or internal certificates</p>
              </div>
              <Switch
                checked={watch('sslVerify')}
                onCheckedChange={(v) => setValue('sslVerify', v)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <div>
                <p className="text-sm font-medium">Rate Limiting</p>
                <p className="text-xs text-muted-foreground">Limit requests per client IP</p>
              </div>
              <Switch
                checked={rateLimitEnabled}
                onCheckedChange={(v) => setValue('rateLimitEnabled', v)}
              />
            </div>
            {rateLimitEnabled && (
              <div className="grid grid-cols-2 gap-4 pl-3 border-l-2 border-primary/30">
                <Field label="Max Requests" hint="Per window per IP">
                  <input type="number" {...register('rateLimitMax')} className={fieldClass()} />
                </Field>
                <Field label="Window (seconds)" hint="1–3600">
                  <input type="number" {...register('rateLimitWindowSeconds')} className={fieldClass()} />
                </Field>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Headers */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium">Add Headers</p>
                  <p className="text-xs text-muted-foreground">Headers to add to proxied requests</p>
                </div>
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium">Path Rewrite Rules</p>
                  <p className="text-xs text-muted-foreground">Regex-based path rewrite rules</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => appendRewrite({ from: '', to: '' })}>
                  <Plus className="w-3 h-3 mr-1" /> Add Rule
                </Button>
              </div>
              <div className="space-y-2">
                {rewriteFields.map((field, i) => (
                  <div key={field.id} className="flex gap-2 items-center">
                    <input {...register(`rewriteRules.${i}.from`)} placeholder="^/v1/(.*)" className={cn(fieldClass(), 'flex-1')} />
                    <span className="text-muted-foreground text-sm">→</span>
                    <input {...register(`rewriteRules.${i}.to`)} placeholder="/api/$1" className={cn(fieldClass(), 'flex-1')} />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRewrite(i)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Security */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Require Auth</p>
                  <p className="text-xs text-muted-foreground">Add authentication to this route</p>
                </div>
                <Switch
                  checked={requireAuth}
                  onCheckedChange={(v) => setValue('requireAuth', v)}
                />
              </div>

              {requireAuth && (
                <div className="space-y-3 pl-3 border-l-2 border-primary/30">
                  <Field label="Auth Type">
                    <Select value={authType} onValueChange={(v) => setValue('authType', v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="API_KEY">API Key</SelectItem>
                        <SelectItem value="BASIC">Basic Auth</SelectItem>
                        <SelectItem value="BEARER">Bearer Token</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Auth Value" hint="Token or credentials to inject">
                    <input type="password" {...register('authValue')} placeholder="••••••••" className={fieldClass()} />
                  </Field>
                </div>
              )}

              <Field label="Webhook Secret" hint="Validate X-Hub-Signature-256 for webhook requests">
                <input type="password" {...register('webhookSecret')} placeholder="Enter webhook secret" className={fieldClass()} />
              </Field>

              <Field label="IP Allowlist" hint="One IP or CIDR per line. Leave empty to allow all.">
                <Textarea {...register('ipAllowlist')} placeholder={"203.0.113.0/24\n198.51.100.42"} rows={3} />
              </Field>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">CORS Enabled</p>
                  <p className="text-xs text-muted-foreground">Allow cross-origin requests</p>
                </div>
                <Switch
                  checked={corsEnabled}
                  onCheckedChange={(v) => setValue('corsEnabled', v)}
                />
              </div>

              {corsEnabled && (
                <Field label="CORS Origins" hint="One origin per line">
                  <Textarea {...register('corsOrigins')} placeholder={"https://app.yourdomain.com\nhttps://admin.yourdomain.com"} rows={3} />
                </Field>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Maintenance */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <div>
                <p className="text-sm font-medium">Maintenance Mode</p>
                <p className="text-xs text-muted-foreground">Return 503 to all incoming requests</p>
              </div>
              <Switch
                checked={maintenanceMode}
                onCheckedChange={(v) => setValue('maintenanceMode', v)}
              />
            </div>
            {maintenanceMode && (
              <Field label="Maintenance Message" hint="Shown to users when maintenance mode is active">
                <Textarea
                  {...register('maintenanceMessage')}
                  placeholder="This service is temporarily unavailable. Please try again later."
                  rows={3}
                />
              </Field>
            )}
            {!maintenanceMode && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <div className="text-5xl mb-4">✅</div>
                <p className="text-sm font-medium text-foreground">Service Active</p>
                <p className="text-xs">Toggle maintenance mode if you need to temporarily disable this route</p>
              </div>
            )}
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
            <Button type="button" onClick={handleNext} disabled={isSubmitting}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting}>
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
