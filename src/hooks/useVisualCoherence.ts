/**
 * useVisualCoherence — Computes VCS from real upstream visual truth.
 *
 * Grounded in:
 * - canonical effective wardrobe profiles (from persisted extraction)
 * - real world_system document detection (project_documents)
 * - canonical temporal truth (persisted > live > fallback)
 * - real PD/hero frame state from pipeline inputs
 */
import { useMemo } from 'react';
import { useProjectCanon } from '@/hooks/useProjectCanon';
import { useCanonicalTemporalTruth } from '@/hooks/useCanonicalTemporalTruth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computeVisualCoherence, type VCSResult } from '@/lib/visual/visualCoherenceEngine';
import type { CharacterWardrobeProfile, CharacterWardrobeExtractionResult } from '@/lib/visual/characterWardrobeExtractor';
import type { PipelineInputs } from '@/lib/visual/pipelineStatusResolver';
import {
  resolveCharacterVCSInputs,
  assembleVCSInputs,
  type VCSDiagnostics,
} from '@/lib/visual/vcsInputAssembler';

// World system detection — doc types that constitute a "world system"
const WORLD_SYSTEM_DOC_TYPES = ['world_bible', 'series_bible'];

export function useVisualCoherence(
  projectId: string | undefined,
  pipelineInputs: PipelineInputs,
): { result: VCSResult | null; loading: boolean; diagnostics: VCSDiagnostics | null } {
  const { canon } = useProjectCanon(projectId);
  const { temporalTruth, isPersisted: temporalPersisted, extractedAt: temporalExtractedAt } = useCanonicalTemporalTruth(projectId);

  // ── Project metadata (format/genre/tone) ──
  const projectQuery = useQuery({
    queryKey: ['vcs-project-meta', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data } = await supabase
        .from('projects')
        .select('format, genres, tone, default_prestige_style')
        .eq('id', projectId)
        .single();
      return data;
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── World system document detection ──
  const worldSystemQuery = useQuery({
    queryKey: ['vcs-world-system', projectId],
    queryFn: async () => {
      if (!projectId) return false;
      const { count } = await supabase
        .from('project_documents')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('doc_type', WORLD_SYSTEM_DOC_TYPES);
      return (count ?? 0) > 0;
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Character data with real wardrobe profiles ──
  const charQuery = useQuery({
    queryKey: ['vcs-char-profiles', projectId],
    queryFn: async () => {
      if (!projectId) return { characters: [] as any[], wardrobeResult: null as CharacterWardrobeExtractionResult | null };

      // 1. Load persisted wardrobe profiles from canon
      const { data: canonData } = await (supabase as any)
        .from('project_canon')
        .select('canon_json')
        .eq('project_id', projectId)
        .maybeSingle();

      const canonJson = canonData?.canon_json as Record<string, any> | null;
      let wardrobeResult: CharacterWardrobeExtractionResult | null = null;
      if (canonJson?.character_wardrobe_profiles &&
          typeof canonJson.character_wardrobe_profiles === 'object' &&
          'extraction_version' in canonJson.character_wardrobe_profiles) {
        wardrobeResult = canonJson.character_wardrobe_profiles as CharacterWardrobeExtractionResult;
      }

      // 2. Character names from canon (canonical character source)
      const characters = Array.isArray(canonJson?.characters) ? canonJson.characters : [];
      const charNames: string[] = characters
        .map((c: any) => c.name || c.character_name || '')
        .filter((n: string) => n.length > 0);

      // 3. Cast bindings
      const { data: cast } = await (supabase as any)
        .from('project_ai_cast')
        .select('character_key, ai_actor_id')
        .eq('project_id', projectId);
      const castMap = new Map((cast || []).map((c: any) => [c.character_key?.toLowerCase(), c.ai_actor_id]));

      // 4. Hero frame subjects
      const { data: heroImages } = await (supabase as any)
        .from('project_images')
        .select('subject')
        .eq('project_id', projectId)
        .eq('asset_group', 'hero_frame')
        .eq('is_active', true);
      const heroSubjects = new Set((heroImages || []).map((i: any) => (i.subject || '').toLowerCase()));

      // 5. Build per-character input with raw wardrobe profile
      const profileMap = new Map<string, CharacterWardrobeProfile>();
      if (wardrobeResult?.profiles) {
        for (const p of wardrobeResult.profiles) {
          profileMap.set(p.character_name.toLowerCase(), p);
        }
      }

      const charInputs = charNames.map(name => {
        const key = name.toLowerCase();
        return {
          name,
          rawProfile: profileMap.get(key) || null,
          hasLockedActor: castMap.has(key),
          hasHeroFrame: heroSubjects.has(key),
        };
      });

      return { characters: charInputs, wardrobeResult };
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // ── PD domains covered ──
  const pdDomainsQuery = useQuery({
    queryKey: ['vcs-pd-domains', projectId],
    queryFn: async () => {
      if (!projectId) return [] as string[];
      const { data } = await (supabase as any)
        .from('visual_sets')
        .select('domain')
        .eq('project_id', projectId)
        .like('domain', 'production_design_%')
        .eq('status', 'locked');
      const mapped = (data || []).map((d: any) => {
        const domain = d.domain?.replace('production_design_', '') || '';
        if (domain === 'location' || domain === 'atmosphere') return 'environment_atmosphere';
        if (domain === 'texture') return 'surface_language';
        if (domain === 'motif') return 'symbolic_motifs';
        return domain;
      });
      return [...new Set(mapped)] as string[];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // ── Assemble + compute ──
  const { result, diagnostics } = useMemo(() => {
    const project = projectQuery.data;
    if (!project || !projectId) return { result: null, diagnostics: null };

    const resolvedTemporal = temporalTruth;
    const temporalSource = temporalPersisted
      ? 'persisted' as const
      : temporalExtractedAt
        ? 'live' as const
        : 'fallback' as const;

    // Resolve effective wardrobe profiles through canonical resolver
    const charData = charQuery.data || { characters: [], wardrobeResult: null };
    const { characters, withProfiles, withoutProfiles } = resolveCharacterVCSInputs(
      charData.characters,
      resolvedTemporal,
    );

    const genre = Array.isArray(project.genres) ? project.genres[0] || '' : '';

    const assembly = assembleVCSInputs({
      format: project.format || '',
      genre,
      tone: project.tone || '',
      temporalTruth: resolvedTemporal,
      temporalSource,
      characters,
      charactersWithProfiles: withProfiles,
      charactersWithoutProfiles: withoutProfiles,
      pdFamiliesTotal: pipelineInputs.pdTotalFamilies,
      pdFamiliesLocked: pipelineInputs.pdLockedFamilies,
      pdDomainsCovered: pdDomainsQuery.data || [],
      heroFrameCount: pipelineInputs.heroFrameTotal,
      heroFrameApproved: pipelineInputs.heroFrameApproved,
      heroFramePrimaryApproved: pipelineInputs.heroFramePrimaryApproved,
      hasWorldSystem: worldSystemQuery.data ?? false,
      hasVisualStyle: pipelineInputs.hasVisualStyle,
      hasCanon: pipelineInputs.hasCanon,
      prestigeStyleKey: project.default_prestige_style || undefined,
    });

    return {
      result: computeVisualCoherence(assembly.inputs),
      diagnostics: assembly.diagnostics,
    };
  }, [projectQuery.data, temporalTruth, temporalPersisted, temporalExtractedAt, charQuery.data, pdDomainsQuery.data, worldSystemQuery.data, pipelineInputs, projectId]);

  const loading = projectQuery.isLoading || charQuery.isLoading;

  return { result, loading, diagnostics };
}
