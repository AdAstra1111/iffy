import { supabase } from '@/integrations/supabase/client'
import type {
  VisualAdapter,
  VisualEntity,
  VisualImage,
  GenerationResult,
  GenerationIntent,
  StyleProfile,
} from './AdapterTypes'

/**
 * Raw row shape from project_images table.
 * Uses `as any` casts throughout to match the existing codebase pattern.
 */
interface ImageRow {
  id: string
  project_id: string
  asset_group: string
  generation_purpose?: string
  subject_type?: string
  subject?: string
  curation_state?: string
  is_primary?: boolean
  is_active?: boolean
  role?: string
  storage_path?: string
  storage_bucket?: string
  width?: number
  height?: number
  generation_config?: Record<string, unknown>
  model?: string
  provider?: string
  created_at?: string
  signedUrl?: string | null
}

/** Resolve a signed URL for an image row, matching VPP pattern. */
async function resolveSignedUrl(img: ImageRow): Promise<string | null> {
  if (img.signedUrl) return img.signedUrl
  if (!img.storage_path || !img.storage_bucket) return null
  try {
    const { data } = await supabase.storage
      .from(img.storage_bucket)
      .createSignedUrl(img.storage_path, 3600)
    return data?.signedUrl || null
  } catch {
    return null
  }
}

/**
 * Map curation_state → VisualImage status.
 * 'active' → 'approved', 'candidate' (or null/undefined) → 'pending', anything else → 'rejected'.
 */
function mapCurationState(state: string | undefined | null): 'pending' | 'approved' | 'rejected' {
  if (state === 'active') return 'approved'
  if (state === 'rejected' || state === 'archived') return 'rejected'
  return 'pending'
}

