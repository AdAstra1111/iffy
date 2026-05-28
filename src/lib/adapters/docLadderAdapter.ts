/**
 * docLadderAdapter — Real implementation for Develop workspace.
 *
 * Wires the document ladder to:
 *  - getLadderForFormat from '@/lib/stages/registry' (stage definitions)
 *  - project_documents table (existing docs, approval state)
 *  - dev-engine-v2 edge function (generation)
 *  - auto-run pipeline (approval + advancement)
 */
import type {
  DocLadderAdapter,
  GenerationResult,
  GenerationIntent,
  LadderDocument,
} from './AdapterTypes'
import { getLadderForFormat } from '@/lib/stages/registry'
import { supabase } from '@/integrations/supabase/client'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Known label lookup for human-readable titles */
const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea / Logline',
  concept_brief: 'Concept Brief',
  market_sheet: 'Market Sheet',
  vertical_market_sheet: 'Vertical Market Sheet',
  treatment: 'Treatment',
  story_outline: 'Story Outline',
  character_bible: 'Character Bible',
  beat_sheet: 'Beat Sheet',
  episode_beats: 'Episode Beats',
  feature_script: 'Script',
  episode_script: 'Episode Script',
  season_script: 'Season Script',
  season_master_script: 'Season Master Script',
  production_draft: 'Production Draft',
  deck: 'Deck',
  documentary_outline: 'Documentary Outline',
  format_rules: 'Format Rules',
  season_arc: 'Season Arc',
  episode_grid: 'Episode Grid',
  vertical_episode_beats: 'Vertical Episode Beats',
  series_writer: "Writer's Room",
}

function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export const docLadderAdapter: DocLadderAdapter = {
  getLadder(format: string, _projectId?: string): LadderDocument[] {
    const ladder = getLadderForFormat(format)
    if (!ladder) return []
    return ladder.map((stage, idx) => ({
      id: `stage-${stage}-${idx}`,
      stage,
      title: getStageLabel(stage),
      status: 'not_started' as const,
      qualityScore: undefined,
    }))
  },

  /** Synchronous stub — real hydration happens in the workspace hook */
  getCurrentDoc(_projectId?: string): LadderDocument | null {
    return null
  },

  async generateDoc(intent: GenerationIntent, projectId?: string): Promise<GenerationResult> {
    if (!projectId) {
      return { id: '', status: 'failed', error: 'No project ID provided' }
    }

    try {
      const { data, error } = await supabase.functions.invoke('dev-engine-v2', {
        body: {
          action: 'generate',
          projectId,
          intent: intent.type,
          description: intent.description,
        },
      })

      if (error) {
        return { id: '', status: 'failed', error: error.message || 'Generation failed' }
      }

      return {
        id: data?.documentId || data?.id || '',
        status: 'completed',
      }
    } catch (err: any) {
      return {
        id: '',
        status: 'failed',
        error: err?.message || 'Generation failed',
      }
    }
  },

  async approveDoc(docId: string, projectId?: string): Promise<void> {
    if (!docId || !projectId) return
    await supabase
      .from('project_documents')
      .update({ approval_status: 'approved' })
      .eq('id', docId)
      .eq('project_id', projectId)
  },
}

// ── Stateful async helpers (used by the workspace hook) ─────────────────────

export interface HydratedLadder {
  stages: LadderDocument[]
  currentStage: string | null
  currentDocId: string | null
}

/**
 * Hydrate the ladder with real doc data from the DB.
 * Returns the full ladder with correct statuses and the current stage.
 */
export async function hydrateLadder(
  projectId: string,
  format: string,
): Promise<HydratedLadder> {
  const ladder = getLadderForFormat(format)
  if (!ladder) return { stages: [], currentStage: null, currentDocId: null }

  const { data: docs } = await supabase
    .from('project_documents')
    .select('id, doc_type, latest_version_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  // Fetch approval statuses from project_document_versions
  const versionIds = (docs || [])
    .map(d => d.latest_version_id)
    .filter(Boolean) as string[]
  const versionStatusMap = new Map<string, string>()
  if (versionIds.length > 0) {
    const { data: versions } = await supabase
      .from('project_document_versions')
      .select('id, approval_status')
      .in('id', versionIds)
    for (const v of (versions || [])) {
      if (v.approval_status) versionStatusMap.set(v.id, v.approval_status)
    }
  }

  // Group by doc_type (first per type)
  const docMap = new Map<string, { id: string; approval_status: string | null }>()
  for (const doc of docs || []) {
    if (!docMap.has(doc.doc_type)) {
      const status = doc.latest_version_id ? (versionStatusMap.get(doc.latest_version_id) || null) : null
      docMap.set(doc.doc_type, { id: doc.id, approval_status: status })
    }
  }

  let currentStage: string | null = null
  let currentDocId: string | null = null

  const stages: LadderDocument[] = ladder.map((stage, idx) => {
    const existing = docMap.get(stage)
    const exists = !!existing
    const approvalStatus = existing?.approval_status ?? null
    const isApproved = approvalStatus === 'approved'

    const status: LadderDocument['status'] = !exists
      ? 'not_started'
      : isApproved
        ? 'approved'
        : 'complete'

    const doc: LadderDocument = {
      id: existing?.id || `stage-${stage}-${idx}`,
      stage,
      title: getStageLabel(stage),
      status,
      qualityScore: undefined,
    }

    // Current stage = first incomplete (not approved)
    if (!currentStage && status !== 'approved') {
      currentStage = stage
      currentDocId = existing?.id || null
    }

    return doc
  })

  // If all stages are approved, current is the last one
  if (!currentStage && stages.length > 0) {
    const last = stages[stages.length - 1]
    currentStage = last.stage
    currentDocId = last.id
  }

  return { stages, currentStage, currentDocId }
}