'use client'

import { useState } from 'react'
import {
  ShieldAlert,
  Plus,
  Trash2,
  Loader2,
  Mail,
  CreditCard,
  Phone,
  Landmark,
  Hash,
  FlaskConical,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Code,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SanitizerConfig } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const SAMPLE_TEXT = `Customer: John Doe
Email: john.doe@example.com
Phone: +1 (555) 123-4567
SSN: 123-45-6789
Credit Card: 4532 0151 2345 6789
IBAN: DE89 3704 0044 0532 0130 00
Backup email: jane.smith@company.org`

const builtInPatterns = [
  {
    key: 'maskEmails' as const,
    label: 'Email Addresses',
    desc: 'user@example.com',
    icon: Mail,
    example: 'john.doe@example.com',
    masked: 'j***@example.com',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    key: 'maskCreditCards' as const,
    label: 'Credit Cards',
    desc: 'With Luhn validation',
    icon: CreditCard,
    example: '4532 0151 2345 6789',
    masked: '4532*******6789',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    key: 'maskSSNs' as const,
    label: 'Social Security Numbers',
    desc: 'US SSN format',
    icon: Hash,
    example: '123-45-6789',
    masked: '***-**-6789',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
  },
  {
    key: 'maskPhoneNumbers' as const,
    label: 'Phone Numbers',
    desc: 'International formats',
    icon: Phone,
    example: '+1 (555) 123-4567',
    masked: '+1 (555) ***-****',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10 border-green-500/20',
  },
  {
    key: 'maskIBANs' as const,
    label: 'IBAN Numbers',
    desc: 'International bank accounts',
    icon: Landmark,
    example: 'DE89 3704 0044 0532',
    masked: 'DE89 **** **** **32',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
  },
]

