/**
 * useVisualProductionBible — VPB data hook.
 *
 * Consumes two edge functions:
 *   vpb-export (POST) — returns markdown + version info
 *   vpb-assembly-engine (POST) — generates/regenerates VPB
 *
 * Architecture-Strict:
 *   No LLM. No inference. Pure deterministic data from upstream.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'

// ── Section Labels ───────────────────────────────────────────────────────

export const VPB_SECTION_LABELS: Record<string, string> = {
  projectOverview: 'Project Overview',
  visualLanguage: 'Visual Language',
  visualStyle: 'Visual Style',
  productionDesign: 'Production Design',
  characters: 'Characters',
  cast: 'Cast',
  locations: 'Locations',
  wardrobe: 'Wardrobe',
  heroFrames: 'Hero Frames',
  posters: 'Posters',
  lookbookSections: 'Lookbook Sections',
  sceneBreakdown: 'Scene Breakdown',
  governance: 'Governance',
  assetInventory: 'Asset Inventory',
}

export const VPB_SECTION_KEYS = Object.keys(VPB_SECTION_LABELS)

// ── Types ────────────────────────────────────────────────────────────────

export interface VPBExportResult {
  projectId: string
  format: string
  versionNumber: number
  markdown: string
  sectionCount: number
}

export interface VPBAssemblyResult {
  projectId: string
  versionNumber: number
  vpbId: string | null
  sectionCount: number
  assetCount: number
  assemblyDurationMs: number
}

// ── Helper: infer section status from markdown ───────────────────────────

function inferSectionStatuses(markdown: string): { section: string; status: string; label: string }[] {
  const lines = markdown.split('\n')
  const sectionMap = new Map<string, { hasContent: boolean; startIdx: number }>()

  let currentSection: string | null = null
  let currentStart = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match ## headings (VPB sections)
    const headingMatch = line.match(/^## (.+)/)
    if (headingMatch) {
      if (currentSection) {
        sectionMap.set(currentSection, { hasContent: false, startIdx: currentStart })
      }
      currentSection = headingMatch[1].trim().toLowerCase().replace(/ /g, '')
      currentStart = i
    }
    // If we're inside a section and there's non-empty, non-heading content
    if (currentSection && line.trim() && !line.startsWith('#') && !line.startsWith('---')) {
      const existing = sectionMap.get(currentSection)
      if (existing) {
        existing.hasContent = true
      } else {
        sectionMap.set(currentSection, { hasContent: true, startIdx: currentStart })
      }
    }
  }
  // Last section
  if (currentSection) {
    if (!sectionMap.has(currentSection)) {
      sectionMap.set(currentSection, { hasContent: false, startIdx: currentStart })
    }
  }

  return VPB_SECTION_KEYS.map((key) => {
    const label = VPB_SECTION_LABELS[key] || key
    const matchKey = key.toLowerCase()
    const entry = sectionMap.get(matchKey) || sectionMap.get(label.toLowerCase().replace(/ /g, ''))
    return {
      section: key,
      status: entry?.hasContent ? 'populated' : 'empty',
      label,
    }
  })
}

// ── Hook ──────────────────────────────────────────────────────────────────

interface UseVisualProductionBibleOptions {
  projectId?: string
  enabled?: boolean
}

interface UseVisualProductionBibleReturn {
  exportResult: VPBExportResult | null
  assemblyResult: VPBAssemblyResult | null
  currentSection: string
  sectionStatuses: { section: string; status: string; label: string }[]
  markdown: string
  versionNumber: number | null
  isLoading: boolean
  isGenerating: boolean
  error: string | null
  setCurrentSection: (key: string) => void
  regenerate: () => Promise<void>
  refresh: () => Promise<void>
}

export function useVisualProductionBible({
  projectId,
  enabled = true,
}: UseVisualProductionBibleOptions): UseVisualProductionBibleReturn {
  const [exportResult, setExportResult] = useState<VPBExportResult | null>(null)
  const [assemblyResult, setAssemblyResult] = useState<VPBAssemblyResult | null>(null)
  const [currentSection, setCurrentSection] = useState('projectOverview')
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch VPB status
  const fetchVPBStatus = useCallback(async () => {
    if (!projectId || !enabled) return
    setIsLoading(true)
    setError(null)

    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        'vpb-export',
        { body: { projectId, format: 'sections' } }
      )
      if (invokeError) throw new Error(invokeError.message)
      setExportResult(result as VPBExportResult)
    } catch (err: any) {
      // No VPB = acceptable
      if (err?.message?.includes('not found') || err?.message?.includes('no rows') || err?.message?.includes('undefined')) {
        setExportResult(null)
        return
      }
      setError(err.message || 'Failed to load VPB status')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, enabled])

  // Regenerate VPB
  const regenerate = useCallback(async () => {
    if (!projectId) return
    setIsGenerating(true)
    setError(null)

    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        'vpb-assembly-engine',
        { body: { projectId } }
      )
      if (invokeError) throw new Error(invokeError.message)
      setAssemblyResult(result as VPBAssemblyResult)

      // Refresh status after generation
      await fetchVPBStatus()
    } catch (err: any) {
      setError(err.message || 'Failed to generate VPB')
    } finally {
      setIsGenerating(false)
    }
  }, [projectId, fetchVPBStatus])

  const refresh = useCallback(async () => {
    await fetchVPBStatus()
  }, [fetchVPBStatus])

  // Auto-fetch on mount
  useEffect(() => {
    fetchVPBStatus()
  }, [fetchVPBStatus])

  // Compute section statuses from markdown
  const markdown = exportResult?.markdown || ''
  const sectionStatuses = exportResult
    ? inferSectionStatuses(markdown)
    : VPB_SECTION_KEYS.map((key) => ({
        section: key,
        status: 'not_generated' as const,
        label: VPB_SECTION_LABELS[key] || key,
      }))

  const versionNumber = exportResult?.versionNumber || null

  return {
    exportResult,
    assemblyResult,
    currentSection,
    sectionStatuses,
    markdown,
    versionNumber,
    isLoading,
    isGenerating,
    error,
    setCurrentSection,
    regenerate,
    refresh,
  }
}

// ── Markdown Section Extraction ──────────────────────────────────────────

/**
 * Extract a specific section's markdown content from the full VPB markdown.
 */
export function extractSectionMarkdown(markdown: string, sectionLabel: string): string {
  const lines = markdown.split('\n')
  const result: string[] = []
  let inSection = false

  for (const line of lines) {
    // Check if this line starts the section
    if (line.startsWith('## ') && !inSection) {
      const headingText = line.replace('## ', '').trim().toLowerCase()
      if (headingText === sectionLabel.toLowerCase()) {
        inSection = true
        result.push(line)
      }
      continue
    }
    // Check if we hit the next ## section
    if (line.startsWith('## ') && inSection) {
      break
    }
    if (inSection) {
      result.push(line)
    }
  }

  return result.join('\n').trim()
}