export const visualAdapter: VisualAdapter = {
  async getEntities(type, projectId): Promise<VisualEntity[]> {
    if (!projectId) return []

    if (type === 'character') {
      // Load from project_characters table
      const { data: chars, error } = await (supabase as any)
        .from('project_characters')
        .select('id, name')
        .eq('project_id', projectId)

      if (error) {
        console.error('[visualAdapter] getEntities(characters) error:', error)
        return []
      }

      const rows: Array<{ id: string; name: string }> = chars || []

      // Also check project_canon for any characters not yet in the table
      const { data: canonData } = await (supabase as any)
        .from('project_canon')
        .select('canon_json')
        .eq('project_id', projectId)
        .maybeSingle()

      const canonChars: Array<{ name: string }> =
        canonData?.canon_json?.characters || []

      // Merge: prefer table entries, add canon characters not yet in the table
      const tableNames = new Set(rows.map((c) => c.name.toLowerCase()))
      const merged = [...rows]
      for (const cc of canonChars) {
        if (cc.name && !tableNames.has(cc.name.toLowerCase())) {
          merged.push({ id: `canon-${cc.name}`, name: cc.name } as any)
        }
      }

      // Check which characters have images (get primary images if any)
      const entities: VisualEntity[] = []
      for (const char of merged) {
        const status = await determineEntityStatus('character', char.id, char.name, projectId)
        entities.push({
          id: char.id,
          name: char.name,
          type: 'character',
          status,
        })
      }

      return entities
    }

    if (type === 'location') {
      // Load from canon_locations table
      const { data: locations, error } = await (supabase as any)
        .from('canon_locations')
        .select('id, canonical_name, description, location_type')
        .eq('project_id', projectId)

      if (error) {
        console.error('[visualAdapter] getEntities(locations) error:', error)
        return []
      }

      const rows: Array<{ id: string; canonical_name: string; description?: string; location_type?: string }> = locations || []

      const entities: VisualEntity[] = []
      for (const loc of rows) {
        const status = await determineEntityStatus('location', loc.id, loc.canonical_name, projectId)
        entities.push({
          id: loc.id,
          name: loc.canonical_name,
          type: 'location',
          status,
        })
      }

      return entities
    }

    return []
  },

  async getEntityImages(type, id, projectId): Promise<VisualImage[]> {
    if (!projectId) return []

    // Special type: 'all' loads ALL hero frames for the project (no entity filter)
    if (type === 'all') {
      return getAllHeroFrames(projectId)
    }

    // Determine the entity name from id (needed for subject matching in project_images)
    let entityName = id

    if (type === 'character') {
      // Normalize: for canon-Name IDs, extract the actual name
      if (typeof id === 'string' && id.startsWith('canon-')) {
        entityName = id.slice(6) // strip 'canon-' prefix
      } else {
        const { data } = await (supabase as any)
          .from('project_characters')
          .select('name')
          .eq('id', id)
          .maybeSingle()
        if (data?.name) entityName = data.name
      }
    } else if (type === 'location') {
      const { data } = await (supabase as any)
        .from('canon_locations')
        .select('canonical_name')
        .eq('id', id)
        .maybeSingle()
      if (data?.canonical_name) entityName = data.canonical_name
    }

    // Determine asset_group filter based on entity type
    const assetGroup = type === 'character' ? 'hero_frame' : 'location'

    // Query project_images for this entity
    // Primary: match by subject field
    const { data: images, error } = await (supabase as any)
      .from('project_images')
      .select('id, role, is_primary, curation_state, storage_path, storage_bucket, width, height, generation_config, model, provider, subject_type, subject, location_ref, created_at')
      .eq('project_id', projectId)
      .eq('asset_group', assetGroup)
      .eq('is_active', true)
      .or(`subject.eq.${entityName},subject.eq.${id}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[visualAdapter] getEntityImages error:', error)
      return []
    }

    let rows: ImageRow[] = images || []

    // If no images matched by subject, try fallback matching
    if (rows.length === 0) {
      // For location entities, also check location_ref and generation_config.location_key
      if (type === 'location') {
        const { data: fallback } = await (supabase as any)
          .from('project_images')
          .select('id, role, is_primary, curation_state, storage_path, storage_bucket, width, height, generation_config, model, provider, subject_type, subject, location_ref, created_at')
          .eq('project_id', projectId)
          .eq('asset_group', assetGroup)
          .eq('is_active', true)
          .or(`location_ref.eq.${entityName},location_ref.ilike.%${entityName}%`)
          .order('created_at', { ascending: false })
          .limit(20)
        if (fallback && fallback.length > 0) {
          rows = fallback
        }
      }

      // If still no results, fall back to all hero frames for this project
      if (rows.length === 0) {
        rows = await getAllHeroFramesRaw(projectId, assetGroup)
      }
    }

    // Resolve signed URLs for each image
    const result: VisualImage[] = []
    for (const img of rows) {
      const url = await resolveSignedUrl(img)
      result.push({
        id: img.id,
        url: url || '',
        entityType: type,
        entityId: id,
        status: mapCurationState(img.curation_state),
        isPrimary: !!img.is_primary,
        metadata: {
          width: img.width,
          height: img.height,
          role: img.role,
          model: img.model,
          provider: img.provider,
          subject: img.subject,
          subjectType: img.subject_type,
          generationConfig: img.generation_config,
          createdAt: img.created_at,
        },
      })
    }

    return result
  },

  async generateImage(entityType, entityId, intent, projectId): Promise<GenerationResult> {
    try {
      // For character hero frames, invoke the generation edge function
      if (entityType === 'character') {
        const { data, error } = await supabase.functions.invoke('generate-hero-frames', {
          body: {
            project_id: projectId,
            count: 1,
            character_id: entityId,
            description: intent.description || undefined,
          },
        })

        if (error) {
          console.error('[visualAdapter] generateImage error:', error)
          return {
            id: '',
            status: 'failed',
            error: error.message || 'Generation failed',
          }
        }

        return {
          id: data?.job_id || data?.id || '',
          status: 'pending',
        }
      }

      // For locations, try the lookbook generation or a direct invoke
      if (entityType === 'location') {
        const { data, error } = await supabase.functions.invoke('generate-hero-frames', {
          body: {
            project_id: projectId,
            count: 1,
            location_id: entityId,
            description: intent.description || undefined,
          },
        })

        if (error) {
          return {
            id: '',
            status: 'failed',
            error: error.message || 'Generation failed',
          }
        }

        return {
          id: data?.job_id || data?.id || '',
          status: 'pending',
        }
      }

      return { id: '', status: 'failed', error: 'Unknown entity type' }
    } catch (e: any) {
      console.error('[visualAdapter] generateImage exception:', e)
      return { id: '', status: 'failed', error: e.message || 'Unknown error' }
    }
  },

  async approveImage(imageId): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('project_images')
        .update({ curation_state: 'active' })
        .eq('id', imageId)

      if (error) throw error
    } catch (e: any) {
      console.error('[visualAdapter] approveImage error:', e)
      throw new Error(e.message || 'Failed to approve image')
    }
  },

  async setPrimaryImage(entityType: string, entityId: string, imageId: string, projectId: string): Promise<void> {
      try {
        // First, clear primary flag from all images of this entity
        // Determine asset group based on entity type
        const assetGroup = entityType === 'character' ? 'hero_frame' : 'location'

        // Clear existing primary
        await (supabase as any)
          .from('project_images')
          .update({ is_primary: false, role: entityType === 'character' ? 'hero_variant' : 'location_variant' })
          .eq('project_id', projectId)
          .eq('asset_group', assetGroup)
          .eq('is_primary', true)
          .or(`subject.eq.${entityId},subject_type.eq.${entityType}`)

      // Set new primary
      const { error } = await (supabase as any)
        .from('project_images')
        .update({
          is_primary: true,
          role: entityType === 'character' ? 'hero_primary' : 'location_primary',
          curation_state: 'active',
        })
        .eq('id', imageId)

      if (error) throw error
    } catch (e: any) {
      console.error('[visualAdapter] setPrimaryImage error:', e)
      throw new Error(e.message || 'Failed to set primary image')
    }
  },

  async getStyleProfile(projectId): Promise<StyleProfile> {
    try {
      const { data, error } = await (supabase as any)
        .from('project_visual_style')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()

      if (error) {
        console.error('[visualAdapter] getStyleProfile error:', error)
        return { colorPalette: [], lighting: '', cameraLanguage: '', texture: '' }
      }

      if (!data) {
        return { colorPalette: [], lighting: '', cameraLanguage: '', texture: '' }
      }

      return {
        colorPalette: data.color_response ? [data.color_response] : [],
        lighting: data.lighting_philosophy || '',
        cameraLanguage: data.camera_philosophy || '',
        texture: data.texture_materiality || '',
      }
    } catch (e: any) {
      console.error('[visualAdapter] getStyleProfile exception:', e)
      return { colorPalette: [], lighting: '', cameraLanguage: '', texture: '' }
    }
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine the status of an entity based on whether it has approved images.
 */
async function determineEntityStatus(
  type: string,
  _id: string,
  name: string,
  projectId: string,
): Promise<'empty' | 'has_images' | 'approved'> {
  const assetGroup = type === 'character' ? 'hero_frame' : 'location'

  const { data, error } = await (supabase as any)
    .from('project_images')
    .select('id, curation_state')
    .eq('project_id', projectId)
    .eq('asset_group', assetGroup)
    .eq('is_active', true)
    .or(`subject.eq.${name}`)
    .limit(10)

  if (error || !data || data.length === 0) {
    // Don't mark as empty if the project has ANY active hero frames
    // (the entity may have unbound frames that will show via fallback)
    if (assetGroup === 'hero_frame') {
      const { count } = await (supabase as any)
        .from('project_images')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('asset_group', 'hero_frame')
        .eq('is_active', true)
      if ((count ?? 0) > 0) return 'has_images'
    }
    return 'empty'
  }

  const hasApproved = data.some(
    (img: any) => img.curation_state === 'active',
  )
  if (hasApproved) return 'approved'

  return 'has_images'
}

/**
 * Load ALL active hero frames for a project, without entity subject filtering.
 * Used as fallback display and for the "All Hero Frames" view.
 */
async function getAllHeroFramesRaw(projectId: string, assetGroup: string = 'hero_frame'): Promise<ImageRow[]> {
  const { data, error } = await (supabase as any)
    .from('project_images')
    .select('id, role, is_primary, curation_state, storage_path, storage_bucket, width, height, generation_config, model, provider, subject_type, subject, location_ref, created_at')
    .eq('project_id', projectId)
    .eq('asset_group', assetGroup)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[visualAdapter] getAllHeroFrames error:', error)
    return []
  }
  return data || []
}

/**
 * Get ALL active hero frames for a project, resolved to VisualImage[].
 * Exposed on the adapter surface for the "All Hero Frames" section.
 */
async function getAllHeroFrames(projectId: string): Promise<VisualImage[]> {
  const rows = await getAllHeroFramesRaw(projectId)
  const result: VisualImage[] = []
  for (const img of rows) {
    const url = await resolveSignedUrl(img)
    result.push({
      id: img.id,
      url: url || '',
      entityType: 'all',
      entityId: '',
      status: mapCurationState(img.curation_state),
      isPrimary: !!img.is_primary,
      metadata: {
        width: img.width,
        height: img.height,
        role: img.role,
        model: img.model,
        provider: img.provider,
        subject: img.subject,
        subjectType: img.subject_type,
        generationConfig: img.generation_config,
        createdAt: img.created_at,
      },
    })
  }
  return result
}