/**
 * useVisualCanonCompletion — Canonical visual canon completion hook.
 *
 * Loads real data from DB, feeds the canonical slot resolver,
 * and provides an orchestrated auto-complete action.
 *
 * HARDENED: Completion is measured from visual_sets (the canonical
 * completion substrate used by Character Visuals, Costume-on-Actor,
 * and Production Design), NOT from raw project_images presence.
 *
 * Consumers: Canon Control Layer (CanonPlaceholder), Source Truth Dashboard.
 */
import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  resolveVisualCanonSlots,
  getMissingSlotsByDependencyOrder,
  type VisualCanonCoverage,
  type VisualCanonSlot,
  type SlotResolverInputs,
  type VisualCanonDomain,
} from '@/lib/visual/visualCanonSlotResolver';
import {
  resolveIdentityCompletionKeys,
  resolveWardrobeVisualCompletionKeys,
  resolveLocationPDCompletionIds,
  type VisualSetCompletionRow,
} from '@/lib/visual/canonCompletionProof';

// ── Progress Types ──────────────────────────────────────────────────────────

export type CompletionSlotStatus = 'pending' | 'generating' | 'done' | 'failed' | 'blocked' | 'skipped';

export interface CompletionSlotProgress {
  slot: VisualCanonSlot;
  status: CompletionSlotStatus;
  reason?: string;
}

export interface CompletionProgress {
  running: boolean;
  totalSlots: number;
  currentIndex: number;
  currentDomain: VisualCanonDomain | null;
  slots: CompletionSlotProgress[];
  done: number;
  failed: number;
  blocked: number;
  skipped: number;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useVisualCanonCompletion(projectId: string | undefined) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<CompletionProgress | null>(null);