export default function SanitizerPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['sanitizer-config'],
    queryFn: () => api.sanitizer.getConfig(),
  })

  const config = data?.data

  const mutation = useMutation({
    mutationFn: (update: Partial<SanitizerConfig>) => api.sanitizer.updateConfig(update),
    onSuccess: (res) => {
      queryClient.setQueryData(['sanitizer-config'], res)
      toast.success('Sanitizer config updated')
    },
    onError: () => toast.error('Failed to update sanitizer config'),
  })

  // Custom pattern form
  const [newPatternName, setNewPatternName] = useState('')
  const [newPatternRegex, setNewPatternRegex] = useState('')
  const [newPatternReplacement, setNewPatternReplacement] = useState('')

  // Test panel
  const [testInput, setTestInput] = useState('')
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const toggleField = (field: keyof SanitizerConfig) => {
    if (!config) return
    mutation.mutate({ [field]: !config[field] })
  }

  const addCustomPattern = () => {
    if (!config || !newPatternName || !newPatternRegex) return
    try {
      new RegExp(newPatternRegex)
    } catch {
      toast.error('Invalid regex pattern')
      return
    }
    mutation.mutate({
      customPatterns: [
        ...config.customPatterns,
        { name: newPatternName, pattern: newPatternRegex, replacement: newPatternReplacement || '***' },
      ],
    })
    setNewPatternName('')
    setNewPatternRegex('')
    setNewPatternReplacement('')
  }

  const removeCustomPattern = (index: number) => {
    if (!config) return
    mutation.mutate({
      customPatterns: config.customPatterns.filter((_: any, i: number) => i !== index),
    })
  }

  const handleTest = async () => {
    const text = testInput || SAMPLE_TEXT
    setIsTesting(true)
    try {
      const res = await api.sanitizer.test(text)
      setTestOutput(res.data.sanitized)
    } catch {
      toast.error('Failed to test sanitizer')
    } finally {
      setIsTesting(false)
    }
  }

  const activeCount = config
    ? builtInPatterns.filter((p) => config[p.key]).length + config.customPatterns.length
    : 0

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Request Sanitizer</h1>
          <p className="text-muted-foreground mt-1">PII masking for request and response logs</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Request Sanitizer</h1>
          <p className="text-muted-foreground mt-1">
            Automatically mask PII in logged request and response bodies
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={config.enabled ? 'default' : 'secondary'} className="gap-1.5">
            {config.enabled ? (
              <><CheckCircle2 className="w-3 h-3" /> Active</>
            ) : (
              <><XCircle className="w-3 h-3" /> Disabled</>
            )}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {activeCount} pattern{activeCount !== 1 ? 's' : ''} active
          </span>
        </div>
      </div>

      {/* Master Toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex items-center justify-center w-10 h-10 rounded-lg',
                config.enabled ? 'bg-primary/10' : 'bg-muted'
              )}>
                <ShieldAlert className={cn('w-5 h-5', config.enabled ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div>
                <p className="text-sm font-medium">Sanitizer Engine</p>
                <p className="text-xs text-muted-foreground">
                  {config.enabled
                    ? 'PII patterns are being masked in all new request logs'
                    : 'Sanitizer is disabled — raw data will be logged'}
                </p>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={() => toggleField('enabled')}
              disabled={mutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Built-in Patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Built-in Patterns</CardTitle>
          <CardDescription>
            Toggle detection for common PII types
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {builtInPatterns.map((p) => {
              const enabled = config[p.key] as boolean
              const Icon = p.icon
              return (
                <div
                  key={p.key}
                  className={cn(
                    'relative rounded-lg border p-4 transition-all',
                    enabled && config.enabled
                      ? p.bgColor
                      : 'border-border/50 bg-muted/20',
                    !config.enabled && 'opacity-50'
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-4 h-4', enabled ? p.color : 'text-muted-foreground')} />
                      <span className="text-sm font-medium">{p.label}</span>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={() => toggleField(p.key)}
                      disabled={mutation.isPending || !config.enabled}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{p.desc}</p>
                  <div className="text-[11px] font-mono space-y-0.5">
                    <div className="text-muted-foreground">{p.example}</div>
                    <div className={cn('flex items-center gap-1', enabled ? p.color : 'text-muted-foreground')}>
                      <ArrowRight className="w-2.5 h-2.5 flex-shrink-0" />
                      {p.masked}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Custom Patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="w-4 h-4" />
            Custom Patterns
          </CardTitle>
          <CardDescription>
            Define regex patterns to mask domain-specific sensitive data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.customPatterns.length > 0 && (
            <div className="space-y-2">
              {config.customPatterns.map((p: { name: string; pattern: string; replacement: string }, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{p.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">regex</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      <span className="truncate" title={p.pattern}>{p.pattern}</span>
                      <ArrowRight className="w-3 h-3 flex-shrink-0" />
                      <span>{p.replacement}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCustomPattern(i)}
                    disabled={mutation.isPending}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {config.customPatterns.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Code className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No custom patterns defined</p>
              <p className="text-xs mt-1">Add regex patterns to mask domain-specific data</p>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium mb-3">Add New Pattern</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Input
                placeholder="Pattern name"
                value={newPatternName}
                onChange={(e) => setNewPatternName(e.target.value)}
                className="text-sm"
              />
              <Input
                placeholder="Regex (e.g. \bAPI_KEY_\w+\b)"
                value={newPatternRegex}
                onChange={(e) => setNewPatternRegex(e.target.value)}
                className="text-sm font-mono"
              />
              <Input
                placeholder="Replacement (default: ***)"
                value={newPatternReplacement}
                onChange={(e) => setNewPatternReplacement(e.target.value)}
                className="text-sm"
              />
              <Button
                variant="outline"
                onClick={addCustomPattern}
                disabled={!newPatternName || !newPatternRegex || mutation.isPending}
              >
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="w-4 h-4" />
            Test Sanitizer
          </CardTitle>
          <CardDescription>
            Paste sample text to preview how the sanitizer masks it
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Input</label>
              <Textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder={SAMPLE_TEXT}
                rows={8}
                className="font-mono text-xs resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Output</label>
              <div className="rounded-md border border-border bg-muted/30 p-3 min-h-[192px] font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {testOutput ?? 'Click "Run Test" to see results...'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleTest} disabled={isTesting} size="sm">
              {isTesting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
              ) : (
                <><FlaskConical className="w-4 h-4 mr-2" /> Run Test</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTestInput(SAMPLE_TEXT)
                setTestOutput(null)
              }}
            >
              Load Sample Data
            </Button>
            {testOutput && (
              <span className="text-xs text-muted-foreground">
                {testOutput === (testInput || SAMPLE_TEXT) ? 'No changes made' : 'PII patterns masked'}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
