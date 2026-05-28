/**
 * PackageWorkspace — Checklist workspace for packaging project deliverables.
 *
 * Layout:
 * ┌──────────────────────────────────┐
 * │ Package Checklist                │
 * │                                  │
 * │ ☐ Pitch Deck      [Generate]    │
 * │ ☐ Market Sheet    [Generate]    │
 * │ ☐ Lookbook Export [Generate]    │
 * │ ☐ Share Pack      [Generate]    │
 * │                                  │
 * │ [Generate All]  [Export Bundle] │
 * └──────────────────────────────────┘
 *
 * Each item shows status. Generation triggers existing backend.
 * Legacy fallback link to classic view.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ExternalLink, Loader2, CheckCircle2, Clock, AlertCircle, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useProject } from '@/hooks/useProjects'
import { packageAdapter } from '@/lib/adapters/packageAdapter'

// ── Types ────────────────────────────────────────────────────────────────────

interface PackageItem {
  type: string
  status: string
  generating: boolean
  error?: string
}

type PackageStatus = 'not_started' | 'generating' | 'ready' | 'complete' | 'failed'

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  not_started: {
    icon: <Clock className="h-4 w-4" />,
    label: 'Not started',
    color: 'text-muted-foreground',
  },
  generating: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'Generating…',
    color: 'text-amber-400',
  },
  complete: {
    icon: <FileText className="h-4 w-4" />,
    label: 'Draft',
    color: 'text-sky-400',
  },
  ready: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: 'Ready',
    color: 'text-emerald-400',
  },
  failed: {
    icon: <AlertCircle className="h-4 w-4" />,
    label: 'Failed',
    color: 'text-destructive',
  },
}

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.not_started
}

// ── Item labels ──────────────────────────────────────────────────────────────

function getItemLabel(type: string): string {
  return (packageAdapter as any).ITEM_LABELS?.[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Main Component ───────────────────────────────────────────────────────────

const PackageWorkspace: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const flagEnabled = useFeatureFlag('NEW_WORKSPACE_PACKAGE')

  // ── Project context ────────────────────────────────────────────────────
  const { project, isLoading: projectLoading } = useProject(projectId)

  // ── Checklist state ────────────────────────────────────────────────────
  const [items, setItems] = useState<PackageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingAll, setGeneratingAll] = useState(false)

  // ── Hydrate checklist ──────────────────────────────────────────────────
  const hydrate = useCallback(async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)

    try {
      const result = await packageAdapter.getPackageItems(projectId)
      setItems(
        result.map((item) => ({
          type: item.type,
          status: item.status,
          generating: false,
        })),
      )
    } catch (err: any) {
      setError(err.message || 'Failed to load package items')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // ── Generate single item ───────────────────────────────────────────────
  const handleGenerate = useCallback(
    async (type: string) => {
      if (!projectId) return

      setItems((prev) => prev.map((item) => (item.type === type ? { ...item, generating: true, error: undefined } : item)))

      try {
        const result = await packageAdapter.generateItem(type, { type: 'regenerate' }, projectId)

        if (result.status === 'failed') {
          throw new Error(result.error || 'Generation failed')
        }

        toast.success(`${getItemLabel(type)} generation started`)
        // Re-hydrate after a short delay to let backend process
        setTimeout(() => hydrate(), 2000)
      } catch (err: any) {
        toast.error(err.message || `Failed to generate ${getItemLabel(type)}`)
        setItems((prev) =>
          prev.map((item) =>
            item.type === type ? { ...item, generating: false, error: err.message } : item,
          ),
        )
      }
    },
    [projectId, hydrate],
  )

  // ── Generate all ───────────────────────────────────────────────────────
  const handleGenerateAll = useCallback(async () => {
    if (!projectId) return

    setGeneratingAll(true)
    const types = (packageAdapter as any).ITEM_TYPES as string[] || items.map((i) => i.type)

    let hasError = false
    for (const type of types) {
      setItems((prev) => prev.map((item) => (item.type === type ? { ...item, generating: true, error: undefined } : item)))

      try {
        const result = await packageAdapter.generateItem(type, { type: 'regenerate' }, projectId)
        if (result.status === 'failed') {
          hasError = true
          setItems((prev) =>
            prev.map((item) =>
              item.type === type ? { ...item, generating: false, error: result.error } : item,
            ),
          )
        }
      } catch (err: any) {
        hasError = true
        setItems((prev) =>
          prev.map((item) =>
            item.type === type ? { ...item, generating: false, error: err.message } : item,
          ),
        )
      }
    }

    if (hasError) {
      toast.error('Some items failed to generate')
    } else {
      toast.success('All generation started')
      setTimeout(() => hydrate(), 2000)
    }
    setGeneratingAll(false)
  }, [projectId, items, hydrate])

  // ── Export bundle ──────────────────────────────────────────────────────
  const handleExportBundle = useCallback(() => {
    toast.info('Bundle export — coming soon')
  }, [])

  // ── Flag check ─────────────────────────────────────────────────────────
  if (!flagEnabled) {
    return null
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (projectLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading package workspace...</p>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-3" />
        <p className="text-sm text-destructive mb-2">Failed to load workspace</p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <button
          onClick={hydrate}
          className="text-xs text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Empty state (no project) ───────────────────────────────────────────
  if (!project && !projectLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <p className="text-sm text-muted-foreground">Project not found</p>
        <Link
          to="/projects"
          className="mt-3 text-xs text-primary hover:underline"
        >
          Back to projects
        </Link>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/10 px-6 py-4">
        <h1 className="text-lg font-semibold">Package Checklist</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Prepare your project for market — generate and organize deliverables
        </p>
      </div>

      {/* Checklist */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No package items available</p>
            </div>
          ) : (
            items.map((item) => {
              const statusCfg = getStatusConfig(item.status)
              const isBusy = item.generating || generatingAll
              return (
                <div
                  key={item.type}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-card px-5 py-4 transition-colors hover:border-border/70"
                >
                  <div className="flex items-center gap-3">
                    {/* Status indicator */}
                    <span className={statusCfg.color}>
                      {item.generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        statusCfg.icon
                      )}
                    </span>

                    {/* Item label */}
                    <div>
                      <span className="text-sm font-medium">{getItemLabel(item.type)}</span>
                      <Badge
                        variant="outline"
                        className={`ml-2 text-[10px] px-1.5 py-0 ${
                          item.status === 'ready'
                            ? 'border-emerald-500/30 text-emerald-400'
                            : item.status === 'failed'
                              ? 'border-destructive/30 text-destructive'
                              : item.status === 'generating'
                                ? 'border-amber-500/30 text-amber-400'
                                : 'border-border/50 text-muted-foreground'
                        }`}
                      >
                        {statusCfg.label}
                      </Badge>
                    </div>

                    {/* Error inline */}
                    {item.error && (
                      <span className="text-[10px] text-destructive ml-1 max-w-[200px] truncate">
                        {item.error}
                      </span>
                    )}
                  </div>

                  {/* Generate button */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleGenerate(item.type)}
                    className="h-8 text-xs"
                  >
                    {item.generating ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                        Generating
                      </>
                    ) : (
                      'Generate'
                    )}
                  </Button>
                </div>
              )
            })
          )}
        </div>

        {/* Bottom actions */}
        {items.length > 0 && (
          <div className="max-w-2xl mx-auto mt-8 flex items-center gap-3">
            <Button
              variant="default"
              size="sm"
              disabled={generatingAll}
              onClick={handleGenerateAll}
              className="h-9"
            >
              {generatingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating All…
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 mr-2" />
                  Generate All
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportBundle}
              className="h-9"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Export Bundle
            </Button>
          </div>
        )}
      </div>

      {/* Legacy fallback link */}
      <div className="border-t border-border/20 px-6 py-2 bg-muted/5">
        <Link
          to={`/projects/${projectId}/development`}
          className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors inline-flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          Open in Classic View
        </Link>
      </div>
    </div>
  )
}

export default PackageWorkspace