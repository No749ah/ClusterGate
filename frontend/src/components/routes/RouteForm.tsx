'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Plus, Trash2, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().optional(),
})

type RouteFormValues = z.infer<typeof routeSchema>

const STEPS = ['Basic Info', 'Advanced', 'Headers', 'Security', 'Maintenance']
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

interface RouteFormProps {
  defaultValues?: Partial<RouteFormData>
  onSubmit: (data: RouteFormData) => Promise<void>
  isSubmitting?: boolean
  submitLabel?: string
}

export function RouteForm({ defaultValues, onSubmit, isSubmitting, submitLabel = 'Save Route' }: RouteFormProps) {
  const [step, setStep] = useState(0)
  const [tagInput, setTagInput] = useState('')

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      publicPath: defaultValues?.publicPath ?? '/',
      targetUrl: defaultValues?.targetUrl ?? '',
      methods: defaultValues?.methods ?? ['GET', 'POST'],
      tags: defaultValues?.tags ?? [],
      timeout: defaultValues?.timeout ?? 30000,
      retryCount: defaultValues?.retryCount ?? 0,
      retryDelay: defaultValues?.retryDelay ?? 1000,
      stripPrefix: defaultValues?.stripPrefix ?? false,
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
  const maintenanceMode = watch('maintenanceMode')
  const authType = watch('authType')

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
    const formData: RouteFormData = {
      ...data,
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
              <input {...register('name')} placeholder="n8n Webhooks" className={fieldClass(errors.name)} />
            </Field>
            <Field label="Description" error={errors.description?.message}>
              <Textarea {...register('description')} placeholder="Optional description..." rows={2} />
            </Field>
            <Field label="Public Path" error={errors.publicPath?.message} required hint="e.g. /webhook/xyz">
              <input {...register('publicPath')} placeholder="/webhook/xyz" className={fieldClass(errors.publicPath)} />
            </Field>
            <Field label="Target URL" error={errors.targetUrl?.message} required hint="Internal Kubernetes service URL">
              <input
                {...register('targetUrl')}
                placeholder="http://n8n.default.svc.cluster.local:5678/webhook"
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
                <p className="text-xs text-muted-foreground">Remove the public path prefix before forwarding</p>
              </div>
              <Switch
                checked={watch('stripPrefix')}
                onCheckedChange={(v) => setValue('stripPrefix', v)}
              />
            </div>
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
                    <input {...register(`addHeaders.${i}.key`)} placeholder="Header name" className={cn(fieldClass(), 'flex-1')} />
                    <input {...register(`addHeaders.${i}.value`)} placeholder="Header value" className={cn(fieldClass(), 'flex-1')} />
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
              <input {...register('removeHeaders')} placeholder="X-Internal-Token, X-Debug" className={fieldClass()} />
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
                    <input {...register(`rewriteRules.${i}.from`)} placeholder="^/incoming/(.*)" className={cn(fieldClass(), 'flex-1')} />
                    <span className="text-muted-foreground text-sm">→</span>
                    <input {...register(`rewriteRules.${i}.to`)} placeholder="/webhook/$1" className={cn(fieldClass(), 'flex-1')} />
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
                <input type="password" {...register('webhookSecret')} placeholder="Optional secret" className={fieldClass()} />
              </Field>

              <Field label="IP Allowlist" hint="One IP or CIDR per line. Leave empty to allow all.">
                <Textarea {...register('ipAllowlist')} placeholder="192.168.1.0/24&#10;10.0.0.1" rows={3} />
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
                <Field label="CORS Origins" hint="One origin per line, e.g. https://app.example.com">
                  <Textarea {...register('corsOrigins')} placeholder="https://app.example.com" rows={3} />
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
          disabled={step === 0}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="flex gap-3">
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={handleNext}>
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
