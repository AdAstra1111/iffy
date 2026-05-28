/**
 * castAdapter — REAL implementation for Cast workspace MVP.
 *
 * Data sources:
 * - project_characters: character definitions
 * - project_ai_cast: final cast bindings (approve/lock)
 * - casting_candidates: shortlisted/generated candidates
 * - ai_actors: AI actor library
 * - ai_actor_versions + ai_actor_assets: actor assets (headshots, etc.)
 */
import type { CastAdapter, CastingStatus, ActorCandidate } from './AdapterTypes'
import { supabase } from '@/integrations/supabase/client'
import { normalizeCharacterKey } from '@/lib/aiCast/normalizeCharacterKey'
import { bindActorToProjectCharacter } from '@/lib/aiCast/projectCastBindings'

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ProjectCharacter {
  id: string
  name: string
}

interface ProjectAiCast {
  character_key: string
  ai_actor_id: string | null
  ai_actor_version_id: string | null
}

interface CastingCandidateRow {
  character_key: string
  status: string
  ai_actor_id: string | null
}

interface AiActorRow {
  id: string
  name: string
  description: string
  tags: string[]
  approved_version_id: string | null
  roster_ready: boolean
  ai_actor_versions?: Array<{
    id: string
    version_number: number
    ai_actor_assets?: Array<{
      asset_type: string
      public_url: string | null
      storage_path: string | null
      meta_json: any
    }>
  }>
}

/**
 * Get the best headshot URL for an actor by looking at their approved version's
 * assets (or any version's assets if no approved version exists).
 */
function extractHeadshot(actor: AiActorRow): string | undefined {
  if (!actor.ai_actor_versions) return undefined

  for (const version of actor.ai_actor_versions) {
    if (!version.ai_actor_assets) continue
    for (const asset of version.ai_actor_assets) {
      const url = asset.public_url || asset.storage_path
      if (!url) continue
      const assetType = (asset.asset_type || '').toLowerCase()
      const metaShotType = ((asset.meta_json as any)?.shot_type || '').toLowerCase()
      if (
        assetType === 'reference_headshot' ||
        metaShotType === 'identity_headshot' ||
        metaShotType === 'headshot'
      ) {
        return url
      }
    }
  }

  // Fallback to any image
  for (const version of actor.ai_actor_versions) {
    if (!version.ai_actor_assets) continue
    for (const asset of version.ai_actor_assets) {
      const url = asset.public_url || asset.storage_path
      if (url) return url
    }
  }

  return undefined
}

// ── Adapter Implementation ───────────────────────────────────────────────────