  // ── Load all inputs for the canonical resolver ──
  const { data: resolverInputs, isLoading } = useQuery({
    queryKey: ['visual-canon-slots', projectId],
    queryFn: async (): Promise<SlotResolverInputs> => {
      if (!projectId) {
        return {
          characters: [], locations: [],
          characterIdentityLinked: new Set(),
          characterWardrobeVisualLinked: new Set(),
          characterWardrobeTruthAvailable: new Set(),
          locationPDLinked: new Set(), castBound: new Set(),
          wardrobeExtractionExists: false,
        };
      }

      // Parallel fetches
      const [
        canonRes, locRes, castRes, visualSetsRes,
      ] = await Promise.all([
        // 1. Canon characters + wardrobe profiles
        (supabase as any).from('project_canon').select('canon_json').eq('project_id', projectId).maybeSingle(),
        // 2. Canon locations
        (supabase as any).from('canon_locations').select('id, canonical_name, normalized_name').eq('project_id', projectId).eq('active', true),
        // 3. Cast bindings
        (supabase as any).from('project_ai_cast').select('character_key').eq('project_id', projectId),
        // 4. CANONICAL SUBSTRATE: visual_sets — the single source of completion truth
        (supabase as any).from('visual_sets')
          .select('id, domain, target_name, target_id, status')
          .eq('project_id', projectId)
          .neq('status', 'archived'),
      ]);

      const canonJson = canonRes.data?.canon_json as Record<string, any> | null;
      const canonChars = Array.isArray(canonJson?.characters) ? canonJson.characters : [];
      const characters = canonChars
        .filter((c: any) => c.name?.trim())
        .map((c: any) => ({
          key: (c.character_key || c.name || '').toLowerCase().trim(),
          name: c.name as string,
        }));

      const locations = (locRes.data || []).map((l: any) => ({
        id: l.id as string,
        name: l.canonical_name as string,
      }));

      // Build location name → id map for degraded fallback
      const locationNameToId = new Map<string, string>();
      for (const l of (locRes.data || [])) {
        if (l.normalized_name) locationNameToId.set(l.normalized_name, l.id);
        if (l.canonical_name) locationNameToId.set(l.canonical_name.toLowerCase().trim(), l.id);
      }

      const castBound = new Set<string>(
        (castRes.data || []).map((c: any) => (c.character_key || '').toLowerCase()).filter(Boolean)
      );

      // ── Canonical completion from visual_sets ──
      const visualSets = (visualSetsRes.data || []) as VisualSetCompletionRow[];

      const characterIdentityLinked = resolveIdentityCompletionKeys(visualSets);
      const characterWardrobeVisualLinked = resolveWardrobeVisualCompletionKeys(visualSets);
      const locationPDLinked = resolveLocationPDCompletionIds(visualSets, locationNameToId);

      // Wardrobe truth (profile existence) — eligibility only
      const wardrobeResult = canonJson?.character_wardrobe_profiles;
      const wardrobeExtractionExists = !!(wardrobeResult && wardrobeResult.extraction_version);
      const characterWardrobeTruthAvailable = new Set<string>(
        wardrobeExtractionExists && Array.isArray(wardrobeResult.profiles)
          ? wardrobeResult.profiles.map((p: any) => (p.character_name || '').toLowerCase())
          : []
      );

      return {
        characters,
        locations,
        characterIdentityLinked,
        characterWardrobeVisualLinked,
        characterWardrobeTruthAvailable,
        locationPDLinked,
        castBound,
        wardrobeExtractionExists,
      };
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });

  // ── Compute coverage from canonical resolver ──
  const coverage: VisualCanonCoverage | null = useMemo(() => {
    if (!resolverInputs) return null;
    return resolveVisualCanonSlots(resolverInputs);
  }, [resolverInputs]);

  // ── Auto-complete orchestrator ──
  const runCompletion = useCallback(async () => {
    if (!coverage || !projectId) return;

    const eligibleSlots = getMissingSlotsByDependencyOrder(coverage);
    if (eligibleSlots.length === 0) return;

    const slotProgress: CompletionSlotProgress[] = eligibleSlots.map(s => ({
      slot: s, status: 'pending' as const,
    }));

    const progressState: CompletionProgress = {
      running: true,
      totalSlots: eligibleSlots.length,
      currentIndex: 0,
      currentDomain: eligibleSlots[0]?.domain || null,
      slots: slotProgress,
      done: 0, failed: 0, blocked: 0, skipped: 0,
    };
    setProgress({ ...progressState });

    for (let i = 0; i < eligibleSlots.length; i++) {
      const slot = eligibleSlots[i];
      progressState.currentIndex = i;
      progressState.currentDomain = slot.domain;
      slotProgress[i].status = 'generating';
      setProgress({ ...progressState, slots: [...slotProgress] });

      try {
        if (slot.domain === 'character_identity') {
          // Route to the canonical identity generation path
          const { error } = await supabase.functions.invoke('generate-lookbook-image', {
            body: {
              project_id: projectId,
              section: 'character_identity',
              character_name: slot.entityLabel,
              character_key: slot.entityKey,
              generation_purpose: 'character_identity',
              count: 1,
            },
          });
          if (error) throw error;
          slotProgress[i].status = 'done';
          progressState.done++;

        } else if (slot.domain === 'character_wardrobe') {
          // Route to the canonical costume-on-actor generation path
          const { error } = await supabase.functions.invoke('generate-lookbook-image', {
            body: {
              project_id: projectId,
              section: 'character_identity',
              character_name: slot.entityLabel,
              character_key: slot.entityKey,
              generation_purpose: 'costume_look',
              count: 1,
            },
          });
          if (error) throw error;
          slotProgress[i].status = 'done';
          progressState.done++;

        } else if (slot.domain === 'production_design_location') {
          // Route to the canonical production design generation path
          const { error } = await supabase.functions.invoke('generate-lookbook-image', {
            body: {
              project_id: projectId,
              section: 'world_locations',
              canon_location_id: slot.entityKey,
              location_name: slot.entityLabel,
              generation_purpose: 'production_design',
              count: 1,
            },
          });
          if (error) throw error;
          slotProgress[i].status = 'done';
          progressState.done++;
        }
      } catch (err: any) {
        slotProgress[i].status = 'failed';
        slotProgress[i].reason = err?.message || 'Generation failed';
        progressState.failed++;
      }

      setProgress({ ...progressState, slots: [...slotProgress] });
    }

    progressState.running = false;
    setProgress({ ...progressState, slots: [...slotProgress] });

    // Invalidate to refresh coverage counts
    qc.invalidateQueries({ queryKey: ['visual-canon-slots', projectId] });
    qc.invalidateQueries({ queryKey: ['canon-visual-alignment', projectId] });
    qc.invalidateQueries({ queryKey: ['visual-sets-summary', projectId] });
  }, [coverage, projectId, qc]);

  return {
    coverage,
    isLoading,
    progress,
    runCompletion,
  };
}
