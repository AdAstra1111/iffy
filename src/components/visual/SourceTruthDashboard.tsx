/**
 * SourceTruthDashboard — Canonical visual truth extraction + inspection + refresh surface.
 *
 * This is the upstream control room for the visual OS.
 * Reads from and triggers existing canonical resolvers/hooks — no duplicate truth systems.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCharacterWardrobe } from '@/hooks/useCharacterWardrobe';
import { useVisualCanonExtraction } from '@/hooks/useVisualCanonExtraction';
import { useCanonLocations, type CanonLocation } from '@/hooks/useCanonLocations';
import { useProjectCanon } from '@/hooks/useProjectCanon';
import { useSceneIndex } from '@/hooks/useSceneIndex';
import { useCanonicalTemporalTruth } from '@/hooks/useCanonicalTemporalTruth';
import type { TemporalTruth, TemporalEvidence } from '@/lib/visual/temporalTruthResolver';
// IEL: normalizeWardrobe is an internal primitive — import retained only for
// diagnostic provenance display. Profile-level resolution uses resolveEffectiveProfileOrNull.
import { normalizeWardrobe } from '@/lib/visual/effectiveWardrobeNormalizer';
import { resolveEffectiveProfileOrNull } from '@/lib/visual/effectiveProfileResolver';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users, Shirt, MapPin, Eye, Layers, FileText, AlertTriangle, Check, ChevronRight,
  Database, BookOpen, Sparkles, Target, Shield, Info, Loader2, RefreshCw, Play,
  ChevronDown, Zap, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '@/lib/visual/characterWardrobeExtractor';

// ── Types ────────────────────────────────────────────────────────────────────

interface SourceFamily {
  key: string;
  label: string;
  icon: React.ReactNode;
  available: boolean;
  count: number;
  contributed: boolean;
}

interface CharacterTruthSummary {
  name: string;
  hasCastingEvidence: boolean;
  hasWardrobe: boolean;
  wardrobeConfidence: string;
  sceneFactCount: number;
  explicitStates: number;
  inferredStates: number;
  isContradicted: boolean;
  garments: string[];
  excludedGarments: string[];
  weakAreas: string[];
}

interface Contradiction {
  character: string;
  area: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
}

type DomainHealth = 'ready' | 'partial' | 'stale' | 'missing' | 'not_run';

interface TruthDomain {
  key: string;
  label: string;
  icon: React.ReactNode;
  health: DomainHealth;
  detail: string;
  diagnosis: string | null;
  extractionVersion: string | null;
  extractedAt: string | null;
  downstreamConsumers: string[];
  canExtract: boolean;
  canRefresh: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const strengthCls = (s: string) =>
  s === 'strong' || s === 'high' ? 'bg-green-500/10 text-green-600 border-green-500/20'
  : s === 'partial' || s === 'medium' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  : s === 'weak' || s === 'low' ? 'bg-red-500/10 text-red-600 border-red-500/20'
  : 'bg-muted text-muted-foreground border-border/30';

const healthCls = (h: DomainHealth) =>
  h === 'ready' ? 'bg-green-500/10 text-green-600 border-green-500/20'
  : h === 'partial' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  : h === 'stale' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
  : h === 'not_run' ? 'bg-muted text-muted-foreground border-border/30'
  : 'bg-red-500/10 text-red-600 border-red-500/20';

const healthIcon = (h: DomainHealth) =>
  h === 'ready' ? <Check className="h-3 w-3 text-green-500" />
  : h === 'partial' ? <Info className="h-3 w-3 text-amber-500" />
  : h === 'stale' ? <RefreshCw className="h-3 w-3 text-orange-500" />
  : <AlertTriangle className="h-3 w-3 text-muted-foreground/40" />;

// ── Main Component ──────────────────────────────────────────────────────────

export function SourceTruthDashboard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { canon, isLoading: canonLoading } = useProjectCanon(projectId);
  const wardrobe = useCharacterWardrobe(projectId);
  const visualCanon = useVisualCanonExtraction(projectId);
  const { locations, seedFromCanon: seedLocationsMutation, isLoading: locationsLoading } = useCanonLocations(projectId);
  const sceneIdx = useSceneIndex(projectId);
  const temporal = useCanonicalTemporalTruth(projectId);
  const [locationExtracting, setLocationExtracting] = useState(false);

  // Load narrative entities for character list
  const { data: narrativeEntities } = useQuery({
    queryKey: ['narrative-entities', projectId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('narrative_entities')
        .select('canonical_name, entity_type, status')
        .eq('project_id', projectId)
        .eq('entity_type', 'character')
        .eq('status', 'active');
      return data || [];
    },
    enabled: !!projectId,
  });

  // Load project documents for source coverage
  const { data: projectDocs } = useQuery({
    queryKey: ['source-truth-docs', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_documents')
        .select('id, doc_type')
        .eq('project_id', projectId);
      return data || [];
    },
    enabled: !!projectId,
  });

  // Load DNA data
  const { data: dnaRows } = useQuery({
    queryKey: ['visual-dna-summary', projectId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('character_visual_dna')
        .select('character_name, is_current')
        .eq('project_id', projectId)
        .eq('is_current', true);
      return data || [];
    },
    enabled: !!projectId,
  });

  // Load cast bindings
  const { data: castBindings } = useQuery({
    queryKey: ['cast-bindings-summary', projectId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('project_ai_cast')
        .select('character_key, ai_actor_id')
        .eq('project_id', projectId);
      return data || [];
    },
    enabled: !!projectId,
  });

  // Load visual sets summary
  const { data: visualSets } = useQuery({
    queryKey: ['visual-sets-summary', projectId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('visual_sets')
        .select('id, domain, status, character_key')
        .eq('project_id', projectId)
        .neq('status', 'archived');
      return data || [];
    },
    enabled: !!projectId,
  });

  // Load hero frames count
  const { data: heroFrames } = useQuery({
    queryKey: ['hero-frames-summary', projectId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('project_images')
        .select('id, is_primary, curation_state')
        .eq('project_id', projectId)
        .eq('asset_group', 'hero_frame')
        .eq('is_active', true);
      return data || [];
    },
    enabled: !!projectId,
  });

  const canonJson = canon as Record<string, any> | null;
  const characters = useMemo(() => {
    if (!canonJson?.characters) return [];
    return (canonJson.characters as Array<{ name?: string }>).filter(c => c.name);
  }, [canonJson]);

  const isLoading = canonLoading || wardrobe.loading;

  // ── Derive source families ──
  const sourceFamilies = useMemo((): SourceFamily[] => {
    const docTypes = new Set((projectDocs || []).map((d: any) => d.doc_type));
    return [
      { key: 'project_canon', label: 'Project Canon', icon: <Database className="h-3.5 w-3.5" />, available: !!canonJson, count: canonJson ? 1 : 0, contributed: !!canonJson },
      { key: 'canon_facts', label: 'Canon Facts', icon: <Shield className="h-3.5 w-3.5" />, available: true, count: 0, contributed: false },
      { key: 'character_visual_dna', label: 'Character Visual DNA', icon: <Sparkles className="h-3.5 w-3.5" />, available: (dnaRows || []).length > 0, count: (dnaRows || []).length, contributed: (dnaRows || []).length > 0 },
      { key: 'scene_index', label: 'Scene Index', icon: <Target className="h-3.5 w-3.5" />, available: sceneIdx.scenes.length > 0, count: sceneIdx.scenes.length, contributed: sceneIdx.scenes.length > 0 },
      { key: 'character_bible', label: 'Character Bible', icon: <BookOpen className="h-3.5 w-3.5" />, available: docTypes.has('character_bible'), count: docTypes.has('character_bible') ? 1 : 0, contributed: docTypes.has('character_bible') },
      { key: 'treatment', label: 'Treatment', icon: <FileText className="h-3.5 w-3.5" />, available: docTypes.has('treatment'), count: docTypes.has('treatment') ? 1 : 0, contributed: docTypes.has('treatment') },
      { key: 'scripts', label: 'Script', icon: <FileText className="h-3.5 w-3.5" />, available: docTypes.has('feature_script') || docTypes.has('episode_script') || docTypes.has('screenplay_draft') || docTypes.has('season_script') || docTypes.has('production_draft'), count: 0, contributed: docTypes.has('feature_script') || docTypes.has('episode_script') || docTypes.has('screenplay_draft') || docTypes.has('season_script') || docTypes.has('production_draft') },
      { key: 'story_outline', label: 'Story Outline', icon: <FileText className="h-3.5 w-3.5" />, available: docTypes.has('story_outline'), count: docTypes.has('story_outline') ? 1 : 0, contributed: docTypes.has('story_outline') },
      { key: 'world_bible', label: 'World Bible', icon: <MapPin className="h-3.5 w-3.5" />, available: docTypes.has('world_bible') || docTypes.has('series_bible'), count: 0, contributed: docTypes.has('world_bible') || docTypes.has('series_bible') },
    ];
  }, [canonJson, dnaRows, sceneIdx.scenes, projectDocs]);

  // ── Temporal / Era Truth — from canonical hook (must be before characterTruth) ──
  const temporalTruth = temporal.temporalTruth;

  // ── Derive character truth summaries ──
  const characterTruth = useMemo((): CharacterTruthSummary[] => {
    if (!characters.length) return [];
    return characters.map(c => {
      const name = c.name!;
      const profile = wardrobe.getProfile(name);
      const states = wardrobe.getStates(name);
      const hasDna = (dnaRows || []).some((d: any) => d.character_name?.toLowerCase() === name.toLowerCase());
      const hasCast = (castBindings || []).some((b: any) => b.character_key?.toLowerCase() === name.toLowerCase());
      const explicitStates = states.filter(s => s.explicit_or_inferred === 'explicit').length;
      const inferredStates = states.filter(s => s.explicit_or_inferred === 'inferred').length;
      const sceneEvData = wardrobe.extraction?.scene_costume_evidence;
      const charSceneFacts = sceneEvData?.facts.filter(f => f.character_key === name.toLowerCase()) || [];
      const isContradicted = profile?.source_doc_types?.includes('scene_contradiction') || false;
      const weakAreas: string[] = [];
      // Resolve effective profile — single canonical path for all downstream reads
      const effectiveProfile = resolveEffectiveProfileOrNull(profile, temporalTruth);
      if (!effectiveProfile) weakAreas.push('No wardrobe profile');
      else {
        if (effectiveProfile.confidence === 'low') weakAreas.push('Low wardrobe confidence');
        if (effectiveProfile.effective_signature_garments.length < 2) weakAreas.push('Sparse garments');
        if (!effectiveProfile.fabric_language || effectiveProfile.fabric_language.length < 5) weakAreas.push('No fabric language');
      }
      if (!hasDna) weakAreas.push('No visual DNA');
      if (!hasCast) weakAreas.push('No cast binding');
      if (charSceneFacts.length === 0) weakAreas.push('No scene costume evidence');
      return {
        name, hasCastingEvidence: hasCast || hasDna, hasWardrobe: !!effectiveProfile,
        wardrobeConfidence: effectiveProfile?.confidence || 'none', sceneFactCount: charSceneFacts.length,
        explicitStates, inferredStates,
        isContradicted: isContradicted || (effectiveProfile?.was_temporally_normalized ?? false),
        garments: effectiveProfile?.effective_signature_garments || [],
        excludedGarments: effectiveProfile?.excluded_garments.map(e => e.item) || [],
        weakAreas,
      };
    });
  }, [characters, wardrobe, dnaRows, castBindings, temporalTruth]);

  // ── Scene evidence ──
  const sceneEvidence = wardrobe.extraction?.scene_costume_evidence;

  // ── Derive contradictions ──
  const contradictions = useMemo((): Contradiction[] => {
    const result: Contradiction[] = [];
    for (const ct of characterTruth) {
      if (ct.isContradicted) {
        result.push({ character: ct.name, area: 'Wardrobe', detail: 'World-era defaults contradicted by scene evidence — corrected', severity: 'medium' });
      }
      if (ct.wardrobeConfidence === 'low' && ct.hasWardrobe) {
        result.push({ character: ct.name, area: 'Wardrobe', detail: 'Low confidence — sparse source data', severity: 'high' });
      }
      if (ct.sceneFactCount === 0 && ct.hasWardrobe) {
        result.push({ character: ct.name, area: 'Scene Evidence', detail: 'No scene-level costume facts extracted', severity: 'low' });
      }
    }
    if ((locations || []).length === 0) {
      result.push({ character: '—', area: 'Locations', detail: 'No canon locations defined — production design blocked', severity: 'high' });
    }
    // Temporal contradictions
    if (temporalTruth.contradictions.length > 0) {
      for (const tc of temporalTruth.contradictions) {
        result.push({ character: '—', area: 'Temporal / Era', detail: tc.detail, severity: tc.severity });
      }
    }
    if (temporalTruth.era === 'ambiguous' && temporalTruth.evidence.length === 0) {
      result.push({ character: '—', area: 'Temporal / Era', detail: 'No temporal evidence — era unknown, wardrobe may default inappropriately', severity: 'medium' });
    }
    return result;
  }, [characterTruth, locations, temporalTruth]);

  // ── Truth Domains with health, extraction, diagnostics ──
  const truthDomains = useMemo((): TruthDomain[] => {
    const hasScripts = sourceFamilies.find(s => s.key === 'scripts')?.contributed ?? false;
    const sceneCount = sceneIdx.scenes.length;
    const wardrobeCov = wardrobe.coverage;

    const sceneDiagnosis = sceneCount === 0
      ? (hasScripts ? 'Scripts available but scene index not built — extract scene index first' : 'No scripts uploaded — upload a script to enable scene extraction')
      : null;

    const sceneEvidenceDiagnosis = (() => {
      if (!wardrobeCov) return 'Wardrobe extraction not run — extract wardrobe to populate scene evidence';
      if (wardrobeCov.sceneFactCount === 0 && wardrobeCov.scenesScanned === 0) {
        return sceneCount === 0
          ? 'No scene index → no scene text for costume extraction. Build scene index first, or ensure scripts are uploaded.'
          : 'Scene index exists but wardrobe extraction may predate it — re-extract wardrobe';
      }
      if (wardrobeCov.sceneFactCount === 0) return 'Scenes scanned but no costume facts found — check script content';
      return null;
    })();

    return [
      {
        key: 'character',
        label: 'Character Truth',
        icon: <Users className="h-4 w-4" />,
        health: characters.length === 0 ? 'missing' : characterTruth.every(c => c.hasCastingEvidence && c.hasWardrobe) ? 'ready' : characterTruth.some(c => c.hasWardrobe) ? 'partial' : 'not_run',
        detail: `${characters.length} characters · ${characterTruth.filter(c => c.hasWardrobe).length} with wardrobe · ${characterTruth.filter(c => c.hasCastingEvidence).length} with casting evidence`,
        diagnosis: characters.length === 0 ? 'No characters in project canon — add characters first' : null,
        extractionVersion: wardrobeCov?.version || null,
        extractedAt: wardrobeCov?.extracted_at || null,
        downstreamConsumers: ['Casting', 'Character Visuals', 'Hero Frames'],
        canExtract: !!canonJson && characters.length > 0,
        canRefresh: !!wardrobe.extraction,
      },
      {
        key: 'wardrobe',
        label: 'Wardrobe Truth',
        icon: <Shirt className="h-4 w-4" />,
        health: !wardrobeCov ? 'not_run' : wardrobeCov.profiles === characters.length && characters.length > 0 ? 'ready' : 'partial',
        detail: wardrobeCov
          ? `${wardrobeCov.profiles} profiles · ${wardrobeCov.explicitStates} explicit / ${wardrobeCov.inferredStates} inferred states · v${wardrobeCov.version}`
          : 'Not extracted',
        diagnosis: !wardrobeCov ? 'Run wardrobe extraction to build profiles from canon + documents + scenes' : null,
        extractionVersion: wardrobeCov?.version || null,
        extractedAt: wardrobeCov?.extracted_at || null,
        downstreamConsumers: ['Character Visuals', 'Costume Generation'],
        canExtract: !!canonJson && characters.length > 0,
        canRefresh: !!wardrobe.extraction,
      },
      {
        key: 'scene_index',
        label: 'Scene Index',
        icon: <Target className="h-4 w-4" />,
        health: sceneCount > 0 ? 'ready' : hasScripts ? 'not_run' : 'missing',
        detail: sceneCount > 0 ? `${sceneCount} scenes indexed` : 'Not built',
        diagnosis: sceneDiagnosis,
        extractionVersion: null,
        extractedAt: null,
        downstreamConsumers: ['Scene Evidence', 'Wardrobe', 'Hero Frames'],
        canExtract: hasScripts,
        canRefresh: sceneCount > 0,
      },
      {
        key: 'scene_evidence',
        label: 'Scene Costume Evidence',
        icon: <Eye className="h-4 w-4" />,
        health: (wardrobeCov?.sceneFactCount ?? 0) > 0 ? 'ready' : wardrobe.extraction ? 'not_run' : 'missing',
        detail: wardrobeCov ? `${wardrobeCov.sceneFactCount} facts · ${wardrobeCov.scenesScanned} scenes scanned · ${wardrobeCov.charactersWithSceneEvidence.length} characters` : 'Not available',
        diagnosis: sceneEvidenceDiagnosis,
        extractionVersion: wardrobeCov?.version || null,
        extractedAt: wardrobeCov?.extracted_at || null,
        downstreamConsumers: ['Wardrobe Resolution', 'State Matrix', 'Prompt Construction'],
        canExtract: !!canonJson && characters.length > 0,
        canRefresh: !!wardrobe.extraction,
      },
      {
        key: 'locations',
        label: 'Location Truth',
        icon: <MapPin className="h-4 w-4" />,
        health: (locations || []).length > 0 ? 'ready' : (!!canonJson || sceneIdx.scenes.length > 0) ? 'not_run' : 'missing',
        detail: (locations || []).length > 0
          ? `${(locations || []).length} canon locations · ${(locations || []).filter(l => l.story_importance === 'primary').length} primary`
          : 'Not extracted',
        diagnosis: (locations || []).length === 0
          ? (!canonJson && sceneIdx.scenes.length === 0
            ? 'No project canon or scene index available — upload scripts or populate canon to enable location extraction'
            : canonJson && sceneIdx.scenes.length === 0
              ? 'Project canon available but no scene index — extract locations from canon, or build scene index first for richer results'
              : 'Sources available — run location extraction to populate canon locations')
          : null,
        extractionVersion: null,
        extractedAt: (locations || []).length > 0 ? (locations || [])[0]?.updated_at || null : null,
        downstreamConsumers: ['Production Design', 'Atmosphere & Lighting', 'World & Location Refs'],
        canExtract: !!canonJson || sceneIdx.scenes.length > 0,
        canRefresh: (locations || []).length > 0,
      },
      {
        key: 'temporal',
        label: 'Temporal / Era Truth',
        icon: <Clock className="h-4 w-4" />,
        health: temporalTruth.era === 'ambiguous' ? (temporalTruth.evidence.length > 0 ? 'partial' : 'missing')
          : temporalTruth.confidence === 'high' ? 'ready'
          : temporalTruth.confidence === 'medium' ? 'partial'
          : 'partial',
        detail: `${temporalTruth.summary}${temporal.docSourceCount > 0 ? ` · ${temporal.docSourceCount} doc source${temporal.docSourceCount !== 1 ? 's' : ''}` : ''}${temporal.isPersisted ? ' · persisted' : ''}`,
        diagnosis: temporalTruth.era === 'ambiguous' && temporalTruth.evidence.length === 0
          ? 'No temporal signals found in available sources — add setting/timeline/world details to canon'
          : temporalTruth.contradictions.length > 0
            ? `${temporalTruth.contradictions.length} temporal contradiction(s) — mixed era signals across sources`
            : null,
        extractionVersion: temporal.isPersisted ? '1' : null,
        extractedAt: temporal.extractedAt || null,
        downstreamConsumers: ['Wardrobe', 'Production Design', 'Visual Language', 'Hero Frames', 'Poster / Concept'],
        canExtract: !!canonJson,
        canRefresh: temporalTruth.evidence.length > 0 || temporal.isPersisted,
      },
      {
        key: 'visual_canon',
        label: 'Creative Design Primitives',
        icon: <Sparkles className="h-4 w-4" />,
        health: visualCanon.coverage ? 'ready' : visualCanon.hasCanon ? 'not_run' : 'missing',
        detail: visualCanon.coverage ? `${visualCanon.coverage.total} primitives · v${visualCanon.coverage.version}` : 'Not extracted',
        diagnosis: !visualCanon.coverage && visualCanon.hasCanon ? 'Canon available — extract creative design primitives from upstream truth' : (!visualCanon.hasCanon ? 'No project canon' : null),
        extractionVersion: visualCanon.coverage?.version?.toString() || null,
        extractedAt: visualCanon.coverage?.extracted_at || null,
        downstreamConsumers: ['Production Design', 'Visual Language', 'Poster'],
        canExtract: visualCanon.hasCanon,
        canRefresh: !!visualCanon.coverage,
      },
    ];
  }, [characters, characterTruth, wardrobe, sceneIdx, locations, visualCanon, canonJson, sourceFamilies, temporal, temporalTruth]);

  // ── Extraction handlers ──
  const handleExtractLocations = async () => {
    if (!projectId || locationExtracting) return;
    setLocationExtracting(true);
    try {
      // Build a combined canon JSON with locations from project canon + scene index
      const combined: Record<string, any> = {};
      if (canonJson) {
        // Pass through any existing locations/settings/key_locations arrays
        if (canonJson.locations) combined.locations = canonJson.locations;
        if ((canonJson as any).settings) combined.settings = (canonJson as any).settings;
        if ((canonJson as any).key_locations) combined.key_locations = (canonJson as any).key_locations;
        if ((canonJson as any).world_description) combined.world_description = (canonJson as any).world_description;
        if ((canonJson as any).setting) combined.setting = (canonJson as any).setting;
      }
      // Add scenes from scene index for scene-based location extraction
      if (sceneIdx.scenes.length > 0) {
        combined.scenes = sceneIdx.scenes.map(s => ({
          location: s.location_key || '',
          setting: s.location_key || '',
          scene_key: String(s.scene_number) || '',
        }));
      }
      const docIds = (projectDocs || []).map((d: any) => d.id);
      await seedLocationsMutation.mutateAsync({ canonJson: combined, documentSources: docIds });
    } catch {
      // error toast handled by mutation
    } finally {
      setLocationExtracting(false);
    }
  };

  const handleExtractDomain = async (domainKey: string) => {
    switch (domainKey) {
      case 'character':
      case 'wardrobe':
      case 'scene_evidence':
        wardrobe.extract();
        break;
      case 'scene_index':
        try { await sceneIdx.extractSceneIndex(); } catch {}
        break;
      case 'locations':
        handleExtractLocations();
        break;
      case 'temporal':
        temporal.extract();
        break;
      case 'visual_canon':
        visualCanon.extract();
        break;
    }
  };

  // ── Downstream stages ──
  const downstreamStages = useMemo(() => {
    const castBound = (castBindings || []).length;
    const totalChars = characters.length;
    const hfCount = (heroFrames || []).length;
    const hfPrimary = (heroFrames || []).some((h: any) => h.is_primary && (h.curation_state === 'active' || h.curation_state === 'approved'));
    const pdSets = (visualSets || []).filter((s: any) => s.domain !== 'character_identity' && s.domain !== 'character_costume_look');
    const pdLocked = pdSets.filter((s: any) => s.status === 'locked').length;
    const locCount = (locations || []).length;
    const pdReason = pdLocked > 0
      ? `${pdLocked} families locked`
      : locCount === 0
        ? 'No location truth — extract locations first'
        : 'Not started';
    return [
      { key: 'casting', label: 'Casting', ready: castBound > 0 && castBound >= totalChars, status: castBound > 0 ? (castBound >= totalChars ? 'ready' : 'partial') : 'blocked', reason: castBound > 0 ? `${castBound}/${totalChars} cast` : 'No cast bindings' },
      { key: 'wardrobe', label: 'Character Visuals / Wardrobe', ready: wardrobe.extraction !== null, status: wardrobe.extraction ? 'ready' : 'blocked', reason: wardrobe.extraction ? `${wardrobe.coverage?.profiles || 0} profiles` : 'No wardrobe extraction' },
      { key: 'hero_frames', label: 'Hero Frames', ready: hfPrimary, status: hfCount > 0 ? (hfPrimary ? 'ready' : 'partial') : 'blocked', reason: hfCount > 0 ? `${hfCount} frames${hfPrimary ? ' · primary locked' : ''}` : 'Not started' },
      { key: 'production_design', label: 'Production Design', ready: pdLocked > 0, status: pdLocked > 0 ? 'partial' : 'blocked', reason: pdReason },
      { key: 'visual_language', label: 'Visual Language', ready: false, status: 'blocked', reason: 'Requires Production Design' },
      { key: 'poster', label: 'Poster / Concept', ready: false, status: 'blocked', reason: 'Requires Hero Frames' },
    ];
  }, [castBindings, characters, heroFrames, visualSets, wardrobe, locations]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Computed metrics ──
  const totalChars = characters.length;
  const charsWithWardrobe = characterTruth.filter(c => c.hasWardrobe).length;
  const charsWithStrongWardrobe = characterTruth.filter(c => c.wardrobeConfidence === 'high' || c.wardrobeConfidence === 'medium').length;
  const contributingSources = sourceFamilies.filter(s => s.contributed).length;
  const highSeverity = contradictions.filter(c => c.severity === 'high').length;
  const isAnyExtracting = wardrobe.extracting || sceneIdx.isExtracting || visualCanon.extracting || locationExtracting || temporal.extracting;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-display font-semibold text-foreground">Visual Source Truth</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Canonical extraction, resolution, and provenance for all visual decisions across the OS.
          </p>
        </div>
        {isAnyExtracting && (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 animate-pulse border-primary/30 text-primary">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Extracting…
          </Badge>
        )}
      </div>

      {/* ── 1. Overview Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <OverviewCard
          icon={<Users className="h-4 w-4" />}
          label="Character Truth"
          value={`${charsWithWardrobe}/${totalChars}`}
          sub="with wardrobe"
          status={charsWithWardrobe === totalChars && totalChars > 0 ? 'good' : charsWithWardrobe > 0 ? 'partial' : 'missing'}
        />
        <OverviewCard
          icon={<Shirt className="h-4 w-4" />}
          label="Wardrobe Confidence"
          value={`${charsWithStrongWardrobe}/${totalChars}`}
          sub="medium+ confidence"
          status={charsWithStrongWardrobe === totalChars && totalChars > 0 ? 'good' : charsWithStrongWardrobe > 0 ? 'partial' : 'missing'}
        />
        <OverviewCard
          icon={<Eye className="h-4 w-4" />}
          label="Scene Evidence"
          value={`${sceneEvidence?.facts.length ?? 0}`}
          sub={`facts · ${sceneEvidence?.summary.scenes_scanned ?? 0} scenes`}
          status={(sceneEvidence?.facts.length ?? 0) > 0 ? 'good' : 'missing'}
        />
        <OverviewCard
          icon={<MapPin className="h-4 w-4" />}
          label="Locations"
          value={`${(locations || []).length}`}
          sub="canon locations"
          status={(locations || []).length > 0 ? 'good' : 'missing'}
        />
        <OverviewCard
          icon={<Clock className="h-4 w-4" />}
          label="Era / Time Truth"
          value={temporalTruth.era === 'ambiguous' ? '—' : temporalTruth.label.split(' ')[0]}
          sub={`${temporalTruth.confidence} · ${temporalTruth.provenance}`}
          status={temporalTruth.era !== 'ambiguous' && temporalTruth.confidence !== 'low' ? 'good' : temporalTruth.evidence.length > 0 ? 'partial' : 'missing'}
        />
      </div>

      {/* ── Source Coverage Bar ── */}
      <div className="rounded-lg border border-border/30 bg-card/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Source Coverage</span>
          <span className="text-[10px] text-muted-foreground">{contributingSources}/{sourceFamilies.length} sources active</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary/70 rounded-full transition-all"
            style={{ width: `${Math.round((contributingSources / Math.max(sourceFamilies.length, 1)) * 100)}%` }}
          />
        </div>
        {highSeverity > 0 && (
          <p className="text-[10px] text-amber-500 mt-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {highSeverity} high-severity issue{highSeverity !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* ── 2. Truth Domains — Extraction + Health + Diagnostics ── */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary/70" />
            Truth Domains — Extraction & Health
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1">
          {truthDomains.map(domain => (
            <TruthDomainRow
              key={domain.key}
              domain={domain}
              onExtract={() => handleExtractDomain(domain.key)}
              isExtracting={
                (domain.key === 'character' || domain.key === 'wardrobe' || domain.key === 'scene_evidence') ? wardrobe.extracting
                : domain.key === 'scene_index' ? sceneIdx.isExtracting
                : domain.key === 'visual_canon' ? visualCanon.extracting
                : domain.key === 'locations' ? locationExtracting
                : domain.key === 'temporal' ? temporal.extracting
                : false
              }
            />
          ))}
        </CardContent>
      </Card>

      {/* ── 3. Canonical Sources ── */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Database className="h-4 w-4 text-primary/70" />
            Canonical Sources
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
            {sourceFamilies.map(sf => (
              <div key={sf.key} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors">
                <span className={sf.contributed ? 'text-primary/70' : 'text-muted-foreground/40'}>{sf.icon}</span>
                <span className={`text-xs flex-1 ${sf.contributed ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                  {sf.label}
                </span>
                {sf.contributed ? (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 bg-green-500/10 text-green-600 border-green-500/20">
                    active{sf.count > 0 ? ` · ${sf.count}` : ''}
                  </Badge>
                ) : sf.available ? (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground/50">available</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground/30">—</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Character Visual Truth ── */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Users className="h-4 w-4 text-primary/70" />
            Character Visual Truth
            <Badge variant="outline" className="text-[9px] ml-auto">{totalChars} characters</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1">
          {characterTruth.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No characters in canon</p>
          ) : characterTruth.map(ct => (
            <CharacterTruthRow key={ct.name} truth={ct} />
          ))}
        </CardContent>
      </Card>

      {/* ── 5. Scene-Derived Visual Facts ── */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary/70" />
            Scene-Derived Visual Facts
            {sceneEvidence && sceneEvidence.facts.length > 0 && (
              <Badge variant="outline" className="text-[9px] ml-auto">{sceneEvidence.facts.length} facts</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!sceneEvidence || sceneEvidence.facts.length === 0 ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                No scene costume evidence extracted yet.
              </p>
              <SceneEvidenceDiagnosis
                hasSceneIndex={sceneIdx.scenes.length > 0}
                hasScripts={sourceFamilies.find(s => s.key === 'scripts')?.contributed ?? false}
                hasWardrobe={!!wardrobe.extraction}
                scenesScanned={wardrobe.coverage?.scenesScanned ?? 0}
              />
              {wardrobe.extraction && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs mt-2"
                  onClick={() => wardrobe.extract()}
                  disabled={wardrobe.extracting}
                >
                  {wardrobe.extracting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Re-extract Wardrobe + Scene Evidence
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{sceneEvidence.summary.scenes_scanned} scenes scanned</span>
                <span>{sceneEvidence.facts.length} costume facts</span>
                <span>{sceneEvidence.summary.characters_with_scene_evidence.length} characters with evidence</span>
              </div>
              <ScrollArea className="max-h-60">
                <div className="space-y-1.5">
                  {sceneEvidence.facts.slice(0, 30).map((fact, i) => (
                    <div key={i} className="flex items-start gap-2 py-1 px-2 rounded-md bg-muted/20 text-[11px]">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 mt-0.5">
                        {fact.scene_key ? `Scene ${fact.scene_key}` : 'Scene'}
                      </Badge>
                      <span className="text-foreground/80 font-medium shrink-0">{fact.character_key}</span>
                      <span className="text-muted-foreground flex-1">
                        {fact.garments.length > 0 && <span>garments: {fact.garments.join(', ')} </span>}
                        {fact.fabrics.length > 0 && <span>· fabrics: {fact.fabrics.join(', ')} </span>}
                        {fact.accessories.length > 0 && <span>· accessories: {fact.accessories.join(', ')}</span>}
                      </span>
                      <Badge variant="outline" className="text-[8px] px-1 py-0 text-accent-foreground border-accent/30 shrink-0">
                        explicit
                      </Badge>
                    </div>
                  ))}
                  {sceneEvidence.facts.length > 30 && (
                    <p className="text-[10px] text-muted-foreground/60 text-center py-1">
                      + {sceneEvidence.facts.length - 30} more facts
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 5b. Location Visual Truth ── */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary/70" />
            Location Visual Truth
            <Badge variant="outline" className="text-[9px] ml-auto">{(locations || []).length} locations</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {(locations || []).length === 0 ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                No canonical locations extracted yet.
              </p>
              <LocationExtractionDiagnosis
                hasCanon={!!canonJson}
                hasSceneIndex={sceneIdx.scenes.length > 0}
                hasScripts={sourceFamilies.find(s => s.key === 'scripts')?.contributed ?? false}
              />
              {(!!canonJson || sceneIdx.scenes.length > 0) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs mt-2"
                  onClick={handleExtractLocations}
                  disabled={locationExtracting}
                >
                  {locationExtracting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                  Extract Locations
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{(locations || []).length} locations</span>
                <span>{(locations || []).filter(l => l.story_importance === 'primary').length} primary</span>
                <span>{(locations || []).filter(l => l.recurring).length} recurring</span>
                <span>{(locations || []).filter(l => l.provenance === 'canon_extraction').length} from canon</span>
              </div>
              <ScrollArea className="max-h-72">
                <div className="space-y-1.5">
                  {(locations || []).map(loc => (
                    <LocationTruthRow key={loc.id} location={loc} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 5c. Temporal / Era Truth ── */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary/70" />
            Temporal / Era Truth
            <Badge variant="outline" className={`text-[9px] ml-auto ${strengthCls(temporalTruth.confidence)}`}>
              {temporalTruth.confidence}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-3">
            {/* Resolved era summary */}
            <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/20">
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">{temporalTruth.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Family: {temporalTruth.family} · {temporalTruth.provenance} · {temporalTruth.confidence} confidence
                </p>
              </div>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                temporalTruth.provenance === 'explicit'
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              }`}>
                {temporalTruth.provenance}
              </Badge>
            </div>

            {/* Era-appropriate garments */}
            {temporalTruth.era_garments.length > 0 && (
              <div>
                <span className="text-muted-foreground/70 text-[10px] font-medium uppercase tracking-wider">Era-Appropriate Garments</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {temporalTruth.era_garments.map((g, i) => (
                    <Badge key={i} variant="outline" className="text-[9px] px-1 py-0">{g}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Forbidden garment families */}
            {temporalTruth.forbidden_garment_families.length > 0 && (
              <div>
                <span className="text-muted-foreground/70 text-[10px] font-medium uppercase tracking-wider">
                  Inappropriate for Era ({temporalTruth.forbidden_garment_families.length})
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {temporalTruth.forbidden_garment_families.slice(0, 15).map((g, i) => (
                    <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 text-red-500/70 border-red-500/20">{g}</Badge>
                  ))}
                  {temporalTruth.forbidden_garment_families.length > 15 && (
                    <span className="text-[9px] text-muted-foreground/50">+{temporalTruth.forbidden_garment_families.length - 15} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Contributing sources */}
            {temporalTruth.contributing_sources.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/60 text-[10px]">Sources:</span>
                {temporalTruth.contributing_sources.map(s => (
                  <Badge key={s} variant="outline" className="text-[8px] px-1 py-0">{s}</Badge>
                ))}
              </div>
            )}

            {/* Evidence details */}
            {temporalTruth.evidence.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className="h-3 w-3" />
                  {temporalTruth.evidence.length} evidence signal{temporalTruth.evidence.length !== 1 ? 's' : ''}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="max-h-48 mt-1.5">
                    <div className="space-y-1">
                      {temporalTruth.evidence.map((ev, i) => (
                        <div key={i} className="flex items-start gap-2 py-1 px-2 rounded-md bg-muted/10 text-[10px]">
                          <Badge variant="outline" className={`text-[8px] px-1 py-0 shrink-0 mt-0.5 ${
                            ev.strength === 'strong' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''
                          }`}>
                            {ev.strength}
                          </Badge>
                          <span className="text-muted-foreground/60 shrink-0 min-w-[100px]">{ev.source}</span>
                          <span className="text-foreground/60 flex-1 italic">"{ev.text_snippet}"</span>
                          <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">{ev.matched_era}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Contradictions */}
            {temporalTruth.contradictions.length > 0 && (
              <div className="rounded-md bg-amber-500/5 border border-amber-500/20 px-3 py-2 space-y-1">
                <span className="text-[10px] font-medium text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Temporal Contradictions
                </span>
                {temporalTruth.contradictions.map((tc, i) => (
                  <p key={i} className="text-[10px] text-amber-600/80">{tc.detail}</p>
                ))}
              </div>
            )}

            {/* No evidence diagnostic */}
            {temporalTruth.evidence.length === 0 && (
              <div className="flex items-start gap-1.5 text-amber-500 bg-amber-500/5 rounded px-2 py-1.5 text-[11px]">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>No temporal signals found — add setting, timeline, or world context to project canon to establish era truth</span>
              </div>
            )}

            {/* Downstream consumers */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/60 text-[10px]">Used by:</span>
              {['Wardrobe', 'Production Design', 'Visual Language', 'Hero Frames'].map(c => (
                <Badge key={c} variant="outline" className="text-[8px] px-1 py-0">{c}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 6. Contradictions / Low-Confidence Areas ── */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Contradictions & Weak Areas
            {contradictions.length > 0 && (
              <Badge variant="outline" className="text-[9px] ml-auto text-amber-500 border-amber-500/30">
                {contradictions.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {contradictions.length === 0 ? (
            <p className="text-xs text-green-600 py-4 text-center flex items-center justify-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> No contradictions or critical weak areas detected
            </p>
          ) : (
            <div className="space-y-1">
              {contradictions.map((c, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/20 text-[11px]">
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    c.severity === 'high' ? 'bg-red-500' : c.severity === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground/40'
                  }`} />
                  <span className="text-foreground/80 font-medium shrink-0 min-w-[80px]">{c.character}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{c.area}</Badge>
                  <span className="text-muted-foreground flex-1">{c.detail}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 7. Downstream Consumers ── */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary/70" />
            Downstream Consumers
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-1">
            {downstreamStages.map(ds => (
              <div key={ds.key} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/20">
                {ds.status === 'ready' ? (
                  <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : ds.status === 'partial' ? (
                  <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                )}
                <span className="text-xs font-medium text-foreground/80 min-w-[140px]">{ds.label}</span>
                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${
                  ds.status === 'ready' ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : ds.status === 'partial' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  : 'text-muted-foreground/50'
                }`}>
                  {ds.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground flex-1">{ds.reason}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Visual Canon — Creative Design Primitives (derived from Source Truth) ── */}
      {visualCanon.coverage && (
        <Card className="border-border/30 bg-card/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary/70" />
              Creative Design Primitives
              <Badge variant="outline" className="text-[9px] ml-auto">{visualCanon.coverage.total} primitives</Badge>
            </CardTitle>
            <p className="text-[10px] text-muted-foreground mt-1">
              Artistic visual systems derived from upstream source truth — used by Production Design, Visual Language, and Poster.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              {[
                { label: 'Material Systems', count: visualCanon.coverage.material_systems },
                { label: 'Ritual Systems', count: visualCanon.coverage.ritual_systems },
                { label: 'Communication', count: visualCanon.coverage.communication_systems },
                { label: 'Power Systems', count: visualCanon.coverage.power_systems },
                { label: 'Intimacy', count: visualCanon.coverage.intimacy_systems },
                { label: 'Surface Conditions', count: visualCanon.coverage.surface_condition_systems },
                { label: 'Symbolic Objects', count: visualCanon.coverage.recurrent_symbolic_objects },
                { label: 'Environment Pairings', count: visualCanon.coverage.environment_behavior_pairings },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-1 px-2 rounded bg-muted/20">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-foreground">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function OverviewCard({ icon, label, value, sub, status }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  status: 'good' | 'partial' | 'missing';
}) {
  const borderCls = status === 'good' ? 'border-green-500/20' : status === 'partial' ? 'border-amber-500/20' : 'border-border/30';
  return (
    <div className={`rounded-lg border ${borderCls} bg-card/30 p-3 space-y-1`}>
      <div className="flex items-center gap-1.5">
        <span className="text-primary/70">{icon}</span>
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-display font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function TruthDomainRow({ domain, onExtract, isExtracting }: {
  domain: TruthDomain; onExtract: () => void; isExtracting: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/20 transition-colors">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
          <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="text-primary/70">{domain.icon}</span>
          <span className="text-xs font-medium text-foreground flex-1">{domain.label}</span>
        </CollapsibleTrigger>

        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${healthCls(domain.health)}`}>
          {domain.health === 'not_run' ? 'not run' : domain.health}
        </Badge>

        {(domain.canExtract || domain.canRefresh) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={(e) => { e.stopPropagation(); onExtract(); }}
            disabled={isExtracting}
          >
            {isExtracting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : domain.health === 'not_run' || domain.health === 'missing' ? (
              <><Play className="h-3 w-3 mr-0.5" /> Extract</>
            ) : (
              <><RefreshCw className="h-3 w-3 mr-0.5" /> Refresh</>
            )}
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <div className="ml-5 pl-3 border-l border-border/20 py-2 space-y-2 text-[11px]">
          <p className="text-muted-foreground">{domain.detail}</p>

          {domain.diagnosis && (
            <div className="flex items-start gap-1.5 text-amber-500 bg-amber-500/5 rounded px-2 py-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{domain.diagnosis}</span>
            </div>
          )}

          {domain.extractionVersion && (
            <div className="flex gap-3 text-muted-foreground/60 text-[10px]">
              <span>Version: {domain.extractionVersion}</span>
              {domain.extractedAt && <span>Extracted: {new Date(domain.extractedAt).toLocaleDateString()}</span>}
            </div>
          )}

          {domain.downstreamConsumers.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/60 text-[10px]">Used by:</span>
              {domain.downstreamConsumers.map(c => (
                <Badge key={c} variant="outline" className="text-[8px] px-1 py-0">{c}</Badge>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CharacterTruthRow({ truth }: { truth: CharacterTruthSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/20 transition-colors text-left">
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-xs font-medium text-foreground flex-1">{truth.name}</span>
        <Badge variant="outline" className={`text-[9px] px-1 py-0 ${strengthCls(truth.wardrobeConfidence)}`}>
          {truth.hasWardrobe ? truth.wardrobeConfidence : 'no profile'}
        </Badge>
        {truth.sceneFactCount > 0 && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-accent-foreground border-accent/30">
            {truth.sceneFactCount} scene facts
          </Badge>
        )}
        {truth.isContradicted && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-500 border-amber-500/30">corrected</Badge>
        )}
        {truth.weakAreas.length > 0 && (
          <span className="text-[9px] text-amber-500">{truth.weakAreas.length} gaps</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 pl-3 border-l border-border/20 py-2 space-y-2 text-[11px]">
          {truth.garments.length > 0 && (
            <div>
              <span className="text-muted-foreground/70 text-[10px] font-medium uppercase tracking-wider">Effective Garments</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {truth.garments.map((g, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] px-1 py-0">{g}</Badge>
                ))}
              </div>
            </div>
          )}
          {truth.excludedGarments.length > 0 && (
            <div>
              <span className="text-muted-foreground/70 text-[10px] font-medium uppercase tracking-wider">Excluded by Era Truth</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {truth.excludedGarments.map((g, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 text-red-500/70 border-red-500/20 line-through">{g}</Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 text-muted-foreground">
            <span>{truth.explicitStates} explicit states</span>
            <span>{truth.inferredStates} inferred states</span>
            <span>{truth.sceneFactCount} scene facts</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {truth.hasCastingEvidence && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-green-500/10 text-green-600 border-green-500/20">Cast bound</Badge>
            )}
            {truth.hasWardrobe && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-green-500/10 text-green-600 border-green-500/20">Wardrobe resolved</Badge>
            )}
            {truth.isContradicted && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">Scene-corrected</Badge>
            )}
          </div>
          {truth.weakAreas.length > 0 && (
            <div>
              <span className="text-muted-foreground/70 text-[10px] font-medium uppercase tracking-wider">Gaps</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {truth.weakAreas.map((w, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 text-amber-500 border-amber-500/30">{w}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SceneEvidenceDiagnosis({ hasSceneIndex, hasScripts, hasWardrobe, scenesScanned }: {
  hasSceneIndex: boolean; hasScripts: boolean; hasWardrobe: boolean; scenesScanned: number;
}) {
  const steps: Array<{ label: string; done: boolean; detail: string }> = [
    { label: 'Scripts uploaded', done: hasScripts, detail: hasScripts ? 'Available' : 'Upload a script to enable scene extraction' },
    { label: 'Scene index built', done: hasSceneIndex, detail: hasSceneIndex ? 'Available' : 'Extract scene index from scripts' },
    { label: 'Wardrobe extracted', done: hasWardrobe, detail: hasWardrobe ? (scenesScanned > 0 ? `${scenesScanned} scenes scanned` : 'Extracted but 0 scenes scanned — may predate scene index') : 'Not yet extracted' },
  ];

  return (
    <div className="inline-flex flex-col gap-1 text-left text-[10px] bg-muted/30 rounded-md px-3 py-2 mx-auto">
      <span className="text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Extraction Prerequisites</span>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {step.done ? <Check className="h-3 w-3 text-green-500" /> : <AlertTriangle className="h-3 w-3 text-amber-500" />}
          <span className={step.done ? 'text-foreground/70' : 'text-amber-600'}>{step.label}</span>
          <span className="text-muted-foreground/50">— {step.detail}</span>
        </div>
      ))}
    </div>
  );
}

function LocationTruthRow({ location }: { location: CanonLocation }) {
  const [open, setOpen] = useState(false);
  const importanceColor = location.story_importance === 'primary'
    ? 'bg-green-500/10 text-green-600 border-green-500/20'
    : location.story_importance === 'secondary'
    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
    : 'text-muted-foreground/50';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/20 transition-colors text-left">
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        <MapPin className="h-3 w-3 text-primary/50" />
        <span className="text-xs font-medium text-foreground flex-1">{location.canonical_name}</span>
        <Badge variant="outline" className={`text-[9px] px-1 py-0 ${importanceColor}`}>
          {location.story_importance}
        </Badge>
        {location.recurring && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-accent-foreground border-accent/30">recurring</Badge>
        )}
        <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground/60">{location.location_type}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 pl-3 border-l border-border/20 py-2 space-y-2 text-[11px]">
          {location.description && (
            <p className="text-muted-foreground">{location.description}</p>
          )}
          <div className="flex flex-wrap gap-2 text-muted-foreground">
            {location.interior_or_exterior && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/50 text-[10px]">INT/EXT:</span> {location.interior_or_exterior}
              </span>
            )}
            {location.geography && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/50 text-[10px]">Geo:</span> {location.geography}
              </span>
            )}
            {location.era_relevance && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/50 text-[10px]">Era:</span> {location.era_relevance}
              </span>
            )}
          </div>
          {location.associated_characters.length > 0 && (
            <div>
              <span className="text-muted-foreground/70 text-[10px] font-medium uppercase tracking-wider">Associated Characters</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {location.associated_characters.map((c, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] px-1 py-0">{c}</Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {location.provenance && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground/60">
                Source: {location.provenance}
              </Badge>
            )}
            {location.source_document_ids.length > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground/60">
                {location.source_document_ids.length} source doc{location.source_document_ids.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LocationExtractionDiagnosis({ hasCanon, hasSceneIndex, hasScripts }: {
  hasCanon: boolean; hasSceneIndex: boolean; hasScripts: boolean;
}) {
  const steps: Array<{ label: string; done: boolean; detail: string }> = [
    { label: 'Project canon populated', done: hasCanon, detail: hasCanon ? 'Available' : 'No project canon — add locations to canon or upload scripts' },
    { label: 'Scripts uploaded', done: hasScripts, detail: hasScripts ? 'Available' : 'Upload scripts for richer scene-based location extraction' },
    { label: 'Scene index built', done: hasSceneIndex, detail: hasSceneIndex ? 'Available — locations can be extracted from scene headings' : 'Build scene index for scene-derived locations' },
  ];

  return (
    <div className="inline-flex flex-col gap-1 text-left text-[10px] bg-muted/30 rounded-md px-3 py-2 mx-auto">
      <span className="text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Location Extraction Sources</span>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {step.done ? <Check className="h-3 w-3 text-green-500" /> : <AlertTriangle className="h-3 w-3 text-amber-500" />}
          <span className={step.done ? 'text-foreground/70' : 'text-amber-600'}>{step.label}</span>
          <span className="text-muted-foreground/50">— {step.detail}</span>
        </div>
      ))}
    </div>
  );
}
