/**
 * VisualProductionPipeline — Unified visual production workspace.
 *
 * Orchestrates: Source Truth → Visual Canon → Cast → Production Design → Visual Language → Look Book
 *
 * Embeds existing systems (CastingPipeline, ProductionDesign, LookBook) — no duplication.
 */
import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useVisualCoherence } from '@/hooks/useVisualCoherence';
import { VisualCoherencePanel } from '@/components/visual/VisualCoherencePanel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useParams, Link } from 'react-router-dom';
import {
  BookOpen, Users, Palette, Eye, Layers, FileText, ChevronRight, ChevronLeft,
  Lock, AlertCircle, Check, Loader2, ArrowLeft, AlertTriangle,
  Sparkles, Frame, X, Trash2, StarOff, Star, Target, ArrowUp, ArrowDown, Info, Zap, ShieldAlert,
  Shield, Image, FileBarChart, FlaskConical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { HeroFrameDetailViewer } from '@/components/visual/HeroFrameDetailViewer';
import { useProjectCanon } from '@/hooks/useProjectCanon';
import { useCanonLocations } from '@/hooks/useCanonLocations';
import { useVisualStyleProfile } from '@/hooks/useVisualStyleProfile';
import { supabase } from '@/integrations/supabase/client';
import { VisualCanonExtractionPanel } from '@/components/visual/VisualCanonExtractionPanel';
import { CharacterWardrobePanel } from '@/components/visual/CharacterWardrobePanel';
import { CostumeOnActorPanel } from '@/components/visual/CostumeOnActorPanel';
import { SceneDemoPlannerPanel } from '@/components/visual/SceneDemoPlannerPanel';
import { SceneDemoGeneratorPanel } from '@/components/visual/SceneDemoGeneratorPanel';
import { PosterPanel } from '@/components/visual/PosterPanel';
import { ConceptBriefPanel } from '@/components/visual/ConceptBriefPanel';
import { useWorldValidationMode } from '@/hooks/useWorldValidationMode';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useHeroFrameAutoCuration } from '@/hooks/useHeroFrameAutoCuration';
import { isHeroFrameIdentityValid } from '@/lib/images/heroFrameIdentityFilter';
import { isCharacterImageEligible, filterEligibleImages } from '@/lib/images/characterImageEligibility';
import { filterPremiumActiveImages } from '@/lib/images/premiumQualityGate';
import {
  resolvePipelineStages,
  getActiveStage,
  PIPELINE_STAGES,
  type PipelineStage,
  type StageState,
  type StageStatus,
  type PipelineInputs,
} from '@/lib/visual/pipelineStatusResolver';
import { invokeHeroFrameChunkWithRetry } from '@/lib/visual/heroFrameChunkRunner';

// Lazy-load stage content panels to keep bundle light
const CastingPipelineContent = lazy(() => import('./CastingPipeline'));
const ProductionDesignContent = lazy(() => import('./ProductionDesign'));
const LookBookContent = lazy(() => import('./LookBookPage'));

// ── Stage icons ──
const STAGE_ICONS: Record<PipelineStage, typeof BookOpen> = {
  source_truth: FileText,
  visual_canon: Eye,
  cast: Users,
  hero_frames: Frame,
  production_design: Palette,
  visual_language: Layers,
  poster: Image,
  concept_brief: FileBarChart,
  lookbook: FlaskConical,
};

