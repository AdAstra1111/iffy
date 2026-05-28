/**
 * Package Adapter — wires PackageWorkspace checklist to existing generation systems.
 *
 * Checks each item type in existing systems and returns status.
 * Routes item generation to the correct backend.
 *
 * Supported item types:
 * - pitch_deck:   Generated via generate-pitch-deck edge function
 * - market_sheet: Generated via dev-engine-v2 (docType market_sheet)
 * - lookbook:     Exported via export-lookbook-pdf edge function
 * - share_pack:   Created via project_share_packs table
 */
import type { PackageAdapter, GenerationResult, GenerationIntent } from './AdapterTypes'
import { supabase } from '@/integrations/supabase/client'

export type PackageItemType = 'pitch_deck' | 'market_sheet' | 'lookbook' | 'share_pack'

const PACKAGE_ITEM_TYPES: PackageItemType[] = [
  'pitch_deck',
  'market_sheet',
  'lookbook',
  'share_pack',
]

const PACKAGE_ITEM_LABELS: Record<PackageItemType, string> = {
  pitch_deck: 'Pitch Deck',
  market_sheet: 'Market Sheet',
  lookbook: 'Lookbook Export',
  share_pack: 'Share Pack',
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'ready':
    case 'completed':
    case 'complete':
      return 'ready'
    case 'generating':
    case 'running':
    case 'pending':
      return 'generating'
    case 'failed':
      return 'failed'
    default:
      return 'not_started'
  }
}

async function checkPitchDeckStatus(projectId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('pitch_decks' as any)
      .select('status')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return 'not_started'
    if (!data) return 'not_started'
    return getStatusLabel(data.status)
  } catch {
    return 'not_started'
  }
}

async function checkMarketSheetStatus(projectId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('project_documents')
      .select('id, approval_status')
      .eq('project_id', projectId)
      .eq('doc_type', 'market_sheet')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return 'not_started'
    if (!data) return 'not_started'
    if (data.approval_status === 'approved') return 'ready'
    return 'complete'
  } catch {
    return 'not_started'
  }
}

async function checkLookbookStatus(projectId: string): Promise<string> {
  try {
    // Check for any export jobs for this project
    const { data, error } = await supabase
      .from('export_jobs' as any)
      .select('status')
      .eq('project_id', projectId)
      .eq('export_type', 'lookbook')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      // If table doesn't exist or other error, assume not_started
      return 'not_started'
    }
    if (!data) return 'not_started'
    return getStatusLabel(data.status)
  } catch {
    return 'not_started'
  }
}

async function checkSharePackStatus(projectId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('project_share_packs' as any)
      .select('id')
      .eq('project_id', projectId)
      .limit(1)
      .maybeSingle()

    if (error) return 'not_started'
    if (!data) return 'not_started'
    return 'ready'
  } catch {
    return 'not_started'
  }
}

async function generatePitchDeck(projectId: string): Promise<GenerationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-pitch-deck', {
      body: { project_id: projectId },
    })
    if (error) throw new Error(error.message || 'Pitch deck generation failed')
    if (data?.error) throw new Error(data.error)
    return { id: data?.deck_id || '', status: 'pending' }
  } catch (err: any) {
    return { id: '', status: 'failed', error: err.message }
  }
}

async function generateMarketSheet(projectId: string): Promise<GenerationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('dev-engine-v2', {
      body: {
        action: 'generate',
        projectId,
        docType: 'market_sheet',
      },
    })
    if (error) throw new Error(error.message || 'Market sheet generation failed')
    return { id: data?.document_id || data?.id || '', status: 'pending' }
  } catch (err: any) {
    return { id: '', status: 'failed', error: err.message }
  }
}

async function generateLookbook(projectId: string): Promise<GenerationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('export-lookbook-pdf', {
      body: { projectId },
    })
    if (error) throw new Error(error.message || 'Lookbook export failed')
    const jobId = data?.job_id || ''
    return { id: jobId, status: 'pending' }
  } catch (err: any) {
    return { id: '', status: 'failed', error: err.message }
  }
}

async function generateSharePack(projectId: string): Promise<GenerationResult> {
  try {
    // Create a default investor share pack
    const { data, error } = await supabase
      .from('project_share_packs' as any)
      .insert({
        project_id: projectId,
        name: 'Investor Pack',
        pack_type: 'investor',
        selection: [
          { doc_type: 'concept_brief' },
          { doc_type: 'market_sheet' },
          { doc_type: 'deck' },
          { doc_type: 'script' },
        ],
      })
      .select()
      .single()

    if (error) throw new Error(error.message || 'Share pack creation failed')
    return { id: data?.id || '', status: 'pending' }
  } catch (err: any) {
    return { id: '', status: 'failed', error: err.message }
  }
}

/**
 * Check each item type in existing systems.
 * Returns an array of { type, status } for each package item.
 */
async function getPackageItems(projectId: string): Promise<{ type: string; status: string }[]> {
  const results = await Promise.allSettled([
    checkPitchDeckStatus(projectId),
    checkMarketSheetStatus(projectId),
    checkLookbookStatus(projectId),
    checkSharePackStatus(projectId),
  ])

  return PACKAGE_ITEM_TYPES.map((type, i) => ({
    type,
    status: results[i].status === 'fulfilled' ? results[i].value : 'not_started',
  }))
}

/**
 * Route generation to the correct backend for the given item type.
 */
async function generateItem(
  type: string,
  _intent: GenerationIntent,
  projectId: string,
): Promise<GenerationResult> {
  switch (type) {
    case 'pitch_deck':
      return generatePitchDeck(projectId)
    case 'market_sheet':
      return generateMarketSheet(projectId)
    case 'lookbook':
      return generateLookbook(projectId)
    case 'share_pack':
      return generateSharePack(projectId)
    default:
      return { id: '', status: 'failed', error: `Unknown package item type: ${type}` }
  }
}

export const packageAdapter: PackageAdapter & {
  ITEM_LABELS: Record<string, string>
  ITEM_TYPES: string[]
} = {
  async getPackageItems(projectId: string): Promise<{ type: string; status: string }[]> {
    return getPackageItems(projectId)
  },

  async generateItem(
    type: string,
    intent: GenerationIntent,
    projectId: string,
  ): Promise<GenerationResult> {
    return generateItem(type, intent, projectId)
  },

  ITEM_LABELS: PACKAGE_ITEM_LABELS,
  ITEM_TYPES: PACKAGE_ITEM_TYPES,
}