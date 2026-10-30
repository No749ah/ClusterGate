'use client'

import { useState } from 'react'
import { BookTemplate, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePathTemplates, useCreatePathTemplate, useDeletePathTemplate } from '@/hooks/usePathTemplates'
import { PathTemplate } from '@/types'

function splitLines(value: string): string[] {
  return value.split('\n').map((s) => s.trim()).filter(Boolean)
}

/**
 * Load a built-in or saved path allowlist template into the route form, or
 * save the current list as a new template. Custom templates are stored in the
 * route's organization (admins without an organization save global ones).
 */
export function PathTemplatePicker({
  value,
  onChange,
  organizationId,
  isAdmin,
}: {
  value: string
  onChange: (next: string) => void
  organizationId?: string | null
  isAdmin: boolean
}) {
  const { data } = usePathTemplates()
  const createTemplate = useCreatePathTemplate()
  const deleteTemplate = useDeletePathTemplate()
  const [selectedId, setSelectedId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const templates: PathTemplate[] = data?.data ?? []
  const selected = templates.find((t) => t.id === selectedId)
  const current = splitLines(value)
  const groups = new Map<string, PathTemplate[]>()
  for (const t of templates) {
    const key = t.builtin ? `Built-in · ${t.category ?? 'Other'}` : t.organizationId ? 'Your organization' : 'Global'
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const apply = (mode: 'replace' | 'add') => {
    if (!selected) return
    const next = mode === 'replace' ? selected.paths : Array.from(new Set([...current, ...selected.paths]))
    onChange(next.join('\n'))
  }

  const canSave = current.length > 0 && (isAdmin || !!organizationId)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <div className="flex items-center gap-2 truncate">
                <BookTemplate className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Load a template…" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {Array.from(groups.entries()).map(([group, list]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {list.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} <span className="text-muted-foreground">({t.paths.length})</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!selected} onClick={() => apply('replace')}>
          Replace
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!selected} onClick={() => apply('add')}>
          Add
        </Button>
        {selected && !selected.builtin && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deleteTemplate.mutate(selected.id, { onSuccess: () => setSelectedId('') })}
            disabled={deleteTemplate.isPending}
            title="Delete this template"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canSave}
          onClick={() => setSaving((v) => !v)}
          title={canSave ? 'Save the current list as a template' : 'Add paths (and pick an organization) to save a template'}
        >
          <Save className="w-3.5 h-3.5 mr-1" /> Save as template
        </Button>
      </div>

      {selected?.description && (
        <p className="text-xs text-muted-foreground">{selected.description}</p>
      )}

      {saving && canSave && (
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name, e.g. Internal LLM gateway"
            maxLength={100}
            onKeyDown={(e) => {
              // Don't submit / advance the route wizard
              if (e.key === 'Enter') e.preventDefault()
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={!name.trim() || createTemplate.isPending}
            onClick={() =>
              createTemplate.mutate(
                { name: name.trim(), paths: current, organizationId: organizationId || null },
                {
                  onSuccess: (res) => {
                    setSaving(false)
                    setName('')
                    if (res?.data?.id) setSelectedId(res.data.id)
                  },
                }
              )
            }
          >
            Save
          </Button>
        </div>
      )}
    </div>
  )
}