// ── Status styling ──
function statusStyle(status: StageStatus) {
  switch (status) {
    case 'locked': return { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20', icon: Lock };
    case 'approved': return { bg: 'bg-green-500/10', text: 'text-green-600', border: 'border-green-500/20', icon: Check };
    case 'ready_for_review': return { bg: 'bg-accent/10', text: 'text-accent-foreground', border: 'border-accent/20', icon: Sparkles };
    case 'in_progress': return { bg: 'bg-primary/5', text: 'text-primary', border: 'border-primary/15', icon: Loader2 };
    case 'stale': return { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/20', icon: AlertTriangle };
    case 'blocked': return { bg: 'bg-muted/30', text: 'text-muted-foreground/60', border: 'border-border/20', icon: AlertCircle };
    case 'not_started': return { bg: 'bg-muted/20', text: 'text-muted-foreground', border: 'border-border/30', icon: null };
  }
}

const STATUS_LABELS: Record<StageStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  approved: 'Approved',
  locked: 'Locked',
  stale: 'Stale',
  blocked: 'Blocked',
};

// ── Data hooks for pipeline inputs ──

function usePipelineInputs(projectId: string | undefined): PipelineInputs {
  const { canon } = useProjectCanon(projectId);
  const { locations } = useCanonLocations(projectId);
  const { profile: styleProfile } = useVisualStyleProfile(projectId);

  // Cast state
  const castQuery = useQuery({
    queryKey: ['pipeline-cast-state', projectId],
    queryFn: async () => {
      if (!projectId) return { total: 0, locked: 0, allComplete: false };
      const { data: chars } = await (supabase as any)
        .from('project_characters')
        .select('id')
        .eq('project_id', projectId);
      const totalChars = chars?.length || 0;

      const { data: cast } = await (supabase as any)
        .from('project_ai_cast')
        .select('character_key, ai_actor_id')
        .eq('project_id', projectId);
      const lockedCount = cast?.length || 0;

      // Check actor dataset completeness
      let allComplete = lockedCount > 0 && lockedCount >= totalChars;
      if (allComplete && cast?.length) {
        const actorIds = cast.map((c: any) => c.ai_actor_id).filter(Boolean);
        if (actorIds.length > 0) {
          const { data: actors } = await (supabase as any)
            .from('ai_actors')
            .select('id, anchor_coverage_status, anchor_coherence_status')
            .in('id', actorIds);
          allComplete = actors?.every((a: any) =>
            a.anchor_coverage_status === 'complete' && a.anchor_coherence_status === 'coherent'
          ) ?? false;
        }
      }

      return { total: totalChars, locked: lockedCount, allComplete };
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // PD state — must match canonical resolveRequiredFamilies logic:
  // topLocations (up to 4) × 2 (location + atmosphere each) + 2 (texture + motif)
  const topLocationCount = Math.min(locations?.length || 0, 4);
  const pdQuery = useQuery({
    queryKey: ['pipeline-pd-state', projectId, topLocationCount],
    queryFn: async () => {
      if (!projectId) return { total: 0, locked: 0, created: 0, allLocked: false };
      const { data: sets } = await (supabase as any)
        .from('visual_sets')
        .select('id, domain, status, target_name')
        .eq('project_id', projectId)
        .like('domain', 'production_design_%')
        .neq('status', 'archived');

      // Canonical required families: N locations + N atmospheres + 1 texture + 1 motif
      const totalFamilies = topLocationCount * 2 + 2;

      // Count only sets matching canonical target names to exclude legacy orphans
      // Canonical targets: location/atmosphere per-location names, "Surface Language", "Production Motifs"
      const canonicalDomains = new Set(['production_design_location', 'production_design_atmosphere']);
      const canonicalGlobalTargets: Record<string, string> = {
        'production_design_texture': 'Surface Language',
        'production_design_motif': 'Production Motifs',
      };

      let created = 0;
      let locked = 0;
      for (const s of (sets || [])) {
        const isCanonical = canonicalDomains.has(s.domain) ||
          (canonicalGlobalTargets[s.domain] && s.target_name === canonicalGlobalTargets[s.domain]);
        if (!isCanonical) continue;
        created++;
        if (s.status === 'locked') locked++;
      }

      return { total: totalFamilies, locked, created, allLocked: locked >= totalFamilies && totalFamilies > 0 };
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Hero Frames state — query project_images with asset_group='hero_frame'
  const hfQuery = useQuery({
    queryKey: ['pipeline-hero-frames-state', projectId],
    queryFn: async () => {
      if (!projectId) return { total: 0, approved: 0, primaryApproved: false };
      // ── LOOKBOOK CANONICAL VISIBILITY BOUNDARY ──
      // Must match lineage guard in lookbookSlotRegistry hero_frames section.
      const { data: images } = await (supabase as any)
        .from('project_images')
        .select('id, role, is_primary, curation_state, subject_type, subject, generation_config, width, height')
        .eq('project_id', projectId)
        .eq('asset_group', 'hero_frame')
        .eq('generation_purpose', 'hero_frame')
        .eq('is_active', true);

      const total = images?.length || 0;
      // ── GOVERNED COUNTS: apply identity + premium gates so counts match governed pool ──
      const { eligible: identityPassed } = filterEligibleImages(images || [], 'hero_frames');
      const { admitted: governed } = filterPremiumActiveImages(identityPassed, 'hero_frames');
      const approved = governed.filter((i: any) => i.curation_state === 'active').length;
      const primaryApproved = governed.some((i: any) => i.role === 'hero_primary' && i.is_primary && i.curation_state === 'active') ?? false;
      return { total, approved, primaryApproved };
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Lookbook state
  const lbQuery = useQuery({
    queryKey: ['pipeline-lb-state', projectId],
    queryFn: async () => {
      if (!projectId) return { exists: false, stale: false };
      const { data: sections } = await (supabase as any)
        .from('lookbook_sections')
        .select('id, section_status')
        .eq('project_id', projectId);
      const exists = sections?.some((s: any) => s.section_status !== 'empty_but_bootstrapped') ?? false;
      return { exists, stale: false };
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Poster candidates state
  const posterQuery = useQuery({
    queryKey: ['pipeline-poster-state', projectId],
    queryFn: async () => {
      if (!projectId) return { count: 0 };
      const { count } = await (supabase as any)
        .from('poster_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'candidate');
      return { count: count ?? 0 };
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Concept brief state
  const cbQuery = useQuery({
    queryKey: ['pipeline-cb-state', projectId],
    queryFn: async () => {
      if (!projectId) return { version: 0 };
      const { data } = await (supabase as any)
        .from('concept_brief_versions')
        .select('version_number')
        .eq('project_id', projectId)
        .order('version_number', { ascending: false })
        .limit(1);
      return { version: data?.[0]?.version_number ?? 0 };
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  return useMemo(() => ({
    hasCanon: !!canon && Object.keys(canon).length > 0,
    hasLocations: (locations?.length || 0) > 0,
    locationCount: locations?.length || 0,
    hasVisualStyle: !!styleProfile,
    visualStyleComplete: styleProfile?.is_complete ?? false,
    totalCharacters: castQuery.data?.total ?? 0,
    lockedCharacters: castQuery.data?.locked ?? 0,
    castComplete: castQuery.data?.allComplete ?? false,
    heroFrameTotal: hfQuery.data?.total ?? 0,
    heroFrameApproved: hfQuery.data?.approved ?? 0,
    heroFramePrimaryApproved: hfQuery.data?.primaryApproved ?? false,
    pdTotalFamilies: pdQuery.data?.total ?? 0,
    pdLockedFamilies: pdQuery.data?.locked ?? 0,
    pdCreatedFamilies: pdQuery.data?.created ?? 0,
    pdAllLocked: pdQuery.data?.allLocked ?? false,
    visualLanguageApproved: styleProfile?.is_complete ?? false,
    lookbookExists: lbQuery.data?.exists ?? false,
    lookbookStale: lbQuery.data?.stale ?? false,
    posterCandidateCount: posterQuery.data?.count ?? 0,
    conceptBriefVersion: cbQuery.data?.version ?? 0,
  }), [canon, locations, styleProfile, castQuery.data, hfQuery.data, pdQuery.data, lbQuery.data, posterQuery.data, cbQuery.data]);
}

// ── Stage Rail Item ──
function StageRailItem({
  state,
  isActive,
  onClick,
}: {
  state: StageState;
  isActive: boolean;
  onClick: () => void;
}) {
  const style = statusStyle(state.status);
  const Icon = STAGE_ICONS[state.stage];
  const StatusIcon = style.icon;
  const isBlocked = state.status === 'blocked';

  return (
    <button
      onClick={onClick}
      disabled={false}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
        isActive
          ? `${style.bg} ${style.border} border ring-1 ring-primary/10`
          : isBlocked
          ? 'opacity-50 hover:opacity-70'
          : 'hover:bg-muted/20'
      }`}
    >
      <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
        isActive ? style.bg : 'bg-muted/20'
      }`}>
        <Icon className={`h-3.5 w-3.5 ${isActive ? style.text : 'text-muted-foreground'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium truncate ${isActive ? 'text-foreground' : 'text-foreground/80'}`}>
            {state.label}
          </span>
          {StatusIcon && state.status !== 'not_started' && (
            <StatusIcon className={`h-3 w-3 shrink-0 ${style.text} ${state.status === 'in_progress' ? 'animate-spin' : ''}`} />
          )}
        </div>
        {state.progress && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{state.progress}</p>
        )}
        {state.blockers && state.blockers.length > 0 && (
          <p className="text-[10px] text-destructive/70 truncate mt-0.5">{state.blockers[0]}</p>
        )}
      </div>
      <ChevronRight className={`h-3 w-3 shrink-0 ${isActive ? 'text-foreground' : 'text-muted-foreground/40'}`} />
    </button>
  );
}

// ── Source Truth Panel — delegates to canonical dashboard ──
import { SourceTruthDashboard } from '@/components/visual/SourceTruthDashboard';

function SourceTruthPanel({ projectId }: { projectId: string }) {
  return <SourceTruthDashboard projectId={projectId} />;
}

// ── World Validation Mode Panel ──
function WorldValidationModePanel({ projectId }: { projectId: string }) {
  const { mode, constraintsSummary } = useWorldValidationMode(projectId);
  const modeLabel = mode.mode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const confCls = mode.confidence === 'high'
    ? 'bg-green-500/10 text-green-600 border-green-500/20'
    : mode.confidence === 'medium'
      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
      : 'bg-muted text-muted-foreground border-border/30';

  return (
    <div className="rounded-lg border border-border/30 bg-card/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary/70" />
          World Validation Mode
        </h3>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] font-medium">{modeLabel}</Badge>
          <Badge className={`text-[9px] ${confCls}`}>{mode.confidence}</Badge>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{mode.rationale}</p>
      <div className="flex flex-wrap gap-1.5">
        {constraintsSummary.map(c => (
          <Badge key={c} variant="outline" className="text-[9px]">{c}</Badge>
        ))}
      </div>
    </div>
  );
}

// ── Visual Canon Panel ──
function VisualCanonPanel({ projectId }: { projectId: string }) {
  const { canon } = useProjectCanon(projectId);
  const { profile, loading } = useVisualStyleProfile(projectId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-display font-semibold text-foreground">Visual Canon</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Define the visual style, tone, and design language that governs all generated imagery.
        </p>
      </div>
      <div className="rounded-lg border border-border/30 bg-card/30 p-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading visual style…
          </div>
        ) : profile ? (
          <div className="space-y-2">
            {profile.period && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Period</Badge>
                <span className="text-xs text-foreground">{profile.period}</span>
              </div>
            )}
            {profile.lighting_philosophy && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Lighting</Badge>
                <span className="text-xs text-foreground truncate">{profile.lighting_philosophy}</span>
              </div>
            )}
            {profile.texture_materiality && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Texture</Badge>
                <span className="text-xs text-foreground truncate">{profile.texture_materiality}</span>
              </div>
            )}
            {profile.color_response && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Color</Badge>
                <span className="text-xs text-foreground truncate">{profile.color_response}</span>
              </div>
            )}
            {profile.is_complete ? (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                <Check className="h-3 w-3 mr-1" /> Complete
              </Badge>
            ) : (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                Incomplete — fill remaining fields
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No visual style defined yet. This will be auto-inferred from your canon or can be set manually.
          </p>
        )}
        <Link to={`/projects/${projectId}`}>
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <Eye className="h-3 w-3" /> Edit Visual Style
          </Button>
        </Link>
      </div>

      {/* Visual Canon Extraction */}
      <div className="rounded-lg border border-border/30 bg-card/30 p-4">
        <VisualCanonExtractionPanel projectId={projectId} />
      </div>

      {/* World Validation Mode */}
      <WorldValidationModePanel projectId={projectId} />

      {/* Character Wardrobe Profiles */}
      <div className="rounded-lg border border-border/30 bg-card/30 p-4">
        <CharacterWardrobePanel projectId={projectId} />
      </div>

      {/* Costume-on-Actor Looks */}
      <div className="rounded-lg border border-border/30 bg-card/30 p-4">
        <CostumeOnActorPanel projectId={projectId} />
      </div>

      {/* Scene Demo Plans */}
      <div className="rounded-lg border border-border/30 bg-card/30 p-4">
        <SceneDemoPlannerPanel projectId={projectId} />
      </div>

      {/* Scene Demo Generation */}
      <div className="rounded-lg border border-border/30 bg-card/30 p-4">
        <SceneDemoGeneratorPanel projectId={projectId} />
      </div>
    </div>
  );
}

// ── Visual Language Panel ──
function VisualLanguagePanel({ projectId }: { projectId: string }) {
  const { profile } = useVisualStyleProfile(projectId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-display font-semibold text-foreground">Visual Language</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Lighting philosophy, composition style, color response, and tone direction for all generated imagery.
        </p>
      </div>
      <div className="rounded-lg border border-border/30 bg-card/30 p-4 space-y-3">
        {profile ? (
          <div className="space-y-3">
            {profile.lighting_philosophy && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Lighting Philosophy</p>
                <p className="text-xs text-foreground">{profile.lighting_philosophy}</p>
              </div>
            )}
            {profile.camera_philosophy && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Camera Philosophy</p>
                <p className="text-xs text-foreground">{profile.camera_philosophy}</p>
              </div>
            )}
            {profile.composition_philosophy && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Composition</p>
                <p className="text-xs text-foreground">{profile.composition_philosophy}</p>
              </div>
            )}
            {profile.color_response && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Color Response</p>
                <p className="text-xs text-foreground">{profile.color_response}</p>
              </div>
            )}
            {profile.texture_materiality && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Texture & Materiality</p>
                <p className="text-xs text-foreground">{profile.texture_materiality}</p>
              </div>
            )}
            {profile.environment_realism && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Environment Realism</p>
                <p className="text-xs text-foreground">{profile.environment_realism}</p>
              </div>
            )}
            {profile.is_complete ? (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                <Check className="h-3 w-3 mr-1" /> Visual Language Approved
              </Badge>
            ) : (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                Incomplete — complete visual style to approve
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Visual language will be derived from your Visual Canon and Production Design outputs.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Blocked Panel ──
function BlockedPanel({ state }: { state: StageState }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-display font-semibold text-foreground">{state.label}</h2>
        <p className="text-xs text-muted-foreground mt-1">{state.description}</p>
      </div>
      <div className="rounded-lg border border-destructive/20 bg-destructive/[0.03] p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-destructive/40" />
        <p className="text-sm font-medium text-foreground">Stage Blocked</p>
        {state.blockers?.map((b, i) => (
          <p key={i} className="text-xs text-muted-foreground">{b}</p>
        ))}
      </div>
    </div>
  );
}

// ── Hero Frames Panel ──
function HeroFramesPanel({ projectId, inputs }: { projectId: string; inputs: PipelineInputs }) {
  const hasFrames = inputs.heroFrameTotal > 0;
  const primaryLocked = inputs.heroFramePrimaryApproved;
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ stage: string; detail: string; percent: number } | null>(null);
  const [storySlots, setStorySlots] = useState<import('@/lib/visual/heroFrameSlotPlan').HeroFrameSlot[] | null>(null);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const queryClient = useQueryClient();
  const { runAutoCuration, computeBestSet, enforceRequiredPrimary, enforceHeroPrimaryAtGenerationCompletion, curating, enforcingPrimary, lastResult, FINAL_SET_SIZE, COVERAGE_LABELS } = useHeroFrameAutoCuration(projectId);
  const primaryEnforcementRef = useRef(false);

  // ── Best-set computation (dry run for recommendations) ──
  const { data: bestSet, refetch: refetchBestSet } = useQuery({
    queryKey: ['hero-frame-best-set', projectId],
    queryFn: () => computeBestSet(),
    enabled: !!projectId && hasFrames,
    staleTime: 30_000,
  });

  // Load hero frame images
  const { data: heroImages } = useQuery({
    queryKey: ['hero-frame-images', projectId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('project_images')
        .select('id, role, is_primary, curation_state, storage_path, storage_bucket, width, height, generation_config, model, provider, subject_type, subject')
        .eq('project_id', projectId)
        .eq('asset_group', 'hero_frame')
        .eq('generation_purpose', 'hero_frame')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (data?.length) {
        for (const img of data) {
          if (img.storage_path && img.storage_bucket) {
            const { data: urlData } = await supabase.storage
              .from(img.storage_bucket)
              .createSignedUrl(img.storage_path, 3600);
            img.signedUrl = urlData?.signedUrl || null;
          }
        }
      }
      return data || [];
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });

  // ── PRIMARY ENFORCEMENT: auto-backfill missing primary from best-set ──
  // Fires whenever bestSet or heroImages change and detects zero-primary + governed active pool.
  // Uses a ref to prevent concurrent enforcement, but re-checks on every data change
  // so that post-generation invalidation triggers enforcement reliably.
  useEffect(() => {
    if (!bestSet || primaryEnforcementRef.current || enforcingPrimary) return;
    if (!bestSet.recommendedPrimaryId) return;
    // Check if any current image is already primary
    const hasPrimary = heroImages?.some((i: any) => i.is_primary && i.role === 'hero_primary');
    if (hasPrimary) return;
    // Check if governed active pool exists
    const activeCount = heroImages?.filter((i: any) => i.curation_state === 'active')?.length ?? 0;
    if (activeCount === 0) return;

    // Enforce: auto-assign recommended primary
    primaryEnforcementRef.current = true;
    enforceRequiredPrimary(bestSet).then(result => {
      if (result.enforced) {
        console.log('[PRIMARY_ENFORCEMENT_UI] Primary auto-backfilled:', result.primaryId);
      }
      // Reset ref after enforcement completes so future data changes can re-check
      primaryEnforcementRef.current = false;
    }).catch(() => {
      primaryEnforcementRef.current = false;
    });
  }, [bestSet, heroImages, enforcingPrimary, enforceRequiredPrimary]);

  const canGenerate = inputs.castComplete && inputs.hasLocations;

  // ── Recommendation lookup for per-image badges ──
  const getRecommendation = (imgId: string): { label: string; color: string; icon: React.ReactNode } | null => {
    if (!bestSet) return null;
    if (bestSet.recommendedPrimaryId === imgId) return { label: 'REC. PRIMARY', color: 'bg-primary text-primary-foreground', icon: <Target className="h-2.5 w-2.5 mr-0.5" /> };
    if (bestSet.recommendedApprovedIds.includes(imgId) && !bestSet.recommendedDemoteIds.includes(imgId)) return { label: 'REC. KEEP', color: 'bg-green-600/80 text-white', icon: <ArrowUp className="h-2.5 w-2.5 mr-0.5" /> };
    if (bestSet.recommendedDemoteIds.includes(imgId)) return { label: 'REC. DEMOTE', color: 'bg-amber-600/80 text-white', icon: <ArrowDown className="h-2.5 w-2.5 mr-0.5" /> };
    if (bestSet.recommendedArchiveIds.includes(imgId)) return { label: 'ARCHIVE', color: 'bg-muted text-muted-foreground', icon: <ArrowDown className="h-2.5 w-2.5 mr-0.5" /> };
    if (bestSet.recommendedRejectIds.includes(imgId)) return { label: 'REJECT', color: 'bg-destructive/80 text-white', icon: <X className="h-2.5 w-2.5 mr-0.5" /> };
    return null;
  };

  const handleGenerate = async () => {
    if (generating || !canGenerate) return;
    setGenerating(true);

    // Plan the full 13-slot story set
    const { buildStorySetPlan, STORY_SET_SIZE } = await import('@/lib/visual/heroFrameSlotPlan');
    const plan = buildStorySetPlan();
    setStorySlots(plan);
    setGenProgress({ stage: 'Planning Story Set', detail: `Planning ${STORY_SET_SIZE} narrative slots…`, percent: 2 });

    try {
      for (let slotIdx = 0; slotIdx < plan.length; slotIdx++) {
        const slot = plan[slotIdx];
        const pct = Math.round(((slotIdx) / plan.length) * 90) + 5;
        setGenProgress({
          stage: `Slot ${slotIdx + 1} of ${plan.length}`,
          detail: `Generating: ${slot.narrativeFunctionLabel}`,
          percent: pct,
        });

        // Mark slot as generating
        setStorySlots(prev => {
          if (!prev) return prev;
          const next = [...prev];
          next[slotIdx] = { ...next[slotIdx], status: 'generating' };
          return next;
        });

        const invokeResult = await invokeHeroFrameChunkWithRetry({
          chunkIndex: slotIdx,
          requestedCount: 1,
          invoke: () => supabase.functions.invoke('generate-hero-frames', {
            body: {
              project_id: projectId,
              count: 1,
              slot_index: slotIdx,
              target_narrative_function: slot.narrativeFunction !== 'unassigned' ? slot.narrativeFunction : undefined,
            },
          }),
        });

        if (invokeResult.ok === false) {
          const { failure } = invokeResult;
          console.warn(`[hero-frames] Slot ${slotIdx + 1} failed: ${failure.code} — ${failure.message}`);
          setStorySlots(prev => {
            if (!prev) return prev;
            const next = [...prev];
            next[slotIdx] = {
              ...next[slotIdx],
              status: 'failed',
              error: failure.message,
              errorCode: failure.code,
              attempts: invokeResult.attempts,
            };
            return next;
          });
          // Continue to next slot — failure is isolated
          continue;
        }

        const results = invokeResult.data.results || [];
        const r = results[0] as any;

        // Handle deferred slots (under-supported — not worth generating)
        if (r?.status === 'deferred') {
          console.log(`[hero-frames] Slot ${slotIdx + 1} deferred: ${r.error || 'under-supported'}`);
          setStorySlots(prev => {
            if (!prev) return prev;
            const next = [...prev];
            next[slotIdx] = {
              ...next[slotIdx],
              status: 'deferred' as const,
              error: r.error || 'Under-supported slot',
              diagnostics: r.diagnostics || undefined,
            };
            return next;
          });
          continue;
        }

        if (!r || r.status !== 'ready' || !r.image_id) {
          const errMsg = r?.error || 'No result returned';
          setStorySlots(prev => {
            if (!prev) return prev;
            const next = [...prev];
            next[slotIdx] = {
              ...next[slotIdx],
              status: 'failed',
              error: errMsg,
              errorCode: r?.status || 'empty_result_set',
              diagnostics: r?.diagnostics || undefined,
            };
            return next;
          });
          continue;
        }

        // Fetch image metadata + signed URL for immediate display
        const { data: imgRow } = await (supabase as any)
          .from('project_images')
          .select('id, generation_config, prompt_used, subject, subject_type, model, provider, width, height, storage_path, storage_bucket')
          .eq('id', r.image_id)
          .single();
        let signedUrl: string | undefined;
        if (imgRow?.storage_path && imgRow?.storage_bucket) {
          const { data: urlData } = await supabase.storage
            .from(imgRow.storage_bucket)
            .createSignedUrl(imgRow.storage_path, 3600);
          signedUrl = urlData?.signedUrl || undefined;
        }
        const gc = imgRow?.generation_config || {};

        setStorySlots(prev => {
          if (!prev) return prev;
          const next = [...prev];
          next[slotIdx] = {
            ...next[slotIdx],
            status: 'ready',
            imageId: r.image_id,
            signedUrl,
            generation_config: gc,
            prompt_used: imgRow?.prompt_used,
            subject: imgRow?.subject,
            subject_type: imgRow?.subject_type,
            model: imgRow?.model,
            provider: imgRow?.provider,
            width: imgRow?.width,
            height: imgRow?.height,
            diagnostics: r.diagnostics || undefined,
          };
          return next;
        });

        // Invalidate after each successful slot so the grid updates
        await queryClient.invalidateQueries({ queryKey: ['hero-frame-images', projectId] });
      }

      // Final invalidation + primary enforcement
      setGenProgress({ stage: 'Finalizing', detail: 'Refreshing candidate pool…', percent: 92 });
      await queryClient.invalidateQueries({ queryKey: ['hero-frame-images', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-hero-frames-state', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['hero-frame-best-set', projectId] });

      setGenProgress({ stage: 'Enforcing primary', detail: 'Checking canonical hero primary…', percent: 95 });
      const enforcement = await enforceHeroPrimaryAtGenerationCompletion();
      if (enforcement.enforced) {
        await queryClient.invalidateQueries({ queryKey: ['hero-frame-images', projectId] });
        await queryClient.invalidateQueries({ queryKey: ['pipeline-hero-frames-state', projectId] });
        await queryClient.invalidateQueries({ queryKey: ['hero-frame-best-set', projectId] });
        await queryClient.invalidateQueries({ queryKey: ['lookbook-section-content', projectId, 'hero_frames'] });
      }

      const currentSlots = storySlots || plan;
      const readyCount = currentSlots.filter(s => s.status === 'ready').length;
      const failedCount = currentSlots.filter(s => s.status === 'failed').length;
      const deferredCount = currentSlots.filter(s => s.status === 'deferred').length;
      setGenProgress({
        stage: 'Complete',
        detail: `${readyCount} frames generated${deferredCount > 0 ? `, ${deferredCount} deferred (under-supported)` : ''}${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        percent: 100,
      });
      toast.success(`Story set complete — ${readyCount}/${plan.length} premium frames generated${deferredCount > 0 ? ` · ${deferredCount} deferred` : ''}`);
      setTimeout(() => { setGenProgress(null); }, 8000);
    } catch (e: any) {
      setGenProgress({ stage: 'Error', detail: e.message || 'Generation failed', percent: 0 });
      toast.error(e.message || 'Generation failed');
      setTimeout(() => { setGenProgress(null); }, 5000);
    } finally {
      setGenerating(false);
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['hero-frame-images', projectId] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-hero-frames-state', projectId] });
    queryClient.invalidateQueries({ queryKey: ['hero-frame-best-set', projectId] });
  };

  const handleSetPrimary = async (imageId: string) => {
    if (settingPrimary) return;
    // ── IEL IDENTITY GATE ──
    const img = heroImages?.find((i: any) => i.id === imageId);
    if (img && !isCharacterImageEligible(img)) {
      toast.error('Cannot set drift image as primary');
      return;
    }
    setSettingPrimary(imageId);
    try {
      await (supabase as any)
        .from('project_images')
        .update({ is_primary: false, role: 'hero_variant' })
        .eq('project_id', projectId)
        .eq('asset_group', 'hero_frame')
        .eq('is_primary', true);

      await (supabase as any)
        .from('project_images')
        .update({ is_primary: true, role: 'hero_primary', curation_state: 'active' })
        .eq('id', imageId);

      toast.success('Primary hero frame set — Production Design unlocked');
      invalidateAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to set primary');
    } finally {
      setSettingPrimary(null);
    }
  };

  const handleRejectFrame = async (imageId: string) => {
    if (rejectingId) return;
    setRejectingId(imageId);
    try {
      await (supabase as any)
        .from('project_images')
        .update({ is_active: false, curation_state: 'rejected' })
        .eq('id', imageId);

      toast.success('Hero frame removed from review');
      invalidateAll();

      if (lightboxIdx !== null) {
        const currentImg = heroImages?.[lightboxIdx];
        if (currentImg?.id === imageId) setLightboxIdx(null);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to reject frame');
    } finally {
      setRejectingId(null);
    }
  };

  const handleUnsetPrimary = async (imageId: string) => {
    if (settingPrimary) return;
    setSettingPrimary(imageId);
    try {
      await (supabase as any)
        .from('project_images')
        .update({ is_primary: false, role: 'hero_variant' })
        .eq('id', imageId);

      toast.success('Primary unset — frame remains in review');
      invalidateAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to unset primary');
    } finally {
      setSettingPrimary(null);
    }
  };

  const handleDemoteAndReject = async (imageId: string) => {
    if (rejectingId) return;
    setRejectingId(imageId);
    try {
      await (supabase as any)
        .from('project_images')
        .update({ is_primary: false, role: 'hero_variant', is_active: false, curation_state: 'rejected' })
        .eq('id', imageId);

      toast.success('Primary demoted and removed from review');
      invalidateAll();

      if (lightboxIdx !== null) {
        const currentImg = heroImages?.[lightboxIdx];
        if (currentImg?.id === imageId) setLightboxIdx(null);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove primary');
    } finally {
      setRejectingId(null);
    }
  };

  const handleApproveFrame = async (imageId: string) => {
    if (approvingId) return;
    // ── IEL IDENTITY GATE ──
    const img = heroImages?.find((i: any) => i.id === imageId);
    if (img && !isCharacterImageEligible(img)) {
      toast.error('Cannot approve drift image — identity integrity violated');
      return;
    }
    setApprovingId(imageId);
    try {
      await (supabase as any)
        .from('project_images')
        .update({ curation_state: 'active' })
        .eq('id', imageId);

      toast.success('Hero frame approved for pool');
      invalidateAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve frame');
    } finally {
      setApprovingId(null);
    }
  };

  const handleUnapproveFrame = async (imageId: string) => {
    if (approvingId) return;
    setApprovingId(imageId);
    try {
      await (supabase as any)
        .from('project_images')
        .update({ curation_state: 'candidate' })
        .eq('id', imageId);
      toast.success('Moved back to candidates');
      invalidateAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to unapprove frame');
    } finally {
      setApprovingId(null);
    }
  };

  // ── Batch actions using canonical best-set IDs ──
  const handleConvergeToBestSet = async () => {
    if (batchBusy || !bestSet) return;
    setBatchBusy(true);
    try {
      // Approve recommended
      const toApprove = bestSet.recommendedApprovedIds.filter(id => {
        const img = heroImages?.find((i: any) => i.id === id);
        return img && img.curation_state !== 'active';
      });
      if (toApprove.length > 0) {
        await (supabase as any)
          .from('project_images')
          .update({ curation_state: 'active' })
          .in('id', toApprove);
      }

      // Demote weaker
      if (bestSet.recommendedDemoteIds.length > 0) {
        await (supabase as any)
          .from('project_images')
          .update({ curation_state: 'candidate', is_primary: false, role: 'hero_variant' })
          .in('id', bestSet.recommendedDemoteIds);
      }

      // Set recommended primary
      if (bestSet.recommendedPrimaryId) {
        await (supabase as any)
          .from('project_images')
          .update({ is_primary: false, role: 'hero_variant' })
          .eq('project_id', projectId)
          .eq('asset_group', 'hero_frame')
          .eq('is_primary', true);

        await (supabase as any)
          .from('project_images')
          .update({ is_primary: true, role: 'hero_primary', curation_state: 'active' })
          .eq('id', bestSet.recommendedPrimaryId);
      }

      invalidateAll();
      toast.success(`Converged: ${toApprove.length} approved, ${bestSet.recommendedDemoteIds.length} demoted`);
    } catch (e: any) {
      toast.error(e.message || 'Convergence failed');
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-display font-semibold text-foreground">Hero Frames</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Cinematic anchor stills that define the visual truth for your project. All downstream imagery — Production Design, Visual Language, and Look Book — derives from these frames.
        </p>
      </div>

      {/* ── Compact lifecycle hint ── */}
      {hasFrames && !generating && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Info className="h-3 w-3 shrink-0" />
          Candidate → Approve → Set Primary (unlocks Production Design). Target: {FINAL_SET_SIZE} approved frames.
        </p>
      )}

      {/* ── Best-Set Summary Strip ── */}
      {bestSet && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary/70" />
            <h3 className="text-sm font-display font-semibold text-foreground">Best Set Analysis</h3>
          </div>

          {/* Counters */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border/20 bg-background/50 p-2 text-center">
              <p className="text-lg font-bold tabular-nums text-foreground">{bestSet.approvedCurrent}</p>
              <p className="text-[9px] text-muted-foreground">{bestSet.hasLockedPrimary ? 'Additional Approved' : 'Approved'}</p>
            </div>
            <div className="rounded-md border border-border/20 bg-background/50 p-2 text-center">
              <p className="text-lg font-bold tabular-nums text-foreground">{bestSet.approvedTarget}</p>
              <p className="text-[9px] text-muted-foreground">Target</p>
            </div>
            <div className={`rounded-md border p-2 text-center ${bestSet.shortfallCount > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-primary/20 bg-primary/5'}`}>
              <p className={`text-lg font-bold tabular-nums ${bestSet.shortfallCount > 0 ? 'text-amber-600' : 'text-primary'}`}>
                {bestSet.shortfallCount > 0 ? `-${bestSet.shortfallCount}` : '✓'}
              </p>
              <p className="text-[9px] text-muted-foreground">{bestSet.shortfallCount > 0 ? 'Shortfall' : 'Complete'}</p>
            </div>
          </div>

          {/* Anchor status callout */}
          {bestSet.hasLockedPrimary && bestSet.approvedCurrent === 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2 flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">Canonical anchor is locked and active.</span>{' '}
                No additional governed candidates are available for curation. Generate more frames to expand the set.
              </div>
            </div>
          )}

          {/* Action summary */}
          <div className="flex flex-wrap gap-1.5">
            {bestSet.recommendedDemoteIds.length > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-500/20">
                <ArrowDown className="h-2.5 w-2.5 mr-0.5" /> {bestSet.recommendedDemoteIds.length} weaker approved
              </Badge>
            )}
            {bestSet.recommendedApprovedIds.filter(id => {
              const img = heroImages?.find((i: any) => i.id === id);
              return img && img.curation_state !== 'active';
            }).length > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-green-500/10 text-green-700 border-green-500/20">
                <ArrowUp className="h-2.5 w-2.5 mr-0.5" /> {bestSet.recommendedApprovedIds.filter(id => {
                  const img = heroImages?.find((i: any) => i.id === id);
                  return img && img.curation_state !== 'active';
                }).length} to approve
              </Badge>
            )}
            {bestSet.recommendedPrimaryId && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                <Target className="h-2.5 w-2.5 mr-0.5" /> Recommended primary
              </Badge>
            )}
          </div>

          {/* Warnings — always show */}
          {bestSet.diagnosticWarnings.length > 0 && (
            <div className="space-y-1">
              {bestSet.diagnosticWarnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-600 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {w}
                </p>
              ))}
            </div>
          )}

          {/* ── Advanced Curation Tools — collapsed by default ── */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1">
              <Zap className="h-3 w-3" />
              Advanced Curation Tools
              <ChevronRight className="h-3 w-3 ml-auto group-data-[state=open]:rotate-90 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {/* Coverage */}
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(bestSet.coverageSummary)
                  .filter(([, count]) => count > 0)
                  .map(([cat, count]) => (
                    <Badge key={cat} variant="outline" className="text-[9px] px-1.5 py-0 bg-muted/30">
                      {COVERAGE_LABELS[cat as keyof typeof COVERAGE_LABELS] || cat} ×{count}
                    </Badge>
                  ))}
              </div>

              {/* Batch actions */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="text-[10px] h-7"
                  disabled={batchBusy || curating}
                  onClick={handleConvergeToBestSet}
                >
                  {batchBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                  Converge to Best Set
                </Button>
              </div>

              {/* Diagnostics drawer */}
              {bestSet.scored.length > 0 && (
                <div className="rounded-md border border-border/20 bg-background/50 p-2 max-h-48 overflow-y-auto">
                  <p className="text-[9px] font-medium text-foreground mb-1">Ranked Candidates (canonical engine)</p>
                  {bestSet.scored.slice(0, 20).map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between text-[9px] py-0.5 border-b border-border/10 last:border-0">
                      <span className="text-muted-foreground font-mono">#{i + 1} {s.id.slice(0, 8)}</span>
                      <span className="tabular-nums font-medium text-foreground">{s.totalScore.toFixed(0)}pts</span>
                      <span className="text-muted-foreground truncate max-w-[100px]">{s.recommendedAction}</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* ── Status summary (when no best-set yet) ── */}
      {!bestSet && (
        <div className="rounded-lg border border-border/30 bg-card/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Frame className="h-4 w-4 text-primary/70" />
            <h3 className="text-sm font-display font-semibold text-foreground">Anchor Set</h3>
          </div>
          {primaryLocked ? (
            <div className="space-y-2">
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                <Lock className="h-3 w-3 mr-1" /> Primary Hero Frame Locked
              </Badge>
              <p className="text-xs text-muted-foreground">
                {inputs.heroFrameApproved}/{inputs.heroFrameTotal} frames approved. Best-set analysis loading…
              </p>
            </div>
          ) : hasFrames ? (
            <div className="space-y-2">
              <Badge className="bg-accent/10 text-accent-foreground border-accent/20 text-[10px]">
                <Sparkles className="h-3 w-3 mr-1" /> Ready for Curation
              </Badge>
              <p className="text-xs text-muted-foreground">
                {inputs.heroFrameTotal} hero frame{inputs.heroFrameTotal !== 1 ? 's' : ''} generated. Target: ~{FINAL_SET_SIZE} approved frames.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No hero frames generated yet. Generate cinematic anchor stills to establish the project's visual truth.
              </p>
              <div className="rounded-md border border-border/20 bg-muted/10 p-3 space-y-2">
                <p className="text-[11px] font-medium text-foreground">What hero frames define:</p>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Tone, lighting, and color palette</li>
                  <li>Lens language and composition bias</li>
                  <li>Realism expectations for all generated imagery</li>
                  <li>Character placement in cinematic context</li>
                </ul>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Hero frames are photoreal landscape stills — not posters, not concept art, not composites.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Generate CTA */}
      {canGenerate && (
        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generating || curating}
            className="flex-1"
            variant={hasFrames ? 'outline' : 'default'}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Story Set…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {hasFrames ? 'Generate Story Set' : 'Generate Story Set (13 Frames)'}
              </>
            )}
          </Button>
          {hasFrames && inputs.heroFrameTotal >= 3 && (
            <Button
              onClick={() => runAutoCuration()}
              disabled={curating || generating || (bestSet?.approvedCurrent === 0 && bestSet?.scored.length === 0)}
              variant="default"
              title={bestSet?.approvedCurrent === 0 && bestSet?.scored.length === 0 ? 'No eligible candidates — generate more frames' : undefined}
            >
              {curating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Curating…
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4 mr-2" />
                  {bestSet?.approvedCurrent === 0 && bestSet?.scored.length === 0
                    ? 'Auto-Curate (no candidates)'
                    : `Auto-Curate Target (${FINAL_SET_SIZE})`}
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Generation Progress */}
      {genProgress && (
        <div className="rounded-lg border border-border/30 bg-card/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {genProgress.stage === 'Error' ? (
                <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
              ) : genProgress.stage === 'Complete' ? (
                <Check className="h-3 w-3 shrink-0 text-primary" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary" />
              )}
              <span className="font-medium text-foreground truncate">{genProgress.stage}</span>
            </div>
            {genProgress.percent > 0 && genProgress.stage !== 'Error' && (
              <span className="tabular-nums font-medium text-foreground text-[11px]">{genProgress.percent}%</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{genProgress.detail}</p>
          <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                genProgress.stage === 'Error' ? 'bg-destructive' :
                genProgress.stage === 'Complete' ? 'bg-primary' :
                'bg-primary'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, genProgress.percent))}%` }}
            />
          </div>
      {storySlots && !generating && (
            <div className="flex gap-2 text-[10px]">
              <span className="text-primary">{storySlots.filter(s => s.status === 'ready').length} generated</span>
              {storySlots.filter(s => s.status === 'deferred').length > 0 && (
                <span className="text-amber-500">{storySlots.filter(s => s.status === 'deferred').length} deferred</span>
              )}
              {storySlots.filter(s => s.status === 'failed').length > 0 && (
                <span className="text-destructive">{storySlots.filter(s => s.status === 'failed').length} failed</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Story Set Slot Grid ── */}
      {storySlots && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Story Set — Rendering sequentially, one frame at a time
            </p>
            {!generating && (
              <button
                onClick={() => setStorySlots(null)}
                className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {storySlots.map((slot) => (
              <div
                key={slot.index}
                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                  slot.status === 'ready'
                    ? 'border-primary/50 cursor-pointer hover:border-primary'
                    : slot.status === 'generating'
                    ? 'border-primary/30 animate-pulse'
                    : slot.status === 'failed'
                    ? 'border-destructive/40'
                    : slot.status === 'deferred'
                    ? 'border-amber-500/30'
                    : 'border-border/20'
                }`}
                onClick={() => {
                  if (slot.status === 'ready' && slot.imageId) {
                    const match = heroImages?.find((i: any) => i.id === slot.imageId);
                    if (match) {
                      setLightboxIdx(heroImages!.indexOf(match));
                    }
                  }
                }}
              >
                {slot.status === 'ready' && slot.signedUrl ? (
                  <img src={slot.signedUrl} alt={slot.narrativeFunctionLabel} className="w-full aspect-video object-cover" />
                ) : (
                  <div className={`w-full aspect-video flex flex-col items-center justify-center gap-1 ${
                    slot.status === 'generating' ? 'bg-primary/5' :
                    slot.status === 'failed' ? 'bg-destructive/5' :
                    slot.status === 'deferred' ? 'bg-amber-500/5' :
                    'bg-muted/20'
                  }`}>
                    {slot.status === 'generating' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {slot.status === 'failed' && <X className="h-4 w-4 text-destructive" />}
                    {slot.status === 'deferred' && <Frame className="h-4 w-4 text-amber-500/50" />}
                    {slot.status === 'pending' && <Frame className="h-4 w-4 text-muted-foreground/30" />}
                  </div>
                )}
                {/* Slot label overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1 py-0.5">
                  <p className="text-[7px] text-muted-foreground truncate font-medium">
                    {slot.index + 1}. {slot.narrativeFunctionLabel}
                  </p>
                  {slot.status === 'failed' && slot.error && (
                    <p className="text-[6px] text-destructive truncate">{slot.error}</p>
                  )}
                  {slot.status === 'deferred' && (
                    <p className="text-[6px] text-amber-500 truncate">Under-supported — deferred</p>
                  )}
                </div>
                {/* Status indicator */}
                {slot.status === 'ready' && (
                  <div className="absolute top-0.5 right-0.5">
                    <Check className="h-3 w-3 text-primary bg-background/80 rounded-full p-0.5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MISSING PRIMARY WARNING — de facto anchor elimination ── */}
      {heroImages && heroImages.length > 0 && !heroImages.some((i: any) => i.is_primary && i.role === 'hero_primary') && heroImages.some((i: any) => i.curation_state === 'active') && !enforcingPrimary && (
        <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-display font-semibold text-destructive">No Primary Hero Frame Set</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Active approved hero frames exist but no canonical primary is assigned. The first visible image is <strong>not</strong> the primary — it is sorted by recency only. Production Design and downstream surfaces require a locked primary to proceed.
          </p>
          {bestSet?.recommendedPrimaryId && (
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                <Target className="h-2.5 w-2.5 mr-0.5" /> Recommended: {bestSet.recommendedPrimaryId.slice(0, 8)}…
              </Badge>
              <Button
                size="sm"
                variant="default"
                className="text-[10px] h-7"
                disabled={!!settingPrimary}
                onClick={() => bestSet.recommendedPrimaryId && handleSetPrimary(bestSet.recommendedPrimaryId)}
              >
                <Check className="h-3 w-3 mr-1" />
                Set Recommended Primary
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Enforcing primary indicator */}
      {enforcingPrimary && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Auto-assigning canonical hero primary from best-set analysis…</p>
        </div>
      )}

      {/* ── Image Grid with Identity Enforcement ── */}
      {heroImages && heroImages.length > 0 && (() => {
        // ── CANONICAL IDENTITY GATE: classify via universal gate ──
        const { eligible: identityPassed, drift: driftImages, blocked: blockedImages } = filterEligibleImages(
          heroImages.map((i: any) => ({
            id: i.id,
            subject_type: i.subject_type,
            subject: i.subject,
            generation_config: i.generation_config,
            // Pass through all other fields
            ...i,
          })),
          'hero_frames',
        );
        // ── PREMIUM QUALITY GATE: exclude sub-premium from governed pool ──
        const { admitted: validImages, excluded: premiumExcluded } = filterPremiumActiveImages(identityPassed, 'hero_frames');

        /** Extract provenance metadata from image row */
        const getProvenance = (img: any) => {
          const gc = img.generation_config || {};
          return {
            model: img.model || (gc as any).model || null,
            provider: img.provider || (gc as any).provider || null,
            qualityTarget: (gc as any).quality_target || (gc as any).qualityTarget || null,
            identityMode: (gc as any).identity_mode || (gc as any).identityMode || null,
            generationPurpose: (gc as any).generation_purpose || 'hero_frame',
          };
        };

        const renderProvenanceChips = (img: any, compact = false) => {
          const prov = getProvenance(img);
          const chips: { label: string; value: string }[] = [];
          if (prov.model) chips.push({ label: 'Model', value: prov.model.split('/').pop() || prov.model });
          if (prov.provider) chips.push({ label: 'Provider', value: prov.provider });
          if (prov.qualityTarget) chips.push({ label: 'Quality', value: prov.qualityTarget });
          if (prov.identityMode) chips.push({ label: 'Identity', value: prov.identityMode });
          if (chips.length === 0) return null;
          return (
            <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-1.5'}`}>
              {chips.map(c => (
                <span key={c.label} className="inline-flex items-center text-[8px] rounded bg-muted/40 text-muted-foreground px-1.5 py-0.5 border border-border/20">
                  <span className="font-medium text-foreground/70 mr-1">{c.label}:</span>{c.value}
                </span>
              ))}
            </div>
          );
        };

        const renderCard = (img: any, isDrift: boolean, isPrimarySlot = false) => {
          const isPrimary = img.is_primary && img.role === 'hero_primary';
          const isApproved = img.curation_state === 'active' && !isPrimary;
          const rec = isDrift ? null : getRecommendation(img.id);
          return (
            <div
              key={img.id}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                isDrift
                  ? 'border-destructive/40 opacity-70'
                  : isPrimary && isPrimarySlot
                  ? 'border-primary ring-2 ring-primary/20 shadow-lg'
                  : isPrimary
                  ? 'border-primary shadow-md'
                  : isApproved
                  ? 'border-green-500/50 shadow-sm'
                  : 'border-border/30 hover:border-border/60'
              }`}
            >
              {img.signedUrl ? (
                <img
                  src={img.signedUrl}
                  alt="Hero frame candidate"
                  className={`w-full ${isPrimarySlot ? 'aspect-[2.39/1]' : 'aspect-video'} object-cover cursor-pointer ${isDrift ? 'grayscale-[30%]' : ''}`}
                  onClick={() => setLightboxIdx(heroImages.indexOf(img))}
                />
              ) : (
                <div className={`w-full ${isPrimarySlot ? 'aspect-[2.39/1]' : 'aspect-video'} bg-muted/30 flex items-center justify-center`}>
                  <Frame className="h-6 w-6 text-muted-foreground/30" />
                </div>
              )}
              {/* Drift badge — overrides all other status badges */}
              {isDrift && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-destructive/90 text-destructive-foreground text-[9px] px-1.5 py-0.5">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> IDENTITY DRIFT
                  </Badge>
                </div>
              )}
              {/* Primary badge — enhanced for primary slot */}
              {!isDrift && isPrimary && (
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0.5 shadow-md">
                    <Lock className="h-2.5 w-2.5 mr-0.5" /> {isPrimarySlot ? 'CANONICAL HERO ANCHOR' : 'PRIMARY'}
                  </Badge>
                  {isPrimarySlot && (
                    <Badge variant="outline" className="bg-background/80 text-[8px] px-1.5 py-0.5 border-primary/30 text-primary/80">
                      Used by Poster · Lookbook · Deck
                    </Badge>
                  )}
                </div>
              )}
              {/* Approved badge */}
              {!isDrift && isApproved && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-green-600/90 text-white text-[9px] px-1.5 py-0.5">
                    <Star className="h-2.5 w-2.5 mr-0.5" /> APPROVED
                  </Badge>
                </div>
              )}
              {/* Candidate badge */}
              {!isDrift && !isPrimary && !isApproved && (
                <div className="absolute top-2 left-2">
                  <Badge variant="outline" className="bg-background/80 text-muted-foreground text-[9px] px-1.5 py-0.5 border-border/40">
                    CANDIDATE
                  </Badge>
                </div>
              )}
              {/* Recommendation badge from canonical engine */}
              {rec && (
                <div className={`absolute ${isPrimarySlot ? 'top-12' : 'top-8'} left-2`}>
                  <Badge className={`${rec.color} text-[8px] px-1.5 py-0.5 shadow-sm`}>
                    {rec.icon} {rec.label}
                  </Badge>
                </div>
              )}
              {/* Dimensions + identity badge top-right */}
              <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                {img.width && img.height && (
                  <Badge variant="outline" className="bg-background/80 text-[9px] px-1 py-0">
                    {img.width}×{img.height}
                  </Badge>
                )}
                {/* Identity status badge */}
                {!isDrift && (() => {
                  const gc = img.generation_config || {};
                  const hasIdentityLock = !!(gc as any).identity_locked;
                  const hasRefs = ((gc as any).reference_images_total ?? 0) > 0;
                  if (hasIdentityLock) {
                    return (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[8px] px-1 py-0">
                        <Shield className="h-2 w-2 mr-0.5" /> {hasRefs ? 'ANCHORS INJECTED' : 'LOCK REQUESTED'}
                      </Badge>
                    );
                  }
                  return (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[8px] px-1 py-0">
                      <ShieldAlert className="h-2 w-2 mr-0.5" /> LEGACY
                    </Badge>
                  );
                })()}
              </div>
              {/* Provenance strip at bottom of card (primary slot only) */}
              {isPrimarySlot && !isDrift && (
                <div className="absolute bottom-10 left-2 right-2">
                  {renderProvenanceChips(img, true)}
                </div>
              )}
              {/* Actions — BLOCKED for drift images */}
              {isDrift ? (
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 bg-background/70 hover:bg-destructive/90 hover:text-white"
                    disabled={!!rejectingId}
                    onClick={(e) => { e.stopPropagation(); handleRejectFrame(img.id); }}
                    title="Remove drift image"
                  >
                    {rejectingId === img.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ) : (
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  {isPrimary ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[10px] px-2"
                        disabled={!!settingPrimary}
                        onClick={(e) => { e.stopPropagation(); handleUnsetPrimary(img.id); }}
                      >
                        {settingPrimary === img.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <StarOff className="h-3 w-3 mr-1" />
                            Unset Primary
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 bg-background/70 hover:bg-destructive/90 hover:text-white"
                        disabled={!!rejectingId}
                        onClick={(e) => { e.stopPropagation(); handleDemoteAndReject(img.id); }}
                        title="Demote & remove from review"
                      >
                        {rejectingId === img.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      {img.curation_state !== 'active' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[10px] px-2"
                          disabled={!!approvingId}
                          onClick={(e) => { e.stopPropagation(); handleApproveFrame(img.id); }}
                        >
                          {approvingId === img.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Star className="h-3 w-3 mr-1" />
                              Approve
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2"
                          disabled={!!approvingId}
                          onClick={(e) => { e.stopPropagation(); handleUnapproveFrame(img.id); }}
                        >
                          {approvingId === img.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <StarOff className="h-3 w-3 mr-1" />
                              Unapprove
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[10px] px-2"
                        disabled={!!settingPrimary}
                        onClick={(e) => { e.stopPropagation(); handleSetPrimary(img.id); }}
                      >
                        {settingPrimary === img.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Set Primary
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 bg-background/70 hover:bg-destructive/90 hover:text-white"
                        disabled={!!rejectingId}
                        onClick={(e) => { e.stopPropagation(); handleRejectFrame(img.id); }}
                        title="Remove from review"
                      >
                        {rejectingId === img.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        };

        // ── Canonical sort: primary → active → candidate (eliminates de facto anchor by position) ──
        const primaryImages = validImages.filter((i: any) => i.is_primary && i.role === 'hero_primary');
        const activeImages = validImages.filter((i: any) => i.curation_state === 'active' && !(i.is_primary && i.role === 'hero_primary'));
        const candidateImages = validImages.filter((i: any) => i.curation_state === 'candidate');
        const hasPrimaryInPool = primaryImages.length > 0;

        return (
          <div className="space-y-5">
            {/* Primary section — full-width, visually authoritative */}
            {hasPrimaryInPool && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-primary flex items-center gap-1.5">
                  <Lock className="h-3 w-3" /> Canonical Primary
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {primaryImages.map((img: any) => renderCard(img, false, true))}
                </div>
              </div>
            )}

            {/* Active approved pool — visually secondary */}
            {activeImages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <h3 className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Star className="h-3 w-3 text-green-600" /> Approved Pool ({activeImages.length})
                  </h3>
                  {!hasPrimaryInPool && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 border-amber-500/30 text-amber-700">
                      ⚠ No primary — position ≠ selection
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {activeImages.map((img: any) => renderCard(img, false))}
                </div>
                {/* Provenance summary for approved pool */}
                {activeImages.length > 0 && (() => {
                  const models = new Set(activeImages.map((i: any) => (i.model || (i.generation_config as any)?.model || 'unknown')));
                  const providers = new Set(activeImages.map((i: any) => (i.provider || (i.generation_config as any)?.provider || 'unknown')));
                  return (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[8px] text-muted-foreground/70">Pool regime:</span>
                      {Array.from(models).map(m => (
                        <Badge key={m} variant="outline" className="text-[8px] px-1.5 py-0 bg-muted/20 text-muted-foreground border-border/20">
                          {(m as string).split('/').pop()}
                        </Badge>
                      ))}
                      {Array.from(providers).map(p => (
                        <Badge key={p} variant="outline" className="text-[8px] px-1.5 py-0 bg-muted/20 text-muted-foreground border-border/20">
                          {p as string}
                        </Badge>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Candidate pool */}
            {candidateImages.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Candidates ({candidateImages.length})
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {candidateImages.map((img: any) => renderCard(img, false))}
                </div>
              </div>
            )}

            {/* ── Admin Diagnostics — collapsed by default ── */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1.5 px-3 rounded-md border border-border/20 bg-muted/5">
                <Info className="h-3 w-3" />
                Pool Diagnostics
                <ChevronRight className="h-3 w-3 ml-auto transition-transform group-data-[state=open]:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-1.5 pt-2 pb-1 px-3 text-[9px] font-mono">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Current Primary:</span>
                    <span className="text-foreground">{hasPrimaryInPool ? primaryImages[0]?.id?.slice(0, 12) + '…' : '—none—'}</span>
                    <span className="text-muted-foreground">Recommended Primary:</span>
                    <span className="text-foreground">{bestSet?.recommendedPrimaryId ? bestSet.recommendedPrimaryId.slice(0, 12) + '…' : '—none—'}</span>
                    <span className="text-muted-foreground">Active Approved:</span>
                    <span className="text-foreground">{activeImages.length + primaryImages.length}</span>
                    <span className="text-muted-foreground">Candidates:</span>
                    <span className="text-foreground">{candidateImages.length}</span>
                    <span className="text-muted-foreground">Identity Drift:</span>
                    <span className="text-foreground">{driftImages.length}</span>
                    <span className="text-muted-foreground">Identity Blocked:</span>
                    <span className="text-foreground">{blockedImages.length}</span>
                    <span className="text-muted-foreground">Premium Excluded:</span>
                    <span className="text-foreground">{premiumExcluded.length}</span>
                    <span className="text-muted-foreground">Auto-Enforcement:</span>
                    <span className={hasPrimaryInPool ? 'text-primary' : 'text-amber-600'}>
                      {enforcingPrimary ? 'running…' : hasPrimaryInPool ? 'complete' : 'pending — zero primary'}
                    </span>
                  </div>
                  {bestSet?.recommendedPrimaryId && hasPrimaryInPool && bestSet.recommendedPrimaryId !== primaryImages[0]?.id && (
                    <p className="text-amber-600 text-[8px] mt-1">
                      ⚠ Current primary differs from canonical recommendation
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Drift section — collapsed by default */}
            {driftImages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive/70" />
                  <h3 className="text-xs font-medium text-destructive/80">
                    Identity Drift ({driftImages.length})
                  </h3>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-destructive/5 text-destructive/70 border-destructive/20">
                    Excluded from scoring & approval
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  These images failed identity verification — they may depict a different actor or lack identity anchors. Only rejection is available.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {driftImages.map((img: any) => renderCard(img, true))}
                </div>
              </div>
            )}

            {/* Blocked (missing identity evidence) section */}
            {blockedImages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500/70" />
                  <h3 className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Identity Unverified ({blockedImages.length})
                  </h3>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20">
                    Missing identity evidence
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  These images lack identity metadata (subject_type or identity_locked). They cannot enter governed pools until regenerated with identity anchors.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {blockedImages.map((img: any) => renderCard(img, true))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Hero Frame Detail Viewer */}
      {heroImages && heroImages.length > 0 && (
        <HeroFrameDetailViewer
          images={heroImages}
          currentIndex={lightboxIdx ?? -1}
          open={lightboxIdx !== null}
          onOpenChange={(open) => { if (!open) setLightboxIdx(null); }}
          onNavigate={setLightboxIdx}
          getRecommendation={getRecommendation}
          onSetPrimary={handleSetPrimary}
          onUnsetPrimary={handleUnsetPrimary}
          onApprove={handleApproveFrame}
          onUnapprove={handleUnapproveFrame}
          onReject={handleRejectFrame}
          onDemoteAndReject={handleDemoteAndReject}
          settingPrimary={settingPrimary}
          approvingId={approvingId}
          rejectingId={rejectingId}
        />
      )}

      {/* Requirements */}
      <div className="rounded-lg border border-border/30 bg-card/30 p-4 space-y-2">
        <h3 className="text-xs font-medium text-foreground">Requirements</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            {inputs.castComplete ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <AlertCircle className="h-3 w-3 text-muted-foreground/50" />
            )}
            <span className={inputs.castComplete ? 'text-foreground' : 'text-muted-foreground'}>
              Cast locked with complete datasets
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {inputs.hasLocations ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <AlertCircle className="h-3 w-3 text-muted-foreground/50" />
            )}
            <span className={inputs.hasLocations ? 'text-foreground' : 'text-muted-foreground'}>
              World foundation — {inputs.locationCount} location{inputs.locationCount !== 1 ? 's' : ''} defined
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {inputs.visualStyleComplete ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <AlertCircle className="h-3 w-3 text-muted-foreground/50" />
            )}
            <span className={inputs.visualStyleComplete ? 'text-foreground' : 'text-muted-foreground'}>
              Visual style profile complete
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VisualProductionPipeline() {
  const { id: projectId } = useParams<{ id: string }>();
  const inputs = usePipelineInputs(projectId);
  const { result: vcsResult, loading: vcsLoading, diagnostics: vcsDiagnostics } = useVisualCoherence(projectId, inputs);
  const stages = useMemo(() => resolvePipelineStages(inputs), [inputs]);
  const suggestedStage = useMemo(() => getActiveStage(stages), [stages]);
  const [activeStage, setActiveStage] = useState<PipelineStage>(suggestedStage);

  // Auto-focus on suggested stage on first load
  useEffect(() => {
    setActiveStage(suggestedStage);
  }, [suggestedStage]);

  const activeState = stages.find(s => s.stage === activeStage) || stages[0];

  if (!projectId) return null;

  const completedCount = stages.filter(s => s.status === 'locked' || s.status === 'approved').length;
  const totalCount = stages.length;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border/30 bg-card/20 px-4 py-3 flex items-center gap-3">
        <Link to={`/projects/${projectId}`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground -ml-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Project
          </Button>
        </Link>
        <div className="h-4 w-px bg-border/30" />
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <span className="text-sm font-display font-semibold text-foreground">Visual Production Pipeline</span>
        </div>
        <div className="ml-auto">
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {completedCount}/{totalCount} stages complete
          </Badge>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Stage rail — LEFT (visible on lg+) */}
        <div className="w-56 xl:w-64 border-r border-border/20 bg-card/10 p-2 space-y-1 overflow-y-auto shrink-0 hidden lg:block">
          {stages.map((state, idx) => (
            <div key={state.stage}>
              {idx > 0 && (
                <div className="flex justify-center py-0.5">
                  <div className={`h-3 w-px ${
                    stages[idx - 1].status === 'locked' || stages[idx - 1].status === 'approved'
                      ? 'bg-primary/30'
                      : 'bg-border/20'
                  }`} />
                </div>
              )}
              <StageRailItem
                state={state}
                isActive={activeStage === state.stage}
                onClick={() => setActiveStage(state.stage)}
              />
            </div>
          ))}
          {/* Visual Coherence Score */}
          <div className="mt-3 pt-3 border-t border-border/20">
            <VisualCoherencePanel result={vcsResult} loading={vcsLoading} diagnostics={vcsDiagnostics} />
          </div>
        </div>

        {/* Mobile stage selector */}
        <div className="lg:hidden px-3 py-2 border-b border-border/20 bg-card/10 flex gap-1.5 overflow-x-auto">
          {stages.map(state => {
            const style = statusStyle(state.status);
            const isActive = activeStage === state.stage;
            return (
              <button
                key={state.stage}
                onClick={() => setActiveStage(state.stage)}
                className={`shrink-0 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
                  isActive ? `${style.bg} ${style.text} ${style.border} border` : 'text-muted-foreground hover:bg-muted/20'
                }`}
              >
                {state.label}
              </button>
            );
          })}
        </div>

        {/* Content panel — CENTER */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }>
              {activeState.status === 'blocked' && activeStage !== 'cast' && activeStage !== 'hero_frames' && activeStage !== 'production_design' && activeStage !== 'lookbook' ? (
                <div className="p-4 md:p-6">
                  <BlockedPanel state={activeState} />
                </div>
              ) : activeStage === 'source_truth' ? (
                <div className="p-4 md:p-6">
                  <SourceTruthPanel projectId={projectId} />
                </div>
              ) : activeStage === 'visual_canon' ? (
                <div className="p-4 md:p-6">
                  <VisualCanonPanel projectId={projectId} />
                </div>
              ) : activeStage === 'cast' ? (
                activeState.status === 'blocked' ? (
                  <div className="p-4 md:p-6"><BlockedPanel state={activeState} /></div>
                ) : (
                  <CastingPipelineContent />
                )
              ) : activeStage === 'hero_frames' ? (
                activeState.status === 'blocked' ? (
                  <div className="p-4 md:p-6"><BlockedPanel state={activeState} /></div>
                ) : (
                  <div className="p-4 md:p-6">
                    <HeroFramesPanel projectId={projectId} inputs={inputs} />
                  </div>
                )
              ) : activeStage === 'production_design' ? (
                activeState.status === 'blocked' ? (
                  <div className="p-4 md:p-6"><BlockedPanel state={activeState} /></div>
                ) : (
                  <ProductionDesignContent />
                )
              ) : activeStage === 'visual_language' ? (
                <div className="p-4 md:p-6">
                  <VisualLanguagePanel projectId={projectId} />
                </div>
              ) : activeStage === 'poster' ? (
                activeState.status === 'blocked' ? (
                  <div className="p-4 md:p-6"><BlockedPanel state={activeState} /></div>
                ) : (
                  <div className="p-4 md:p-6">
                    <PosterPanel projectId={projectId} />
                  </div>
                )
              ) : activeStage === 'concept_brief' ? (
                activeState.status === 'blocked' ? (
                  <div className="p-4 md:p-6"><BlockedPanel state={activeState} /></div>
                ) : (
                  <div className="p-4 md:p-6">
                    <ConceptBriefPanel projectId={projectId} />
                  </div>
                )
              ) : activeStage === 'lookbook' ? (
                activeState.status === 'blocked' ? (
                  <div className="p-4 md:p-6"><BlockedPanel state={activeState} /></div>
                ) : (
                  <div className="p-4 md:p-6">
                    <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border/50 flex items-center gap-2">
                      <FlaskConical className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        <strong>Explore / Lab</strong> — Internal exploration surface. Not included in investor-facing outputs.
                      </span>
                    </div>
                    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                      <LookBookContent />
                    </Suspense>
                  </div>
                )
              ) : (
                <div className="p-4 md:p-6">
                  <BlockedPanel state={activeState} />
                </div>
              )}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
