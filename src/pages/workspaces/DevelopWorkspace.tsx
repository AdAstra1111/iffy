/**
 * DevelopWorkspace — Full workspace for story development.
 *
 * Layout:
 * ┌───────────────────────────────────────────────┐
 * │ [Ladder: ●Idea ●Brief ○Treatment ○...]       │
 * ├───────────────────────────────────────────────┤
 * │ ┌─────────────────────────┐ ┌─────────────┐  │
 * │ │                         │ │ Canon       │  │
 * │ │  Document Viewer         │ │ Context     │  │
 * │ │  (Comfortable width)    │ │ Rail        │  │
 * │ │                         │ │             │  │
 * │ │  [Generate] [Approve ▸] │ │ Notes (3)   │  │
 * │ │                         │ │ Score: 82   │  │
 * └─────────────────────────────└───────────────┘
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ExternalLink } from 'lucide-react'

import { useProject } from '@/hooks/useProjects'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useProjectNotes } from '@/lib/notes/useProjectNotes'
import { useProjectCanon } from '@/hooks/useProjectCanon'
import { supabase } from '@/integrations/supabase/client'
import { getNextStage } from '@/lib/stages/registry'

import DocumentLadder from '@/components/develop/DocumentLadder'
import DocumentViewer from '@/components/develop/DocumentViewer'
import CanonContextRail from '@/components/develop/CanonContextRail'
import QualityScore from '@/components/develop/QualityScore'
import DevelopToolbar from '@/components/develop/DevelopToolbar'
import { useExpertMode } from '@/hooks/useExpertMode'
import { ExpertModeGate } from '@/components/shell/ExpertModeGate'

import type { LadderDocument } from '@/lib/adapters/AdapterTypes'
import { getLadderForFormat } from '@/lib/stages/registry'

// ── Expert mode panel (lazy-loaded, never fetched when expert mode disabled) ──
const ExpertDevelopPanel = React.lazy(() => import('@/components/develop/ExpertDevelopPanel'))

// ── Label map ───────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea / Logline',
  concept_brief: 'Concept Brief',
  treatment: 'Treatment',
  story_outline: 'Story Outline',
  character_bible: 'Character Bible',
  beat_sheet: 'Beat Sheet',
  feature_script: 'Script',
  episode_script: 'Episode Script',
  season_script: 'Season Script',
  production_draft: 'Production Draft',
}

function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Main Workspace ──────────────────────────────────────────────────────────

const DevelopWorkspace: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const flagEnabled = useFeatureFlag('NEW_WORKSPACE_DEVELOP')
  const expertMode = useExpertMode()

  // ── Project context ────────────────────────────────────────────────────
  const { project, isLoading: projectLoading } = useProject(projectId)
  const format = project?.format || ''

  // ── Ladder state ───────────────────────────────────────────────────────
  const [stages, setStages] = useState<LadderDocument[]>([])
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [currentDocId, setCurrentDocId] = useState<string | null>(null)
  const [ladderLoading, setLadderLoading] = useState(true)
  const [ladderError, setLadderError] = useState<string | null>(null)

  // ── Generation state ───────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const [qualityScore, setQualityScore] = useState<number | null>(null)

  // ── Notes ──────────────────────────────────────────────────────────────
  const { data: notes = [] } = useProjectNotes(projectId)
  const notesCount = notes.length

  // ── Canon ──────────────────────────────────────────────────────────────
  useProjectCanon(projectId)

  // ── Hydrate ladder from DB ─────────────────────────────────────────────
  const hydrate = useCallback(async () => {
    if (!projectId || !format) return

    setLadderLoading(true)
    setLadderError(null)

    try {
      const ladder = getLadderForFormat(format)
      if (!ladder) {
        setStages([])
        setCurrentStage(null)
        setCurrentDocId(null)
        return
      }

      // Fetch existing documents
      const { data: docs, error } = await supabase
        .from('project_documents')
        .select('id, doc_type, approval_status, title')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Group by doc_type (latest per type)
      const docMap = new Map<string, { id: string; title: string; approval_status: string | null }>()
      for (const doc of docs || []) {
        if (!docMap.has(doc.doc_type)) {
          docMap.set(doc.doc_type, doc)
        }
      }

      let firstIncomplete: string | null = null
      let firstIncompleteDocId: string | null = null

      const hydrated: LadderDocument[] = ladder.map((stage) => {
        const existing = docMap.get(stage)
        const exists = !!existing
        const approvalStatus = existing?.approval_status ?? null
        const isApproved = approvalStatus === 'approved'

        const status: LadderDocument['status'] = !exists
          ? 'not_started'
          : isApproved
            ? 'approved'
            : 'complete'

        if (!firstIncomplete && status !== 'approved') {
          firstIncomplete = stage
          firstIncompleteDocId = existing?.id || null
        }

        return {
          id: existing?.id || stage,
          stage,
          title: getStageLabel(stage),
          status,
          qualityScore: undefined,
        }
      })

      // If all approved, current is last
      if (!firstIncomplete && hydrated.length > 0) {
        firstIncomplete = hydrated[hydrated.length - 1].stage
        firstIncompleteDocId = hydrated[hydrated.length - 1].id
      }

      setStages(hydrated)
      setCurrentStage(firstIncomplete)
      setCurrentDocId(firstIncompleteDocId)

      // Load quality score for current doc if exists
      if (firstIncompleteDocId) {
        loadQualityScore(firstIncompleteDocId)
      } else {
        setQualityScore(null)
      }
    } catch (err: any) {
      setLadderError(err.message || 'Failed to load document ladder')
    } finally {
      setLadderLoading(false)
    }
  }, [projectId, format])

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // ── Quality score loader ───────────────────────────────────────────────
  const loadQualityScore = async (docId: string) => {
    try {
      // Look up the latest version for this doc
      const { data: version } = await supabase
        .from('project_document_versions')
        .select('id')
        .eq('document_id', docId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!version) {
        setQualityScore(null)
        return
      }

      // Check for convergence run quality
      const { data: run } = await supabase
        .from('development_runs')
        .select('output_json')
        .eq('version_id', version.id)
        .eq('run_type', 'CONVERGENCE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (run?.output_json?.stage_readiness_score != null) {
        setQualityScore(Math.round(run.output_json.stage_readiness_score * 100))
      } else if (run?.output_json?.convergence_score != null) {
        setQualityScore(Math.round(run.output_json.convergence_score * 100))
      } else {
        setQualityScore(null)
      }
    } catch {
      setQualityScore(null)
    }
  }

  // ── Ladder stage selection ─────────────────────────────────────────────
  const handleStageSelect = useCallback((stage: string) => {
    const doc = stages.find((s) => s.stage === stage)
    if (!doc) return
    setCurrentStage(stage)
    setCurrentDocId(doc.status === 'not_started' ? null : doc.id)
    if (doc.id && (doc.status === 'complete' || doc.status === 'approved')) {
      loadQualityScore(doc.id)
    } else {
      setQualityScore(null)
    }
  }, [stages])

  // ── Generate ───────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!projectId || !currentStage) return

    setIsGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('dev-engine-v2', {
        body: {
          action: 'generate',
          projectId,
          docType: currentStage,
        },
      })

      if (error) throw new Error(error.message || 'Generation failed')

      toast.success(`Generated ${getStageLabel(currentStage)}`)
      await hydrate()
    } catch (err: any) {
      toast.error(err.message || 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [projectId, currentStage, hydrate])

  // ── Regenerate ─────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (!projectId || !currentStage) return

    setIsGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('dev-engine-v2', {
        body: {
          action: 'generate',
          projectId,
          docType: currentStage,
          regenerate: true,
        },
      })

      if (error) throw new Error(error.message || 'Regeneration failed')

      toast.success(`Regenerated ${getStageLabel(currentStage)}`)
      await hydrate()
    } catch (err: any) {
      toast.error(err.message || 'Regeneration failed')
    } finally {
      setIsGenerating(false)
    }
  }, [projectId, currentStage, hydrate])

  // ── Approve & Advance ──────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!projectId || !currentDocId || !currentStage) return

    try {
      // Approve the current document
      const { error: approveError } = await supabase
        .from('project_documents')
        .update({ approval_status: 'approved' })
        .eq('id', currentDocId)
        .eq('project_id', projectId)

      if (approveError) throw approveError

      // Trigger auto-run pipeline to advance to next stage
      const nextStage = getNextStage(currentStage, format)
      if (nextStage) {
        // Fire-and-forget: invoke auto-run to advance pipeline
        supabase.functions.invoke('auto-run', {
          body: {
            action: 'run-next',
            projectId,
            docType: nextStage,
          },
        }).catch(() => {
          // Non-blocking — advancement continues on next poll
        })
      }

      toast.success(`Approved ${getStageLabel(currentStage)}`)
      await hydrate()
    } catch (err: any) {
      toast.error(err.message || 'Approval failed')
    }
  }, [projectId, currentDocId, currentStage, format, hydrate])

  // ── Notes click ────────────────────────────────────────────────────────
  const handleNotesClick = useCallback(() => {
    toast.info(`${notesCount} note${notesCount !== 1 ? 's' : ''} on this project`)
  }, [notesCount])

  // ── Compute toolbar state ──────────────────────────────────────────────
  const canGenerate = !!currentStage
  const currentDoc = stages.find((s) => s.stage === currentStage)
  const canApprove = !!currentDocId && !!currentDoc && currentDoc.status === 'complete'

  // If flag is disabled, let legacy PDE load
  if (!flagEnabled) {
    return null
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (projectLoading || ladderLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (ladderError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <p className="text-sm text-destructive mb-2">Failed to load workspace</p>
        <p className="text-xs text-muted-foreground">{ladderError}</p>
        <button
          onClick={hydrate}
          className="mt-4 text-xs text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Empty state (no format) ────────────────────────────────────────────
  if (!format && !projectLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          This project has no format configured. Set a format to begin development.
        </p>
        <Link
          to={`/projects/${projectId}/settings`}
          className="mt-3 text-xs text-primary hover:underline"
        >
          Go to project settings
        </Link>
      </div>
    )
  }

  // ── Empty ladder ───────────────────────────────────────────────────────
  if (stages.length === 0 && !ladderLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No document ladder defined for format &quot;{format}&quot;
        </p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Ladder bar */}
      <div className="border-b border-border/40 bg-muted/10">
        <DocumentLadder
          documents={stages}
          currentDoc={currentStage}
          onSelect={handleStageSelect}
        />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Document viewer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentDocId ? (
            <DocumentViewer docId={currentDocId} projectId={projectId!} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {currentStage
                  ? `No document yet for ${getStageLabel(currentStage)} — click Generate`
                  : 'Select a stage to view'}
              </p>
            </div>
          )}
        </div>

        {/* Right rail — canon context + quality score */}
        <CanonContextRail
          projectId={projectId!}
          currentDocType={currentStage}
        />
      </div>

      {/* Bottom toolbar */}
      <DevelopToolbar
        isGenerating={isGenerating}
        canApprove={canApprove}
        canGenerate={canGenerate}
        notesCount={notesCount}
        onGenerate={handleGenerate}
        onRegenerate={handleRegenerate}
        onApprove={handleApprove}
        onNotesClick={handleNotesClick}
      />

      {/* Quality score overlay in bottom-right of content */}
      {qualityScore !== null && (
        <div className="absolute bottom-16 right-72 z-10">
          <QualityScore score={qualityScore} />
        </div>
      )}

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

      {/* Expert mode metadata panel */}
      {expertMode && (
        <Suspense fallback={null}>
          <ExpertDevelopPanel projectId={projectId!} docId={currentDocId} />
        </Suspense>
      )}
    </div>
  )
}

export default DevelopWorkspace