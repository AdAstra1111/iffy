/**
 * useCharacterVisualDatasets — Canonical hook for Character Visual Datasets.
 *
 * Parallel to useLocationVisualDatasets.
 * Handles: queries, retrieval resolution, freshness evaluation, regeneration.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  resolveCharacterDatasetForSlot,
  formatCharacterResolutionLog,
  type CharacterVisualDataset,
  type CharacterDatasetResolutionResult,
} from '@/lib/visual/characterDatasetRetrievalResolver';
import {
  computeCharacterCanonHashFromSources,
  evaluateCharacterFreshness,
} from '@/lib/visual/characterDatasetCanonHash';
import { normalizeCharacterKey } from '@/lib/aiCast/normalizeCharacterKey';

// Re-export for convenience
export type { CharacterVisualDataset, CharacterDatasetResolutionResult };

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCharacterVisualDatasets(projectId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ['character-visual-datasets', projectId];

  const datasetsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('character_visual_datasets')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .order('canonical_name');
      if (error) throw error;
      return (data || []) as CharacterVisualDataset[];
    },
    enabled: !!projectId,
  });

  /** Get dataset for a specific character by name */
  const getDatasetForCharacter = (characterName: string): CharacterVisualDataset | undefined => {
    const norm = normalizeCharacterKey(characterName);
    return datasetsQuery.data?.find(d => normalizeCharacterKey(d.canonical_name) === norm);
  };

  /** Get dataset by actor ID */
  const getDatasetByActorId = (actorId: string): CharacterVisualDataset | undefined => {
    return datasetsQuery.data?.find(d => d.ai_actor_id === actorId);
  };

  /**
   * Canonical dataset resolution for a cast/validation slot.
   */
  const resolveForSlot = (
    castSlotKey: string,
    characterName: string,
    currentCanonHash: string | null,
  ): CharacterDatasetResolutionResult => {
    const allDatasets = datasetsQuery.data || [];
    return resolveCharacterDatasetForSlot({
      castSlotKey,
      characterName,
      datasets: allDatasets,
      currentCanonHash,
    });
  };

  /**
   * Evaluate freshness for a character dataset.
   */
  const evaluateFreshness = (
    characterName: string,
    canonCharacter: Record<string, unknown> | null,
    canonJson: Record<string, unknown> | null,
    dnaRow: { visual_prompt_block?: string; identity_signature?: unknown } | null,
    actorInputs: string[],
  ) => {
    const dataset = getDatasetForCharacter(characterName);
    if (!dataset) return { status: 'unknown' as const, reason: 'No dataset exists' };
    const currentHash = computeCharacterCanonHashFromSources(
      canonCharacter as any, canonJson, dnaRow, actorInputs,
    );
    return evaluateCharacterFreshness(dataset.source_canon_hash, currentHash);
  };

  /** Regenerate all character datasets for project */
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('No project');

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) throw new Error('Not authenticated');
      const userId = session.session.user.id;

      // Load canonical inputs
      const [canonResult, dnaResult, castResult] = await Promise.all([
        (supabase as any).from('project_canon').select('canon_json').eq('project_id', projectId).maybeSingle(),
        (supabase as any).from('character_visual_dna').select('*').eq('project_id', projectId).eq('is_current', true),
        (supabase as any).from('project_ai_cast').select('character_key, ai_actor_id, ai_actor_version_id').eq('project_id', projectId),
      ]);

      const canonJson = canonResult.data?.canon_json || {};
      const dnaRows = dnaResult.data || [];
      const castBindings = castResult.data || [];

      // Extract characters from canon
      const characters: Array<{ name: string; canonCharacter: Record<string, unknown> | null }> = [];
      const canonCharacters = canonJson?.characters;
      if (Array.isArray(canonCharacters)) {
        for (const c of canonCharacters) {
          if (c?.name) characters.push({ name: String(c.name), canonCharacter: c });
        }
      }
      // Add DNA characters not yet in list
      for (const dna of dnaRows) {
        if (dna.character_name && !characters.some(c =>
          normalizeCharacterKey(c.name) === normalizeCharacterKey(dna.character_name)
        )) {
          characters.push({ name: dna.character_name, canonCharacter: null });
        }
      }

      if (characters.length === 0) {
        return { datasets: [], summary: { total: 0, failed_count: 0 } };
      }

      // Load actor info for bound characters
      const actorIds = castBindings.map((b: any) => b.ai_actor_id).filter(Boolean);
      let actors: any[] = [];
      if (actorIds.length > 0) {
        const { data: actorData } = await (supabase as any)
          .from('ai_actors')
          .select('id, name, description, negative_prompt, tags')
          .in('id', actorIds);
        actors = actorData || [];
      }

      // Load actor versions for recipe
      const versionIds = castBindings.map((b: any) => b.ai_actor_version_id).filter(Boolean);
      let versions: any[] = [];
      if (versionIds.length > 0) {
        const { data: versionData } = await (supabase as any)
          .from('ai_actor_versions')
          .select('id, actor_id, recipe_json')
          .in('id', versionIds);
        versions = versionData || [];
      }

      // Import builder dynamically to avoid circular deps
      const { buildCharacterVisualDataset } = await import('@/lib/visual/characterDatasetBuilder');
      const { computeCharacterCanonHashFromSources: computeHash } = await import('@/lib/visual/characterDatasetCanonHash');

      const results: any[] = [];
      const errors: Array<{ character: string; error: string }> = [];
      const batchId = crypto.randomUUID();

      for (const { name, canonCharacter } of characters) {
        try {
          const normKey = normalizeCharacterKey(name);
          const dnaRow = dnaRows.find((d: any) => normalizeCharacterKey(d.character_name) === normKey);
          const binding = castBindings.find((b: any) => normalizeCharacterKey(b.character_key) === normKey);
          const actor = binding ? actors.find((a: any) => a.id === binding.ai_actor_id) : null;
          const version = binding ? versions.find((v: any) => v.id === binding.ai_actor_version_id) : null;

          const actorWithRecipe = actor ? {
            ...actor,
            recipe_json: version?.recipe_json || {},
          } : null;

          const actorInputs = actor
            ? [actor.description || '', actor.negative_prompt || '', ...(actor.tags || [])]
            : [];

          const draft = buildCharacterVisualDataset(
            name,
            canonCharacter,
            canonJson,
            dnaRow,
            actorWithRecipe,
          );

          const sourceHash = computeHash(
            canonCharacter as any, canonJson, dnaRow, actorInputs,
          );

          // Retire previous current rows
          await (supabase as any)
            .from('character_visual_datasets')
            .update({ is_current: false })
            .eq('project_id', projectId)
            .ilike('canonical_name', normKey)
            .eq('is_current', true);

          // Get next version
          const { data: existing } = await (supabase as any)
            .from('character_visual_datasets')
            .select('dataset_version')
            .eq('project_id', projectId)
            .ilike('canonical_name', normKey)
            .order('dataset_version', { ascending: false })
            .limit(1);
          const nextVersion = (existing?.[0]?.dataset_version || 0) + 1;

          // Insert new current
          const { data: inserted, error: insertErr } = await (supabase as any)
            .from('character_visual_datasets')
            .insert({
              project_id: projectId,
              canonical_name: name,
              canonical_character_id: draft.canonical_character_id,
              ai_actor_id: draft.ai_actor_id,
              dataset_version: nextVersion,
              source_mode: 'reverse_engineered',
              provenance: { ...draft.provenance, batch_id: batchId },
              completeness_score: draft.completeness_score,
              is_current: true,
              freshness_status: 'fresh',
              stale_reason: null,
              source_canon_hash: sourceHash,
              created_by: userId,

              identity_type: draft.identity_type,
              age_band: draft.age_band,
              sex_gender_presentation: draft.sex_gender_presentation,
              ethnicity_ancestry_expression: draft.ethnicity_ancestry_expression,
              cultural_context: draft.cultural_context,
              beauty_mode: draft.beauty_mode,
              casting_labels: draft.casting_labels,
              reusable_scope: draft.reusable_scope,

              identity_core: draft.identity_core,
              proportion_silhouette: draft.proportion_silhouette,
              surface_identity: draft.surface_identity,
              presence_behavior: draft.presence_behavior,
              lighting_response: draft.lighting_response,
              styling_affinity: draft.styling_affinity,
              narrative_read: draft.narrative_read,

              identity_invariants: draft.identity_invariants,
              allowed_variation: draft.allowed_variation,
              forbidden_drift: draft.forbidden_drift,
              anti_confusion: draft.anti_confusion,
              validation_requirements: draft.validation_requirements,

              slot_portrait: draft.slot_portrait,
              slot_profile: draft.slot_profile,
              slot_three_quarter: draft.slot_three_quarter,
              slot_full_body: draft.slot_full_body,
              slot_expression: draft.slot_expression,
              slot_lighting_response: draft.slot_lighting_response,
            })
            .select('id')
            .single();

          if (insertErr) throw insertErr;
          results.push({ character: name, id: inserted.id });
        } catch (err: any) {
          errors.push({ character: name, error: err.message || String(err) });
        }
      }

      return {
        datasets: results,
        summary: {
          total: results.length,
          failed_count: errors.length,
          batch_id: batchId,
          build_errors: errors,
        },
      };
    },
    onSuccess: (data) => {
      const count = data?.summary?.total || 0;
      const failedCount = data?.summary?.failed_count || 0;
      if (failedCount > 0) {
        toast.warning(`Built ${count} character dataset(s), ${failedCount} had issues`);
      } else {
        toast.success(`Built ${count} character visual dataset(s)`);
      }
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(`Character dataset build failed: ${e.message}`),
  });

  // ── Coverage Summary ──
  const coverageSummary = (() => {
    const datasets = datasetsQuery.data || [];
    const fresh = datasets.filter(d => d.freshness_status === 'fresh').length;
    const stale = datasets.filter(d => d.freshness_status === 'stale').length;
    const unknown = datasets.filter(d => !d.freshness_status || d.freshness_status === 'rebuilding').length;
    return {
      total: datasets.length,
      fresh,
      stale,
      unknown,
      lastRegeneration: datasets.length > 0
        ? datasets.reduce((latest, d) => d.created_at > latest ? d.created_at : latest, datasets[0].created_at)
        : null,
    };
  })();

  return {
    datasets: datasetsQuery.data || [],
    isLoading: datasetsQuery.isLoading,
    getDatasetForCharacter,
    getDatasetByActorId,
    resolveForSlot,
    evaluateFreshness,
    regenerate: regenerateMutation,
    coverageSummary,
    refetch: () => qc.invalidateQueries({ queryKey }),
  };
}
