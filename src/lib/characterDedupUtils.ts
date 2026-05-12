/**
 * characterDedupUtils.ts
 * Shared utility for dedup-aware character entity creation.
 * Used by generate-document/index.ts to avoid creating duplicate
 * narrative_entities when a character with the same name or alias
 * already exists in the project.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FindOrCreateResult {
  entity_id: string;
  created: boolean;
}

/**
 * Find an existing narrative_entity for a character name, or create one.
 *
 * Lookup order (case-insensitive):
 * 1. Match `canonical_name` in narrative_entities
 * 2. Match `alias_name` in entity_aliases → return canonical_entity_id
 * 3. If neither found, INSERT a new narrative_entity
 *
 * @param serviceClient - Supabase service_role client (bypasses RLS)
 * @param projectId - Project UUID
 * @param charName - Character name to find or create
 * @param role - Character role (e.g. "protagonist")
 * @param description - Character description
 * @param docType - Source doc type (e.g. "character_bible")
 * @param versionId - Document version ID for meta_json tracking
 */
export async function findOrCreateCharacterEntity(
  serviceClient: SupabaseClient,
  projectId: string,
  charName: string,
  role: string,
  description: string,
  docType: string,
  versionId: string,
): Promise<FindOrCreateResult> {
  // Step 1: Check canonical_name match (case-insensitive)
  const { data: exactMatch } = await serviceClient
    .from('narrative_entities')
    .select('id')
    .eq('project_id', projectId)
    .eq('entity_type', 'character')
    .ilike('canonical_name', charName)
    .maybeSingle();

  if (exactMatch) {
    return { entity_id: exactMatch.id, created: false };
  }

  // Step 2: Check alias table (case-insensitive)
  const { data: aliasMatch } = await serviceClient
    .from('entity_aliases')
    .select('canonical_entity_id')
    .eq('project_id', projectId)
    .ilike('alias_name', charName)
    .maybeSingle();

  if (aliasMatch) {
    return { entity_id: aliasMatch.canonical_entity_id, created: false };
  }

  // Step 3: Create new entity
  const entityKey = `char_${charName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)}`;

  const { data: newEntity, error: insertErr } = await serviceClient
    .from('narrative_entities')
    .insert({
      project_id: projectId,
      entity_key: entityKey,
      canonical_name: charName,
      entity_type: 'character',
      source_kind: 'project_canon',
      source_key: docType,
      meta_json: {
        role,
        extraction_description: description,
        extracted_from: docType,
        bible_version_id: versionId,
      },
    })
    .select('id')
    .single();

  if (insertErr) {
    // Handle race condition: entity was created between our check and insert
    // Retry with a direct lookup
    const { data: retryEntity } = await serviceClient
      .from('narrative_entities')
      .select('id')
      .eq('project_id', projectId)
      .eq('entity_key', entityKey)
      .maybeSingle();

    if (retryEntity) {
      return { entity_id: retryEntity.id, created: false };
    }
    throw new Error(`Failed to create narrative_entity for "${charName}": ${insertErr.message}`);
  }

  return { entity_id: newEntity.id, created: true };
}

/**
 * Check if a character name already exists as an entity or alias in a project.
 * Returns the existing entity_id if found, null otherwise.
 */
export async function findExistingCharacterEntity(
  serviceClient: SupabaseClient,
  projectId: string,
  charName: string,
): Promise<string | null> {
  // Check canonical_name
  const { data: exactMatch } = await serviceClient
    .from('narrative_entities')
    .select('id')
    .eq('project_id', projectId)
    .eq('entity_type', 'character')
    .ilike('canonical_name', charName)
    .maybeSingle();

  if (exactMatch) return exactMatch.id;

  // Check aliases
  const { data: aliasMatch } = await serviceClient
    .from('entity_aliases')
    .select('canonical_entity_id')
    .eq('project_id', projectId)
    .ilike('alias_name', charName)
    .maybeSingle();

  if (aliasMatch) return aliasMatch.canonical_entity_id;

  return null;
}