export const castAdapter: CastAdapter = {
  async getCastingStatus(projectId: string): Promise<CastingStatus[]> {
    // 1. Load characters from project_characters
    const { data: chars, error: charsError } = await (supabase as any)
      .from('project_characters')
      .select('id, name')
      .eq('project_id', projectId)

    if (charsError) {
      console.error('[castAdapter] getCastingStatus char error:', charsError)
      return []
    }

    const characters: ProjectCharacter[] = chars || []
    if (characters.length === 0) return []

    // 2. Load cast bindings from project_ai_cast
    const { data: bindings } = await (supabase as any)
      .from('project_ai_cast')
      .select('character_key, ai_actor_id, ai_actor_version_id')
      .eq('project_id', projectId)

    const bindingMap = new Map<string, ProjectAiCast>()
    for (const b of (bindings || []) as ProjectAiCast[]) {
      const key = normalizeCharacterKey(b.character_key || '')
      if (key) bindingMap.set(key, b)
    }

    // 3. Load candidates from casting_candidates
    const { data: candidates } = await (supabase as any)
      .from('casting_candidates')
      .select('character_key, status, ai_actor_id')
      .eq('project_id', projectId)

    // Build map: character_key → { count, hasShortlisted }
    const candidateMap = new Map<string, { count: number; hasShortlisted: boolean }>()
    for (const c of (candidates || []) as CastingCandidateRow[]) {
      const key = normalizeCharacterKey(c.character_key || '')
      if (!key) continue
      const existing = candidateMap.get(key) || { count: 0, hasShortlisted: false }
      existing.count++
      if (c.status === 'shortlisted') existing.hasShortlisted = true
      candidateMap.set(key, existing)
    }

    // 4. Build status for each character
    const statuses: CastingStatus[] = []
    for (const char of characters) {
      const key = normalizeCharacterKey(char.name)
      const binding = bindingMap.get(key)
      const candidateInfo = candidateMap.get(key)
      const isBound = !!binding?.ai_actor_id

      let status: CastingStatus['status']
      if (isBound) {
        status = 'approved'
      } else if (candidateInfo?.hasShortlisted) {
        status = 'shortlisted'
      } else if (candidateInfo && candidateInfo.count > 0) {
        status = 'candidates'
      } else {
        status = 'uncast'
      }

      statuses.push({
        characterId: char.id,
        characterName: char.name,
        status,
        boundActorId: binding?.ai_actor_id || undefined,
        candidateCount: candidateInfo?.count || 0,
      })
    }

    return statuses
  },

  async getCandidates(characterId: string, projectId: string): Promise<ActorCandidate[]> {
    // 1. Resolve the character name from project_characters
    const { data: char } = await (supabase as any)
      .from('project_characters')
      .select('name')
      .eq('id', characterId)
      .maybeSingle()

    const charName = (char as any)?.name || ''
    const charKey = normalizeCharacterKey(charName)

    // 2. Get existing shortlisted actor IDs for this character
    const { data: existingCandidates } = await (supabase as any)
      .from('casting_candidates')
      .select('ai_actor_id, status')
      .eq('project_id', projectId)
      .eq('character_key', charKey)

    const shortlistedEntries = ((existingCandidates || []) as CastingCandidateRow[])
      .filter(c => c.status === 'shortlisted')
      .map(c => c.ai_actor_id)
      .filter(Boolean) as string[]
    const shortlistedActorIds = new Set(shortlistedEntries)

    // 3. Check if there's an approved binding already
    const { data: binding } = await (supabase as any)
      .from('project_ai_cast')
      .select('ai_actor_id')
      .eq('project_id', projectId)
      .eq('character_key', charKey)
      .maybeSingle()

    const approvedActorId = (binding as any)?.ai_actor_id || null

    // 4. Load AI actors — prioritize roster_ready actors
    const { data: actors } = await (supabase as any)
      .from('ai_actors')
      .select(`
        id,
        name,
        description,
        tags,
        approved_version_id,
        roster_ready,
        ai_actor_versions!ai_actor_versions_actor_id_fkey(
          id,
          version_number,
          ai_actor_assets(
            asset_type,
            public_url,
            storage_path,
            meta_json
          )
        )
      `)
      .order('roster_ready', { ascending: false })
      .order('created_at', { ascending: false })

    const actorRows: AiActorRow[] = actors || []
    if (actorRows.length === 0) return []

    // 5. Score actors by tag relevance to character
    const charWords = new Set(charName.toLowerCase().split(/[\s_-]+/))
    const charWordArray = Array.from(charWords) as string[]

    const scored = actorRows.map((actor) => {
      const headshotUrl = extractHeadshot(actor)

      // Compute match score based on tag overlap and description relevance
      const actorTags = (actor.tags || []).map((t: string) => t.toLowerCase())
      let score = 0

      // Tag overlap scoring
      const tagWordSet = new Set(actorTags.flatMap(t => t.split(/[\s_-]+/)))
      let overlap = 0
      for (const word of charWordArray) {
        if (tagWordSet.has(word)) overlap++
      }
      score += (overlap / Math.max(charWordArray.length, 1)) * 40

      // Roster-ready bonus
      if (actor.roster_ready) score += 20

      // Name similarity bonus
      const nameWords = actor.name.toLowerCase().split(/[\s_-]+/)
      for (const nw of nameWords) {
        for (const cw of charWordArray) {
          if (nw === cw) score += 5
        }
      }

      // Tag count bonus (more tags = more versatile)
      score += Math.min(actorTags.length * 3, 15)

      // Description length signals richness
      if (actor.description && actor.description.length > 50) score += 5
      if (actor.description && actor.description.length > 200) score += 5

      // Clamp to 0-100
      score = Math.max(0, Math.min(100, score))

      const hasHeadshot = !!headshotUrl

      return {
        id: actor.id,
        name: actor.name,
        headshotUrl,
        matchScore: Math.round(score),
        specialties: actor.tags?.slice(0, 5) || [],
        isShortlisted: shortlistedActorIds.has(actor.id),
        isApproved: approvedActorId === actor.id,
        hasHeadshot,
      } as ActorCandidate & { isShortlisted: boolean; isApproved: boolean; hasHeadshot: boolean }
    })

    // Sort by score descending
    scored.sort((a, b) => b.matchScore - a.matchScore)

    // Remove the internal fields before returning
    return scored.map(({ isShortlisted, isApproved, hasHeadshot, ...rest }) => rest)
  },

  async shortlistActor(characterId: string, actorId: string, projectId: string): Promise<void> {
    // Resolve character name
    const { data: char } = await (supabase as any)
      .from('project_characters')
      .select('name')
      .eq('id', characterId)
      .maybeSingle()

    const charName = (char as any)?.name || ''
    const charKey = normalizeCharacterKey(charName)

    // Check if already shortlisted to avoid duplicates
    const { data: existing } = await (supabase as any)
      .from('casting_candidates')
      .select('id')
      .eq('project_id', projectId)
      .eq('character_key', charKey)
      .eq('ai_actor_id', actorId)
      .eq('status', 'shortlisted')
      .maybeSingle()

    if (existing) return // already shortlisted

    // Insert into casting_candidates with shortlisted status
    const { error } = await (supabase as any)
      .from('casting_candidates')
      .insert({
        project_id: projectId,
        character_key: charKey,
        ai_actor_id: actorId,
        status: 'shortlisted',
        display_name: null,
        headshot_url: null,
        full_body_url: null,
        additional_refs: [],
        generation_config: {},
        batch_id: `manual-${Date.now()}`,
      })

    if (error) {
      console.error('[castAdapter] shortlistActor error:', error)
      throw new Error(`Failed to shortlist actor: ${error.message}`)
    }
  },

  async approveCasting(characterId: string, actorId: string, projectId: string): Promise<void> {
    // Resolve character name
    const { data: char } = await (supabase as any)
      .from('project_characters')
      .select('name')
      .eq('id', characterId)
      .maybeSingle()

    const charName = (char as any)?.name || ''
    const charKey = normalizeCharacterKey(charName)

    // Use canonical bindActorToProjectCharacter which validates roster_ready
    // and upserts into project_ai_cast
    await bindActorToProjectCharacter({
      projectId,
      characterKey: charKey,
      actorId,
    })

    // Also mark any shortlisted candidates for this character as promoted
    const { error: updateError } = await (supabase as any)
      .from('casting_candidates')
      .update({ status: 'promoted' })
      .eq('project_id', projectId)
      .eq('character_key', charKey)
      .eq('ai_actor_id', actorId)

    if (updateError) {
      console.warn('[castAdapter] approveCasting candidate update warning:', updateError.message)
    }
  },

  async removeShortlist(characterId: string, actorId: string, projectId: string): Promise<void> {
    // Resolve character name
    const { data: char } = await (supabase as any)
      .from('project_characters')
      .select('name')
      .eq('id', characterId)
      .maybeSingle()

    const charName = (char as any)?.name || ''
    const charKey = normalizeCharacterKey(charName)

    // Remove from casting_candidates
    const { error } = await (supabase as any)
      .from('casting_candidates')
      .delete()
      .eq('project_id', projectId)
      .eq('character_key', charKey)
      .eq('ai_actor_id', actorId)

    if (error) {
      console.error('[castAdapter] removeShortlist error:', error)
      throw new Error(`Failed to remove shortlist: ${error.message}`)
    }
  },
}