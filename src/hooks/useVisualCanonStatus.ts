/**
 * useVisualCanonStatus — Shared hook for Visual Canon UI components.
 *
 * Calls the visual-canon-status edge function and returns canon status,
 * governance, and optional image provenance.
 *
 * Shared by:
 * - CertificationBadge (VisualizeWorkspace)
 * - ProvenanceDrawer (ImageViewer)
 * - WardrobeCanonPanel
 * - ProductionDesignPanel
 * - ReadinessStrip (VisualProductionPipeline)
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'

export interface CanonStatus {
  identity: { active: boolean; characters: number }
  wardrobe: { active: boolean; profiles: number; assignments: number }
  pd: { active: boolean; locations: number; templates: number }
}

export interface GovernanceStage {
  stage: string
  status: string
  blocked: boolean
  blockers: string[]
}

export interface ImageProvenance {
  identity_mode?: string
  identity_locked?: boolean
  wardrobe_canon_used?: boolean
  wardrobe_state_key?: string
  wardrobe_state_name?: string
  pd_canon_consumed?: boolean
  canon_sources_used?: string[]
  pd_location_design_id?: string
  pd_template_name?: string
  fallback_used?: boolean
}

export interface PipelineReady {
  identity_canon: boolean
  wardrobe_canon: boolean
  production_design_canon: boolean
  governance_cleared: boolean
  vpb_ready: boolean
}

export interface VisualCanonStatusData {
  project_id: string
  canon_status: CanonStatus
  governance: GovernanceStage[]
  provenance: ImageProvenance | null
  pipeline_ready: PipelineReady
  certified: boolean
  certification: string
}

interface UseVisualCanonStatusOptions {
  projectId?: string
  imageId?: string
  enabled?: boolean
}

interface UseVisualCanonStatusReturn {
  data: VisualCanonStatusData | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useVisualCanonStatus({
  projectId,
  imageId,
  enabled = true,
}: UseVisualCanonStatusOptions): UseVisualCanonStatusReturn {
  const [data, setData] = useState<VisualCanonStatusData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!projectId || !enabled) return
    setIsLoading(true)
    setError(null)

    try {
      const body: Record<string, string> = { project_id: projectId }
      if (imageId) body.image_id = imageId

      const { data: result, error: invokeError } = await supabase.functions.invoke(
        'visual-canon-status',
        { body }
      )

      if (invokeError) throw new Error(invokeError.message)
      setData(result as VisualCanonStatusData)
    } catch (err: any) {
      setError(err.message || 'Failed to load canon status')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, imageId, enabled])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return { data, isLoading, error, refresh: fetchStatus }
}