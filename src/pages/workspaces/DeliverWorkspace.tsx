/**
 * DeliverWorkspace — Export project in every format.
 *
 * Layout:
 * ┌──────────────────────────────────────────────┐
 * │ Export Project                                │
 * │                                               │
 * │ 📄 PDF Script                     [Download]  │
 * │ 📄 FDX Export                     [Download]  │
 * │ 📄 ICS Calendar                   [Download]  │
 * │ 📊 XLS Budget                     [Download]  │
 * │ 📦 Share Pack                     [Create Link]│
 * │                                               │
 * │ Legacy: "Open in Classic View"               │
 * └──────────────────────────────────────────────┘
 */
import React, { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink, Loader2, CheckCircle2, AlertCircle, Link2 } from 'lucide-react'
import { toast } from 'sonner'

import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useSharePack } from '@/hooks/useSharePack'
import { deliverAdapter } from '@/lib/adapters/deliverAdapter'
import type { ExportTypeInfo } from '@/lib/adapters/AdapterTypes'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ── Query keys ───────────────────────────────────────────────────────────────

const QK = {
  exportTypes: (pid: string) => ['deliver-export-types', pid] as const,
}

// ── Main Workspace ───────────────────────────────────────────────────────────

const DeliverWorkspace: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const flagEnabled = useFeatureFlag('NEW_WORKSPACE_DELIVER')

  // ── Feature flag guard ─────────────────────────────────────────────────
  if (!flagEnabled) {
    return null
  }

  return <DeliverWorkspaceInner projectId={projectId} />
}

// ── Inner component (flag gate resolved) ─────────────────────────────────────

const DeliverWorkspaceInner: React.FC<{ projectId: string | undefined }> = ({ projectId }) => {
  // ── Export types ───────────────────────────────────────────────────────
  const {
    data: exportTypes = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QK.exportTypes(projectId || ''),
    queryFn: () => deliverAdapter.getExportTypes(projectId!),
    enabled: !!projectId,
  })

  // ── Per-format download state ──────────────────────────────────────────
  const [downloading, setDownloading] = useState<string | null>(null)

  // ── Share pack state ───────────────────────────────────────────────────
  const [sharePackOpen, setSharePackOpen] = useState(false)
  const { createPack, createLink } = useSharePack(projectId)
  const [packName, setPackName] = useState('')
  const [creatingLink, setCreatingLink] = useState(false)

  // ── Download handler ───────────────────────────────────────────────────
  const handleDownload = useCallback(async (format: string) => {
    if (!projectId) return
    setDownloading(format)
    try {
      const result = await deliverAdapter.exportProject(format, projectId)
      if (result.status === 'failed') {
        toast.error(result.error || 'Export failed')
      } else {
        toast.success('Export started — check your downloads')
      }
    } catch (err: any) {
      toast.error(err.message || 'Export failed')
    } finally {
      setDownloading(null)
    }
  }, [projectId])

  // ── Share pack handler ─────────────────────────────────────────────────
  const handleCreateSharePack = useCallback(async () => {
    if (!projectId) return
    setCreatingLink(true)
    try {
      const pack = await createPack.mutateAsync({
        name: packName.trim() || 'Share Pack',
        pack_type: 'investor',
        selection: [{ doc_type: 'concept_brief' }, { doc_type: 'market_sheet' }, { doc_type: 'script' }],
        include_cover: true,
        include_contents: true,
        watermark_enabled: true,
      })

      const link = await createLink.mutateAsync({
        share_pack_id: pack.id,
        expires_in_days: 30,
      })

      const shareUrl = `${window.location.origin}/share/pack/${link.token}`
      toast.success('Share link created!')
      await navigator.clipboard.writeText(shareUrl).catch(() => {})
      toast.info('Link copied to clipboard')

      setPackName('')
      setSharePackOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create share pack')
    } finally {
      setCreatingLink(false)
    }
  }, [projectId, packName, createPack, createLink])

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading export options...</p>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-sm text-destructive mb-1">Failed to load export options</p>
        <p className="text-xs text-muted-foreground mb-4">{(error as any)?.message || 'Unknown error'}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  // ── Empty state (no project) ───────────────────────────────────────────
  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const exportItems = exportTypes.filter((e) => e.format !== 'share_pack')
  const sharePackItem = exportTypes.find((e) => e.format === 'share_pack')

  return (
    <div className="flex flex-col min-h-[60vh]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Export Project</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Download your project in professional formats — scripts, budgets, calendars, and share packs.
          </p>
        </div>
        <Link
          to={`/projects/${projectId}/development`}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Classic View
        </Link>
      </div>

      {/* Export list */}
      <div className="space-y-3">
        {/* Downloadable exports */}
        {exportItems.map((item) => (
          <ExportRow
            key={item.format}
            item={item}
            onDownload={handleDownload}
            isDownloading={downloading === item.format}
          />
        ))}

        {/* Share Pack (separate UX) */}
        {sharePackItem && (
          <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl flex-shrink-0">{sharePackItem.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{sharePackItem.label}</p>
                <p className="text-xs text-muted-foreground truncate">{sharePackItem.description}</p>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              className="flex-shrink-0 gap-1.5"
              onClick={() => setSharePackOpen(true)}
            >
              <Link2 className="h-3.5 w-3.5" />
              Create Link
            </Button>
          </div>
        )}

        {/* Empty state */}
        {exportTypes.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">No export options available for this project.</p>
          </div>
        )}
      </div>

      {/* Share Pack Dialog */}
      <Dialog open={sharePackOpen} onOpenChange={setSharePackOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Share Pack</DialogTitle>
            <DialogDescription>
              Generate a shareable link with key project documents. Recipients can view and download approved materials.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pack-name">Pack Name</Label>
              <Input
                id="pack-name"
                placeholder="e.g. Investor Pack"
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
              />
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Included documents:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Concept Brief</li>
                <li>Market Sheet</li>
                <li>Script</li>
              </ul>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Link expires in 30 days &middot; Watermarked &middot; Password not set
            </p>
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleCreateSharePack}
              disabled={creatingLink || createPack.isPending || createLink.isPending}
              className="gap-1.5"
            >
              {creatingLink ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" />
                  Create Link
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Export Row Component ─────────────────────────────────────────────────────

interface ExportRowProps {
  item: ExportTypeInfo
  onDownload: (format: string) => void
  isDownloading: boolean
}

const ExportRow: React.FC<ExportRowProps> = ({ item, onDownload, isDownloading }) => {
  return (
    <div
      className={`
        flex items-center justify-between py-3 px-4 rounded-lg border transition-colors
        ${item.available
          ? 'border-border bg-card hover:bg-muted/30'
          : 'border-border/40 bg-muted/10 opacity-50'
        }
      `}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl flex-shrink-0">{item.icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{item.label}</p>
            {item.estimatedSize && (
              <span className="text-[10px] text-muted-foreground/60">{item.estimatedSize}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        </div>
      </div>

      {item.available ? (
        <Button
          variant="outline"
          size="sm"
          className="flex-shrink-0 gap-1.5"
          onClick={() => onDownload(item.format)}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              Download
            </>
          )}
        </Button>
      ) : (
        <span className="text-[11px] text-muted-foreground/50 flex-shrink-0">Not yet available</span>
      )}
    </div>
  )
}

export default DeliverWorkspace