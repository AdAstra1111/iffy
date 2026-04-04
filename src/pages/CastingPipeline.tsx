/**
 * CastingPipeline — Unified "Generate Cast → Review → Approve → Lock → Character Visuals" workflow.
 * Wraps existing casting infrastructure into a single guided pipeline.
 * Casting ends at "Character Visuals Complete" and transitions into Production Design.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Users, Sparkles, Loader2, Check, ChevronDown, ChevronRight,
  Crown, ShieldCheck, RefreshCw, Eye, Settings2, Lock, Unlock,
  AlertTriangle, XCircle, Star, Clapperboard, ImageIcon,
  Palette, ArrowRight, ShieldAlert, Fingerprint, Shirt,
  Wand2, ThumbsDown, MessageSquare, BookOpen, Plus, SlidersHorizontal
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { aiCastApi } from '@/lib/aiCast/aiCastApi';
import { bindActorToProjectCharacter } from '@/lib/aiCast/projectCastBindings';
import { normalizeCharacterKey } from '@/lib/aiCast/normalizeCharacterKey';
import { extractCanonicalCharacterNames } from '@/lib/canon/extractCanonicalCharacterNames';
import {
  runCandidateAnchorPrecheck,
  persistAnchorStatus,
  type CandidateAnchorPackage,
} from '@/lib/aiCast/anchorValidation';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from '@/components/ui/collapsible';
import { CostumeOnActorPanel } from '@/components/visual/CostumeOnActorPanel';
import { useCostumeOnActor } from '@/hooks/useCostumeOnActor';
import { CharacterBrief } from '@/components/casting/CharacterBrief';
import { CastingAssistant, type RefinementState, EMPTY_REFINEMENT, hasActiveRefinements, refinementToEdgePayload } from '@/components/casting/CastingAssistant';
import { AutoCastModal } from '@/components/casting/AutoCastModal';
import { parseLikenessReferences } from '@/lib/aiCast/likenessParser';
import { interpretCastingNotes } from '@/lib/aiCast/castingNoteInterpreter';

// ── Character casting state machine ─────────────────────────────────────────

type CharacterCastState = 'uncast' | 'generating' | 'options_ready' | 'approved' | 'locked' | 'failed';

const CANDIDATES_PER_CHARACTER = 4;
const GENERATION_CONCURRENCY = 2;

interface CastingCandidate {
  id: string;
  project_id: string;
  user_id: string;
  character_key: string;
  batch_id: string;
  status: 'generated' | 'shortlisted' | 'rejected' | 'promoted';
  display_name: string | null;
  headshot_url: string | null;
  full_body_url: string | null;
  additional_refs: string[];
  generation_config: Record<string, unknown>;
  promoted_actor_id: string | null;
  promoted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CastMapping {
  id: string;
  project_id: string;
  character_key: string;
  ai_actor_id: string;
  ai_actor_version_id: string | null;
}

interface CharacterPipelineState {
  name: string;
  state: CharacterCastState;
  candidates: CastingCandidate[];
  binding: CastMapping | null;
  promotedCandidate: CastingCandidate | null;
  failureMessage?: string | null;
}

function deriveCharacterState(
  name: string,
  candidates: CastingCandidate[],
  binding: CastMapping | null,
  isGenerating: boolean,
  failureMessage?: string | null,
): CharacterPipelineState {
  const charCandidates = candidates.filter(c => normalizeCharacterKey(c.character_key) === normalizeCharacterKey(name));
  const promoted = charCandidates.find(c => c.status === 'promoted');

  let state: CharacterCastState;
  if (binding) {
    state = 'locked';
  } else if (promoted) {
    state = 'approved';
  } else if (isGenerating) {
    state = 'generating';
  } else if (charCandidates.some(c => c.status === 'generated' || c.status === 'shortlisted')) {
    state = 'options_ready';
  } else if (failureMessage) {
    state = 'failed';
  } else {
    state = 'uncast';
  }

  return { name, state, candidates: charCandidates, binding, promotedCandidate: promoted || null, failureMessage };
}


const STATE_CONFIG: Record<CharacterCastState, { label: string; className: string }> = {
  uncast:        { label: 'Needs Cast',     className: 'bg-muted text-muted-foreground' },
  generating:    { label: 'Generating…',    className: 'bg-primary/15 text-primary animate-pulse' },
  options_ready: { label: 'Review Options', className: 'bg-amber-500/15 text-amber-400' },
  approved:      { label: 'Approved',       className: 'bg-emerald-500/15 text-emerald-400' },
  locked:        { label: 'Locked',         className: 'bg-primary/15 text-primary' },
  failed:        { label: 'Failed',         className: 'bg-destructive/15 text-destructive' },
};

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      await worker(next);
    }
  });
  await Promise.all(runners);
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function CastingPipeline() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingChars, setGeneratingChars] = useState<Set<string>>(new Set());
  const [failedChars, setFailedChars] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set());
  const [justUnlocked, setJustUnlocked] = useState<Set<string>>(new Set());
  const [showCharacterVisuals, setShowCharacterVisuals] = useState(false);
  const [showAutoCast, setShowAutoCast] = useState(false);
  const [charNotes, setCharNotes] = useState<Record<string, string>>({});
  const [charRefinements, setCharRefinements] = useState<Record<string, RefinementState>>({});

  // Costume-on-actor hook for visual completeness gating
  const costumeOnActor = useCostumeOnActor(projectId);

  const { data: candidates = [], isLoading: candidatesLoading } = useQuery({
    queryKey: ['casting-candidates', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('casting_candidates')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CastingCandidate[];
    },
    enabled: !!projectId,
    refetchInterval: isGenerating ? 3000 : false,
  });

  const { data: characters = [] } = useQuery({
    queryKey: ['casting-characters', projectId],
    queryFn: async () => {
      const { data: canonRow, error: canonError } = await (supabase as any)
        .from('project_canon')
        .select('canon_json')
        .eq('project_id', projectId!)
        .maybeSingle();
      if (canonError) throw canonError;

      const canonicalNames = extractCanonicalCharacterNames(canonRow?.canon_json || null);
      if (canonicalNames.length > 0) return canonicalNames;

      // Explicit legacy fallback for older projects missing project_canon character arrays
      const { data: canonChars, error: canonFactsError } = await supabase
        .from('canon_facts')
        .select('subject')
        .eq('project_id', projectId!)
        .eq('fact_type', 'character')
        .eq('is_active', true);
      if (canonFactsError) throw canonFactsError;

      const unique = [...new Set((canonChars || []).map((d: any) => d.subject).filter(Boolean))];
      if (unique.length > 0) return unique as string[];

      const { data: imageSubjects, error: imageError } = await (supabase as any)
        .from('project_images')
        .select('subject')
        .eq('project_id', projectId!)
        .in('shot_type', ['identity_headshot', 'identity_full_body'])
        .not('subject', 'is', null);
      if (imageError) throw imageError;

      return [...new Set((imageSubjects || []).map((d: any) => d.subject).filter(Boolean))] as string[];
    },
    enabled: !!projectId,
  });

  const { data: mappings = [] } = useQuery({
    queryKey: ['project-ai-cast', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('project_ai_cast')
        .select('*')
        .eq('project_id', projectId!);
      if (error) throw error;
      return (data || []) as CastMapping[];
    },
    enabled: !!projectId,
  });

  const { data: actors = [] } = useQuery({
    queryKey: ['ai-actors', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await (supabase as any)
        .from('ai_actors')
        .select(`
          id,
          name,
          approved_version_id,
          roster_ready,
          anchor_coverage_status,
          anchor_coherence_status,
          ai_actor_versions!ai_actor_versions_actor_id_fkey(
            id,
            actor_id,
            version_number,
            created_at,
            ai_actor_assets(
              id,
              actor_version_id,
              asset_type,
              public_url,
              storage_path,
              meta_json,
              created_at
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const pipeline = useMemo(() => {
    const mappingMap = new Map<string, CastMapping>();
    for (const m of mappings) mappingMap.set(normalizeCharacterKey(m.character_key), m);
    return characters.map(name =>
      deriveCharacterState(
        name,
        candidates,
        mappingMap.get(normalizeCharacterKey(name)) || null,
        generatingChars.has(name),
        failedChars[name] || null,
      ),
    );
  }, [characters, candidates, mappings, generatingChars, failedChars]);

  useEffect(() => {
    if (!isGenerating) return;
    const newCompleted = new Set(justCompleted);
    for (const charName of generatingChars) {
      const charCands = candidates.filter(c => normalizeCharacterKey(c.character_key) === normalizeCharacterKey(charName));
      if (charCands.length >= CANDIDATES_PER_CHARACTER && !justCompleted.has(charName)) {
        newCompleted.add(charName);
      }
    }
    if (newCompleted.size !== justCompleted.size) setJustCompleted(newCompleted);
  }, [candidates, generatingChars, isGenerating, justCompleted]);

  useEffect(() => {
    if (!Object.keys(failedChars).length) return;
    const next = { ...failedChars };
    let changed = false;
    for (const [charName] of Object.entries(next)) {
      const count = candidates.filter(c => normalizeCharacterKey(c.character_key) === normalizeCharacterKey(charName)).length;
      if (count > 0) {
        delete next[charName];
        changed = true;
      }
    }
    if (changed) setFailedChars(next);
  }, [candidates, failedChars]);

  const summary = useMemo(() => {
    const counts = { uncast: 0, generating: 0, options_ready: 0, approved: 0, locked: 0, failed: 0 };
    for (const p of pipeline) counts[p.state]++;
    return counts;
  }, [pipeline]);

  const generationProgress = useMemo(() => {
    if (!isGenerating || generatingChars.size === 0) return null;
    let generated = 0;
    let expected = 0;
    for (const charName of generatingChars) {
      generated += candidates.filter(c => normalizeCharacterKey(c.character_key) === normalizeCharacterKey(charName)).length;
      expected += CANDIDATES_PER_CHARACTER;
    }
    return { generated, expected };
  }, [isGenerating, generatingChars, candidates]);

  const allLocked = pipeline.length > 0 && summary.locked === pipeline.length;
  const castingComplete = pipeline.length > 0 && (summary.locked + summary.approved) === pipeline.length;

  // ── Character visuals completeness ──
  const visualsComplete = useMemo(() => {
    if (!allLocked) return false;
    const gls = costumeOnActor.globalLockGapSummary;
    return gls.total > 0 && gls.locked === gls.total;
  }, [allLocked, costumeOnActor.globalLockGapSummary]);

  // ── Dataset strength analysis for locked actors ──
  const datasetStrength = useMemo(() => {
    if (!allLocked) return { allComplete: false, allCoherent: false, incomplete: [] as Array<{ name: string; actorId: string; versionId: string; coverage: string; coherence: string; missing: string[] }> };
    const incomplete: Array<{ name: string; actorId: string; versionId: string; coverage: string; coherence: string; missing: string[] }> = [];
    let allComplete = true;
    let allCoherent = true;
    for (const p of pipeline) {
      if (p.state !== 'locked' || !p.binding) continue;
      const actor = actors.find((a: any) => a.id === p.binding!.ai_actor_id);
      if (!actor) continue;
      const coverage = (actor as any).anchor_coverage_status || 'unknown';
      const coherence = (actor as any).anchor_coherence_status || 'unknown';
      const approvedVersionId = (actor as any).approved_version_id;
      if (coverage !== 'complete') {
        allComplete = false;
        // Determine missing anchors from assets
        const versions = (actor as any).ai_actor_versions || [];
        const approvedVersion = approvedVersionId ? versions.find((v: any) => v.id === approvedVersionId) : null;
        const assets = (approvedVersion?.ai_actor_assets || []) as Array<{ asset_type: string }>;
        const assetTypes = new Set(assets.map(a => a.asset_type));
        const missing: string[] = [];
        if (!assetTypes.has('reference_headshot')) missing.push('headshot');
        if (!assetTypes.has('reference_profile')) missing.push('profile');
        if (!assetTypes.has('reference_full_body')) missing.push('full body');
        incomplete.push({ name: p.name, actorId: p.binding!.ai_actor_id, versionId: approvedVersionId || '', coverage, coherence, missing });
      }
      if (coherence !== 'coherent' && coherence !== 'unknown') {
        allCoherent = false;
      }
    }
    return { allComplete, allCoherent, incomplete };
  }, [pipeline, actors, allLocked]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['casting-candidates', projectId] });
    qc.invalidateQueries({ queryKey: ['project-ai-cast', projectId] });
    qc.invalidateQueries({ queryKey: ['ai-actors'] });
  };

  // ── Strengthen actor dataset (generate missing profile) ──
  const [strengtheningActors, setStrengtheningActors] = useState<Set<string>>(new Set());
  const strengthenMutation = useMutation({
    mutationFn: async ({ actorId, versionId, characterName }: { actorId: string; versionId: string; characterName: string }) => {
      setStrengtheningActors(prev => new Set([...prev, actorId]));
      // 1. Generate missing profile via edge function
      const result = await aiCastApi.generateProfile(actorId, versionId);
      if (result.error) throw new Error(result.error);

      // 2. Recompute coverage + coherence using canonical actor-level evaluation
      const { evaluateAnchorCoverage, evaluateAnchorCoherence } = await import('@/lib/aiCast/anchorValidation');
      const coverage = await evaluateAnchorCoverage(actorId);
      let coherenceStatus: string = 'unknown';
      if (coverage.coverageStatus !== 'insufficient') {
        const coherenceResult = await evaluateAnchorCoherence(actorId, coverage);
        coherenceStatus = coherenceResult.coherenceStatus;
      }
      await persistAnchorStatus(actorId, coverage.coverageStatus as any, coherenceStatus as any);

      return { actorId, characterName, coverage: coverage.coverageStatus, coherence: coherenceStatus };
    },
    onSuccess: (result) => {
      setStrengtheningActors(prev => { const n = new Set(prev); n.delete(result.actorId); return n; });
      if (result.coverage === 'complete') {
        toast.success(`${result.characterName} — actor dataset complete`);
      } else {
        toast.info(`${result.characterName} — profile generated (coverage: ${result.coverage})`);
      }
      invalidate();
    },
    onError: (e: Error, vars) => {
      setStrengtheningActors(prev => { const n = new Set(prev); n.delete(vars.actorId); return n; });
      toast.error(`Dataset completion failed: ${e.message}`);
    },
  });

  const handleGenerateCast = useCallback(async (charFilter?: string, explorationMode = false) => {
    if (!projectId || !user?.id) return;
    const targets = charFilter ? [charFilter] : pipeline.filter(p => p.state === 'uncast' || p.state === 'failed').map(p => p.name);
    if (targets.length === 0) {
      toast.info('All characters already have casting options');
      return;
    }

    setIsGenerating(true);
    setJustCompleted(new Set());
    setGeneratingChars(prev => new Set([...prev, ...targets]));
    setFailedChars(prev => {
      const next = { ...prev };
      for (const target of targets) delete next[target];
      return next;
    });

    const completed: string[] = [];
    const failed: Array<{ character: string; error: string }> = [];

    try {
      await runWithConcurrency(targets, GENERATION_CONCURRENCY, async (characterName) => {
        try {
          const body: Record<string, any> = { projectId, candidatesPerCharacter: CANDIDATES_PER_CHARACTER, characterFilter: characterName };
          if (charNotes[characterName]) body.notes = charNotes[characterName];
          const ref = charRefinements[characterName];
          if (ref && hasActiveRefinements(ref)) body.refinements = refinementToEdgePayload(ref);
          if (explorationMode) body.explorationMode = true;

          const { data, error } = await supabase.functions.invoke('generate-casting-candidates', { body });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          completed.push(characterName);
        } catch (e: any) {
          failed.push({ character: characterName, error: e.message || 'Generation failed' });
          setFailedChars(prev => ({ ...prev, [characterName]: e.message || 'Generation failed' }));
        } finally {
          setGeneratingChars(prev => {
            const next = new Set(prev);
            next.delete(characterName);
            return next;
          });
          invalidate();
        }
      });

      if (completed.length > 0) {
        toast.success(`${completed.length} character${completed.length !== 1 ? 's' : ''} generated — review below`);
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} character${failed.length !== 1 ? 's' : ''} failed — retry per row`);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [projectId, user?.id, pipeline, charNotes, charRefinements]);

  // ── Show More Options (exploration per character) ──
  const handleShowMore = useCallback(async (characterName: string) => {
    if (!projectId || !user?.id) return;
    setGeneratingChars(prev => new Set([...prev, characterName]));
    try {
      const body: Record<string, any> = {
        projectId, candidatesPerCharacter: CANDIDATES_PER_CHARACTER,
        characterFilter: characterName, explorationMode: true,
      };
      if (charNotes[characterName]) body.notes = charNotes[characterName];
      const ref = charRefinements[characterName];
      if (ref && hasActiveRefinements(ref)) body.refinements = refinementToEdgePayload(ref);
      const { data, error } = await supabase.functions.invoke('generate-casting-candidates', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`More options for ${characterName}`);
    } catch (e: any) {
      toast.error(`Show More failed: ${e.message}`);
    } finally {
      setGeneratingChars(prev => { const n = new Set(prev); n.delete(characterName); return n; });
      invalidate();
    }
  }, [projectId, user?.id, charNotes, charRefinements]);

  // ── Pass / Reject a candidate ──
  const rejectMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await (supabase as any)
        .from('casting_candidates')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', candidateId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(`Pass failed: ${e.message}`),
  });

  // ── Shortlist a candidate ──
  const shortlistMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await (supabase as any)
        .from('casting_candidates')
        .update({ status: 'shortlisted', updated_at: new Date().toISOString() })
        .eq('id', candidateId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Candidate shortlisted'); },
    onError: (e: Error) => toast.error(`Shortlist failed: ${e.message}`),
  });

  const approveMutation = useMutation({
    mutationFn: async (candidate: CastingCandidate) => {
      const actorResult = await aiCastApi.createActor({
        name: candidate.display_name || candidate.character_key,
        description: `Cast for ${candidate.character_key}`,
        tags: ['casting-pipeline', candidate.character_key],
      });
      const actorId = actorResult.actor?.id;
      const versionId = actorResult.version?.id;

      if (!actorId) throw new Error('Actor creation failed');
      if (!versionId) throw new Error('Version id missing after actor creation');

      const actorCheck = await aiCastApi.getActor(actorId);
      const createdVersion = actorCheck?.actor?.ai_actor_versions?.find((v: any) => v.id === versionId);
      if (!createdVersion) throw new Error('Version not linked to actor');

      if (candidate.headshot_url) {
        await aiCastApi.addAsset(versionId, {
          asset_type: 'reference_headshot',
          public_url: candidate.headshot_url,
          meta_json: { shot_type: 'headshot', source: 'casting_pipeline' },
        });
      }
      if (candidate.full_body_url) {
        await aiCastApi.addAsset(versionId, {
          asset_type: 'reference_full_body',
          public_url: candidate.full_body_url,
          meta_json: { shot_type: 'full_body', source: 'casting_pipeline' },
        });
      }
      for (const ref of candidate.additional_refs || []) {
        await aiCastApi.addAsset(versionId, {
          asset_type: 'reference_image',
          public_url: ref,
          meta_json: { source: 'casting_pipeline' },
        });
      }

      await aiCastApi.approveVersion(actorId, versionId);

      const pkg: CandidateAnchorPackage = {
        headshot_url: candidate.headshot_url,
        full_body_url: candidate.full_body_url,
        additional_refs: candidate.additional_refs || [],
      };
      const precheck = await runCandidateAnchorPrecheck(pkg);
      await persistAnchorStatus(actorId, precheck.coverageStatus, precheck.coherenceStatus);

      await bindActorToProjectCharacter({
        projectId: projectId!,
        characterKey: candidate.character_key,
        actorId,
        actorVersionId: versionId,
      });

      await (supabase as any)
        .from('casting_candidates')
        .update({
          status: 'promoted',
          promoted_actor_id: actorId,
          promoted_at: new Date().toISOString(),
        })
        .eq('id', candidate.id);

      return { actorId, characterKey: candidate.character_key };
    },
    onSuccess: (result) => {
      toast.success(`${result.characterKey} — cast locked`);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Approve & Lock failed: ${e.message}`),
  });

  // ── Lock all approved ──
  const lockAllMutation = useMutation({
    mutationFn: async () => {
      const tolock = pipeline.filter(p => p.state === 'approved' && p.promotedCandidate?.promoted_actor_id);
      let locked = 0;
      for (const p of tolock) {
        const actorId = p.promotedCandidate!.promoted_actor_id!;
        try {
          await bindActorToProjectCharacter({ projectId: projectId!, characterKey: p.name, actorId }, actors);
          locked++;
        } catch { /* skip */ }
      }
      return locked;
    },
    onSuccess: (count) => {
      if (count > 0) { toast.success(`${count} character${count !== 1 ? 's' : ''} locked`); invalidate(); }
      else toast.info('No characters ready to lock');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Unlock a locked character (reverse bind) ──
  const unlockMutation = useMutation({
    mutationFn: async (characterKey: string) => {
      const normKey = normalizeCharacterKey(characterKey);
      console.log('[CastUnlock] Starting unlock for:', normKey);

      // Use canonical rebind RPC with unbind semantics (p_next_actor_id = NULL)
      const { data: rpcResult, error: rpcError } = await (supabase as any)
        .rpc('rebind_project_ai_cast', {
          p_project_id: projectId!,
          p_character_key: normKey,
          p_next_actor_id: null,
          p_reason: 'User unlocked cast for re-casting',
          p_changed_by: user?.id || null,
        });

      if (rpcError) throw new Error(`Unlock RPC failed: ${rpcError.message}`);
      console.log('[CastUnlock] RPC result:', rpcResult);

      // Revert promoted candidates to generated so the lane reopens
      const { error: revertError } = await (supabase as any)
        .from('casting_candidates')
        .update({ status: 'generated', updated_at: new Date().toISOString() })
        .eq('project_id', projectId!)
        .eq('character_key', normKey)
        .eq('status', 'promoted');
      if (revertError) console.warn('[CastUnlock] Candidate revert warning:', revertError.message);

      // Force-refetch canonical binding query (staleTime: 0 ensures fresh network hit)
      await qc.resetQueries({ queryKey: ['project-ai-cast', projectId] });
      await qc.resetQueries({ queryKey: ['casting-candidates', projectId] });
      qc.invalidateQueries({ queryKey: ['ai-actors'] });

      // Refetch and verify the binding is actually gone — bypass cache entirely
      const { data: freshMappings, error: fetchErr } = await (supabase as any)
        .from('project_ai_cast')
        .select('*')
        .eq('project_id', projectId!);

      if (fetchErr) {
        console.error('[CastUnlock] Post-unlock fetch failed:', fetchErr.message);
        throw new Error(`Post-unlock verification failed: ${fetchErr.message}`);
      }

      const stillLocked = (freshMappings || []).some(
        (m: CastMapping) => normalizeCharacterKey(m.character_key) === normKey,
      );

      if (stillLocked) {
        console.error('[CastUnlock] Post-unlock assertion FAILED: binding still exists for', normKey);
        throw new Error('Unlock did not clear canonical lock state — binding still exists');
      }

      // Now update the query cache with verified fresh data so pipeline recomputes
      qc.setQueryData(['project-ai-cast', projectId], freshMappings || []);

      console.log('[CastUnlock] Post-unlock verified: no binding for', normKey);
      return characterKey;
    },
    onSuccess: (characterKey) => {
      toast.success(`${characterKey} — cast unlocked`);
      setJustUnlocked(prev => new Set([...prev, characterKey]));
      // Auto-clear justUnlocked after extended period (user has time to interact)
      setTimeout(() => setJustUnlocked(prev => {
        const next = new Set(prev);
        next.delete(characterKey);
        return next;
      }), 30000);
    },
    onError: (e: Error) => toast.error(`Unlock failed: ${e.message}`),
  });

  const isLoading = candidatesLoading;

  const navigate = useNavigate();

  // ── Primary CTA logic ──
  const datasetsReady = allLocked && datasetStrength.allComplete && datasetStrength.allCoherent;
  const primaryCTA = useMemo(() => {
    if (pipeline.length === 0) return null;
    if (allLocked && datasetsReady && visualsComplete) return { label: 'Start Production Design', action: 'production_design' as const, icon: Palette };
    if (allLocked && datasetsReady && !visualsComplete) return { label: 'Build Character Visuals', action: 'visuals' as const, icon: Shirt };
    if (allLocked && !datasetsReady) return { label: 'Complete Actor Datasets', action: 'strengthen' as const, icon: ShieldCheck };
    if (castingComplete) return { label: 'Lock Cast', action: 'lock' as const, icon: Lock };
    if (summary.uncast > 0) return { label: `Generate Cast (${summary.uncast})`, action: 'generate' as const, icon: Sparkles };
    if (summary.options_ready > 0) return { label: 'Review Options Below', action: 'review' as const, icon: Eye };
    return null;
  }, [pipeline, allLocked, datasetsReady, visualsComplete, castingComplete, summary]);

  const handlePrimaryCTA = () => {
    if (!primaryCTA) return;
    switch (primaryCTA.action) {
      case 'generate': handleGenerateCast(); break;
      case 'lock': lockAllMutation.mutate(); break;
      case 'production_design': navigate(`/projects/${projectId}/production-design`); break;
      case 'visuals': setShowCharacterVisuals(true); break;
      case 'strengthen': {
        for (const inc of datasetStrength.incomplete) {
          if (inc.versionId && !strengtheningActors.has(inc.actorId)) {
            strengthenMutation.mutate({ actorId: inc.actorId, versionId: inc.versionId, characterName: inc.name });
          }
        }
        break;
      }
      case 'review': break;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Pipeline Header ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-primary" />
              Cast Your Production
            </h1>
            <p className="text-xs text-muted-foreground">
              Generate → Review → Approve → Lock → Character Visuals
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-Cast button */}
            {projectId && characters.length > 0 && !allLocked && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowAutoCast(true)}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Auto-Cast
              </Button>
            )}

            {primaryCTA && primaryCTA.action !== 'review' && (
              <Button
                onClick={handlePrimaryCTA}
                disabled={isGenerating || lockAllMutation.isPending || (primaryCTA.action === 'strengthen' && (strengthenMutation.isPending || strengtheningActors.size > 0))}
                className="gap-2"
                size="sm"
              >
                {(isGenerating || lockAllMutation.isPending || (primaryCTA.action === 'strengthen' && strengtheningActors.size > 0))
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <primaryCTA.icon className="h-4 w-4" />
                }
                {primaryCTA.label}
              </Button>
            )}
          </div>
        </div>

        {/* ── Progress Summary ── */}
        {pipeline.length > 0 && (
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            {summary.locked > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <Lock className="h-3 w-3" /> {summary.locked} locked
              </span>
            )}
            {summary.approved > 0 && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="h-3 w-3" /> {summary.approved} approved
              </span>
            )}
            {summary.options_ready > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <Star className="h-3 w-3" /> {summary.options_ready} ready for review
              </span>
            )}
            {summary.uncast > 0 && !isGenerating && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" /> {summary.uncast} uncast
              </span>
            )}
            {/* Real generation count */}
            {generationProgress && (
              <span className="flex items-center gap-1 text-primary">
                <ImageIcon className="h-3 w-3" />
                {generationProgress.generated} / {generationProgress.expected} options generated
              </span>
            )}
          </div>
        )}

        {/* Progress bar — real during generation */}
        {pipeline.length > 0 && (
          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{
                width: isGenerating && generationProgress
                  ? `${(generationProgress.generated / generationProgress.expected) * 100}%`
                  : `${((summary.locked + summary.approved) / pipeline.length) * 100}%`
              }}
            />
          </div>
        )}
      </div>

      {/* ── Character Pipeline List ── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pipeline.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/30" />
          <h3 className="text-sm font-medium text-foreground">No characters detected</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Add characters to your project canon to start casting.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pipeline.map(charState => {
            const incompleteInfo = datasetStrength.incomplete.find(i => i.name === charState.name);
            return (
              <CharacterPipelineRow
                key={charState.name}
                charState={charState}
                projectId={projectId!}
                onGenerate={() => handleGenerateCast(charState.name)}
                onShowMore={() => handleShowMore(charState.name)}
                onApprove={(cand) => approveMutation.mutate(cand)}
                onReject={(id) => rejectMutation.mutate(id)}
                onShortlist={(id) => shortlistMutation.mutate(id)}
                isApproving={approveMutation.isPending}
                isGenerating={isGenerating || generatingChars.has(charState.name)}
                expectedCount={CANDIDATES_PER_CHARACTER}
                justCompleted={justCompleted.has(charState.name)}
                justUnlocked={justUnlocked.has(charState.name)}
                actors={actors}
                datasetIncomplete={incompleteInfo || null}
                onStrengthen={incompleteInfo ? () => strengthenMutation.mutate({ actorId: incompleteInfo.actorId, versionId: incompleteInfo.versionId, characterName: incompleteInfo.name }) : undefined}
                isStrengthening={incompleteInfo ? strengtheningActors.has(incompleteInfo.actorId) : false}
                notes={charNotes[charState.name] || ''}
                onNotesChange={(val) => setCharNotes(prev => ({ ...prev, [charState.name]: val }))}
                refinements={charRefinements[charState.name] || EMPTY_REFINEMENT}
                onRefinementsChange={(val) => setCharRefinements(prev => ({ ...prev, [charState.name]: val }))}
                onUnlock={() => unlockMutation.mutate(charState.name)}
                isUnlocking={unlockMutation.isPending}
              />
            );
          })}
        </div>
      )}

      {/* ── Cast Locked — character visuals gate ── */}
      {pipeline.length > 0 && allLocked && (
        <div className="space-y-4">
          {/* Dataset status */}
          {!datasetsReady && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Cast Locked</span>
                  <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30">Datasets Incomplete</Badge>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    for (const inc of datasetStrength.incomplete) {
                      if (inc.versionId && !strengtheningActors.has(inc.actorId)) {
                        strengthenMutation.mutate({ actorId: inc.actorId, versionId: inc.versionId, characterName: inc.name });
                      }
                    }
                  }}
                  disabled={strengthenMutation.isPending || strengtheningActors.size > 0}
                >
                  {(strengthenMutation.isPending || strengtheningActors.size > 0)
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ShieldCheck className="h-3.5 w-3.5" />
                  }
                  Complete Actor Datasets
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your cast is locked, but actor datasets must be completed before character visuals.
              </p>
              {datasetStrength.incomplete.length > 0 && (
                <div className="space-y-1.5">
                  {datasetStrength.incomplete.map((inc) => (
                    <div key={inc.actorId} className="flex items-center justify-between text-[11px] bg-muted/10 rounded-md px-2.5 py-1.5 border border-border/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                        <span className="text-foreground font-medium truncate">{inc.name}</span>
                        <span className="text-muted-foreground">Missing: {inc.missing.join(', ')}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] gap-1 shrink-0"
                        onClick={() => strengthenMutation.mutate({ actorId: inc.actorId, versionId: inc.versionId, characterName: inc.name })}
                        disabled={strengthenMutation.isPending || strengtheningActors.has(inc.actorId)}
                      >
                        {strengtheningActors.has(inc.actorId)
                          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          : <Sparkles className="h-2.5 w-2.5" />
                        }
                        Generate
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Character Visuals section — shown when datasets ready */}
          {datasetsReady && (
            <div className={cn(
              'rounded-lg border p-4 space-y-3',
              visualsComplete
                ? 'border-primary/40 bg-primary/5'
                : 'border-amber-500/40 bg-amber-500/5'
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shirt className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Character Visuals</span>
                  {visualsComplete ? (
                    <Badge className="text-[9px] bg-primary/15 text-primary border-primary/30">
                      <Lock className="h-2.5 w-2.5 mr-0.5" />Complete
                    </Badge>
                  ) : (
                    <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Incomplete
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!visualsComplete && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => setShowCharacterVisuals(!showCharacterVisuals)}
                    >
                      <Shirt className="h-3.5 w-3.5" />
                      {showCharacterVisuals ? 'Hide' : 'Build Character Visuals'}
                    </Button>
                  )}
                  {visualsComplete && (
                    <Button size="sm" className="gap-1.5 text-xs" onClick={() => navigate(`/projects/${projectId}/production-design`)}>
                      <Palette className="h-3.5 w-3.5" /> Start Production Design
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {visualsComplete ? (
                <p className="text-xs text-muted-foreground">
                  All character wardrobe states are locked. Continue to Production Design.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Character visuals must be complete before Production Design. Generate, review, and lock costume looks for each wardrobe state.
                </p>
              )}

              {/* Coverage summary bar — lock-gap-driven */}
              {!visualsComplete && costumeOnActor.globalLockGapSummary.total > 0 && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                  <span>{costumeOnActor.globalLockGapSummary.locked}/{costumeOnActor.globalLockGapSummary.total} characters locked</span>
                  {costumeOnActor.globalLockGapSummary.needs_completion > 0 && (
                    <span>{costumeOnActor.globalLockGapSummary.needs_completion} needs completion</span>
                  )}
                  {costumeOnActor.globalLockGapSummary.needs_required > 0 && (
                    <span>{costumeOnActor.globalLockGapSummary.needs_required} needs required</span>
                  )}
                  {costumeOnActor.globalLockGapSummary.blocked > 0 && (
                    <span>{costumeOnActor.globalLockGapSummary.blocked} blocked</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Embedded CostumeOnActorPanel */}
          {datasetsReady && (showCharacterVisuals || visualsComplete) && (
            <CostumeOnActorPanel projectId={projectId} />
          )}
        </div>
      )}

      {/* ── Casting Progress (when no characters locked yet and not generating) ── */}
      {pipeline.length > 0 && summary.locked === 0 && !isGenerating && (
        <div className="rounded-lg border border-border/40 bg-card/30 p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            0 / {pipeline.length} characters locked
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            Generate and approve your cast to lock the production
          </p>
        </div>
      )}

      {/* ── Partial lock progress ── */}
      {pipeline.length > 0 && summary.locked > 0 && !allLocked && (
        <div className="rounded-lg border border-border/40 bg-card/30 p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {summary.locked} / {pipeline.length} characters locked
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            Lock all characters to proceed to Production Design
          </p>
        </div>
      )}

      {/* ── Advanced Tools ── */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground w-full justify-start">
            <Settings2 className="h-3.5 w-3.5" />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Casting Tools
            {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border/30 bg-card/20">
            <Link to="/ai-cast">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Crown className="h-3.5 w-3.5" /> AI Actors Agency
              </Button>
            </Link>
            <Link to="/ai-cast/actors">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Users className="h-3.5 w-3.5" /> Actor Library
              </Button>
            </Link>
            {projectId && (
              <>
                <Link to={`/projects/${projectId}/casting`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" /> Cast Bindings & Health
                  </Button>
                </Link>
                <Link to={`/projects/${projectId}/casting-studio`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Casting Studio
                  </Button>
                </Link>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Auto-Cast Modal */}
      {projectId && (
        <AutoCastModal
          open={showAutoCast}
          onOpenChange={setShowAutoCast}
          projectId={projectId}
          characters={characters}
          onComplete={() => { setShowAutoCast(false); invalidate(); }}
        />
      )}
    </div>
  );
}

// ── Character Pipeline Row ──────────────────────────────────────────────────

function CharacterPipelineRow({
  charState,
  projectId,
  onGenerate,
  onShowMore,
  onApprove,
  onReject,
  onShortlist,
  isApproving,
  isGenerating,
  expectedCount,
  justCompleted,
  justUnlocked,
  actors,
  datasetIncomplete,
  onStrengthen,
  isStrengthening,
  notes,
  onNotesChange,
  refinements,
  onRefinementsChange,
  onUnlock,
  isUnlocking,
}: {
  charState: CharacterPipelineState;
  projectId: string;
  onGenerate: () => void;
  onShowMore: () => void;
  onApprove: (cand: CastingCandidate) => void;
  onReject: (id: string) => void;
  onShortlist: (id: string) => void;
  isApproving: boolean;
  isGenerating: boolean;
  expectedCount: number;
  justCompleted: boolean;
  justUnlocked: boolean;
  actors: any[];
  datasetIncomplete: { name: string; actorId: string; versionId: string; coverage: string; coherence: string; missing: string[] } | null;
  onStrengthen?: () => void;
  isStrengthening: boolean;
  notes: string;
  onNotesChange: (val: string) => void;
  refinements: RefinementState;
  onRefinementsChange: (val: RefinementState) => void;
  onUnlock: () => void;
  isUnlocking: boolean;
}) {
  const { name, state, candidates, binding, promotedCandidate } = charState;
  const cfg = STATE_CONFIG[state];
  const activeCandidates = candidates.filter(c => c.status !== 'rejected');
  const rejectedCount = candidates.filter(c => c.status === 'rejected').length;
  const shortlistedCount = candidates.filter(c => c.status === 'shortlisted').length;
  const generatedCount = activeCandidates.length;
  const hasNotes = !!notes.trim();
  const hasRefinementsActive = hasActiveRefinements(refinements);
  
  const [expanded, setExpanded] = useState(state === 'options_ready');
  const [showNotes, setShowNotes] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  
  useEffect(() => {
    if (state === 'options_ready' || justCompleted || state === 'failed') {
      setExpanded(true);
    }
  }, [state, justCompleted]);

  // Auto-expand after unlock — character returns to active casting
  useEffect(() => {
    if (justUnlocked && state !== 'locked') {
      setExpanded(true);
    }
  }, [justUnlocked, state]);

  useEffect(() => {
    if (state === 'generating' && generatedCount > 0) {
      setExpanded(true);
    }
  }, [state, generatedCount]);

  const boundActor = binding ? actors.find((a: any) => a.id === binding.ai_actor_id) : null;

  // Status line for generating state
  const statusLine = useMemo(() => {
    if (state === 'generating') {
      if (generatedCount >= expectedCount) return `${expectedCount} options ready — review below`;
      return `Generating ${generatedCount} / ${expectedCount} options`;
    }
    if (state === 'options_ready') return `${generatedCount} option${generatedCount !== 1 ? 's' : ''} ready — review below`;
    return null;
  }, [state, generatedCount, expectedCount]);

  // Build placeholder slots for generating state
  const placeholderSlots = useMemo(() => {
    if (state !== 'generating') return [];
    const remaining = Math.max(0, expectedCount - generatedCount);
    return Array.from({ length: remaining }, (_, i) => i);
  }, [state, generatedCount, expectedCount]);

  return (
    <>
    <div className={cn(
      'rounded-lg border transition-all',
      state === 'locked' ? 'border-primary/30 bg-primary/5' :
      state === 'approved' ? 'border-emerald-500/20 bg-emerald-500/5' :
      state === 'options_ready' ? 'border-amber-500/20 bg-amber-500/5' :
      state === 'generating' ? 'border-primary/20 bg-primary/5' :
      'border-border/40 bg-card/30'
    )}>
      {/* Row Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {state === 'locked' && binding ? (
            <LockedActorThumb actor={boundActor} />
          ) : promotedCandidate?.headshot_url ? (
            <img src={promotedCandidate.headshot_url} alt="" className="h-8 w-8 rounded-md object-cover border border-border/30" />
          ) : generatedCount > 0 && activeCandidates[0]?.headshot_url ? (
            <img src={activeCandidates[0].headshot_url} alt="" className="h-8 w-8 rounded-md object-cover border border-border/30" />
          ) : (
            <div className="h-8 w-8 rounded-md bg-muted/20 border border-border/30 flex items-center justify-center">
              <Users className="h-3.5 w-3.5 text-muted-foreground/40" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{name}</p>
            {state === 'locked' && boundActor && (
              <p className="text-[10px] text-muted-foreground truncate">{boundActor.name}</p>
            )}
            {/* Real-time status line */}
            {statusLine && (
              <p className={cn(
                'text-[10px]',
                state === 'generating' ? 'text-primary' : 'text-amber-400'
              )}>
                {statusLine}
              </p>
            )}
          </div>
        </div>

        {/* Active state badges */}
        <div className="flex items-center gap-1 shrink-0">
          {hasNotes && <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/50"><MessageSquare className="h-2.5 w-2.5 mr-0.5" />Notes</Badge>}
          {hasRefinementsActive && <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/50"><SlidersHorizontal className="h-2.5 w-2.5 mr-0.5" />Refined</Badge>}
          {shortlistedCount > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-500/50 text-amber-400"><Star className="h-2.5 w-2.5 mr-0.5" />{shortlistedCount}</Badge>}
          {rejectedCount > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/50 text-muted-foreground"><ThumbsDown className="h-2.5 w-2.5 mr-0.5" />{rejectedCount}</Badge>}
        </div>

        {state === 'locked' ? (
          <Badge
            className={cn('text-[10px] shrink-0 cursor-pointer hover:opacity-80 transition-opacity', cfg.className)}
            onClick={(e) => { e.stopPropagation(); setShowUnlockConfirm(true); }}
          >
            {isUnlocking ? <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" /> : <Lock className="h-2.5 w-2.5 mr-1" />}
            {cfg.label}
          </Badge>
        ) : (
          <Badge className={cn('text-[10px] shrink-0', cfg.className)}>
            {state === 'generating' && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
            {state === 'generating' ? `${generatedCount}/${expectedCount}` : cfg.label}
          </Badge>
        )}

        {/* Action shortcut */}
        <div className="shrink-0">
          {state === 'uncast' && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); onGenerate(); }} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Generate
            </Button>
          )}
          {state === 'failed' && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); onGenerate(); }} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Retry
            </Button>
          )}
        </div>

        {(activeCandidates.length > 0 || state === 'generating') && (
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', !expanded && '-rotate-90')} />
        )}
      </div>

      {/* ── Lane Controls Toolbar (visible when expanded and not locked; also shown for approved+justUnlocked) ── */}
      {expanded && state !== 'locked' && (state !== 'approved' || justUnlocked) && (
        <div className="px-3 pb-2 flex flex-wrap items-center gap-1.5 border-t border-border/20 pt-2">
          <Button
            size="sm" variant="outline"
            className="h-6 text-[10px] gap-1"
            onClick={(e) => { e.stopPropagation(); setShowBrief(!showBrief); }}
          >
            <BookOpen className="h-2.5 w-2.5" />
            {showBrief ? 'Hide Brief' : 'Character Brief'}
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-6 text-[10px] gap-1"
            onClick={(e) => { e.stopPropagation(); setShowNotes(!showNotes); }}
          >
            <MessageSquare className="h-2.5 w-2.5" />
            {showNotes ? 'Hide Notes' : 'Add Notes'}
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-6 text-[10px] gap-1"
            onClick={(e) => { e.stopPropagation(); setShowAssistant(true); }}
          >
            <SlidersHorizontal className="h-2.5 w-2.5" />
            Casting Assistant
          </Button>
          {(state === 'options_ready' || generatedCount > 0) && (
            <Button
              size="sm" variant="outline"
              className="h-6 text-[10px] gap-1"
              onClick={(e) => { e.stopPropagation(); onShowMore(); }}
              disabled={isGenerating}
            >
              {isGenerating ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
              Show More Options
            </Button>
          )}
        </div>
      )}

      {/* ── Character Brief (inline collapsible) ── */}
      {expanded && showBrief && (
        <div className="px-3 pb-2">
          <CharacterBrief projectId={projectId} characterKey={name} defaultOpen />
        </div>
      )}

      {/* ── Notes (inline) ── */}
      {expanded && showNotes && (() => {
        const noteInterp = interpretCastingNotes(notes);
        const hasDetections = noteInterp.normalizedSummary.length > 0;
        return (
          <div className="px-3 pb-2 space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">Casting Notes</label>
            <Textarea
              placeholder='e.g. "extremely beautiful chinese 20-25 female" or "looks like Tom Hardy, rugged, working-class"'
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="min-h-[60px] text-xs"
            />
            {hasDetections && (
              <div className="space-y-1">
                <p className="text-[9px] text-muted-foreground font-medium">Detected constraints & preferences:</p>
                <div className="flex flex-wrap gap-1">
                  {noteInterp.hardConstraints.gender && (
                    <Badge className="text-[8px] h-4 px-1.5 bg-destructive/15 text-destructive border-destructive/30">
                      {noteInterp.hardConstraints.gender}
                    </Badge>
                  )}
                  {noteInterp.hardConstraints.ageMin != null && noteInterp.hardConstraints.ageMax != null && (
                    <Badge className="text-[8px] h-4 px-1.5 bg-destructive/15 text-destructive border-destructive/30">
                      {noteInterp.hardConstraints.ageMin}–{noteInterp.hardConstraints.ageMax}
                    </Badge>
                  )}
                  {noteInterp.hardConstraints.ethnicity?.map(e => (
                    <Badge key={e} className="text-[8px] h-4 px-1.5 bg-destructive/15 text-destructive border-destructive/30">
                      {e}
                    </Badge>
                  ))}
                  {noteInterp.softPreferences.attractiveness && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">{noteInterp.softPreferences.attractiveness}</Badge>
                  )}
                  {noteInterp.softPreferences.build && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">{noteInterp.softPreferences.build}</Badge>
                  )}
                  {noteInterp.softPreferences.vibe?.map(v => (
                    <Badge key={v} variant="outline" className="text-[8px] h-4 px-1.5">{v}</Badge>
                  ))}
                  {noteInterp.likeness.references.map((ref, i) => (
                    <Badge key={i} className="text-[8px] h-4 px-1.5 bg-primary/15 text-primary border-primary/30">
                      ≈ {ref.reference_people.join(' + ')} ({ref.reference_strength})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {hasNotes && hasDetections && (
              <p className="text-[9px] text-muted-foreground">
                <span className="text-destructive">Red</span> = enforced constraints · Outline = style preferences
              </p>
            )}
          </div>
        );
      })()}

      {/* Casting Assistant modal */}
      <CastingAssistant
        open={showAssistant}
        onOpenChange={setShowAssistant}
        characterName={name}
        state={refinements}
        onChange={onRefinementsChange}
        onApply={() => setShowAssistant(false)}
        freeTextNotes={notes}
        onFreeTextNotesChange={onNotesChange}
      />

      {/* Expanded: generating with partial results */}
      {expanded && state === 'generating' && (
        <div className="px-3 pb-3 pt-1 border-t border-border/20">
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {activeCandidates.map((cand, idx) => (
              <PipelineCandidateCard
                key={cand.id}
                candidate={cand}
                index={idx}
                onApprove={() => {}}
                onReject={() => {}}
                onShortlist={() => {}}
                isApproving={false}
                showApprove={false}
              />
            ))}
            {placeholderSlots.map((_, idx) => (
              <PlaceholderCandidateCard key={`ph-${idx}`} index={generatedCount + idx} />
            ))}
          </div>
          <div className="mt-2 h-1 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(generatedCount / expectedCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded: options ready for review */}
      {expanded && state === 'options_ready' && activeCandidates.length > 0 && (
        <div className="px-3 pb-3 pt-1 border-t border-border/20">
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {activeCandidates.map((cand, idx) => (
              <PipelineCandidateCard
                key={cand.id}
                candidate={cand}
                index={idx}
                onApprove={() => onApprove(cand)}
                onReject={() => onReject(cand.id)}
                onShortlist={() => onShortlist(cand.id)}
                isApproving={isApproving}
                showApprove={true}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <Eye className="h-3 w-3" /> Approve to lock · Pass to dismiss · ⭐ to shortlist
          </p>
        </div>
      )}

      {/* Expanded: failed state with retry */}
      {expanded && state === 'failed' && (
        <div className="px-3 pb-3 pt-1 border-t border-border/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-destructive/10 border border-destructive/30 flex items-center justify-center">
              <XCircle className="h-4 w-4 text-destructive" />
            </div>
            <div className="space-y-1 flex-1">
              <p className="text-xs font-medium text-destructive">Generation failed</p>
              <p className="text-[10px] text-muted-foreground">{charState.failureMessage || 'An error occurred during generation'}</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); onGenerate(); }} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Expanded: approved state */}
      {expanded && state === 'approved' && promotedCandidate && (
        <div className="px-3 pb-3 pt-1 border-t border-border/20 space-y-3">
          {/* Approved candidate summary */}
          <div className="flex items-center gap-3">
            {promotedCandidate.headshot_url && (
              <img src={promotedCandidate.headshot_url} alt="" className="h-16 w-16 rounded-lg object-cover border border-emerald-500/30" />
            )}
            <div className="space-y-1 flex-1">
              <p className="text-xs font-medium text-foreground">{promotedCandidate.display_name || name}</p>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> {justUnlocked ? 'Approved — casting reopened' : 'Approved — ready to lock'}
              </p>
            </div>
            {!justUnlocked && (
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 shrink-0" onClick={(e) => { e.stopPropagation(); onApprove(promotedCandidate); }}>
                <Lock className="h-3 w-3" /> Lock
              </Button>
            )}
          </div>

          {/* When just unlocked, show full candidate grid for re-casting */}
          {justUnlocked && activeCandidates.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                <Unlock className="h-3 w-3" /> Casting reopened — review, replace, or generate more options
              </p>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                {activeCandidates.map((cand, idx) => (
                  <PipelineCandidateCard
                    key={cand.id}
                    candidate={cand}
                    index={idx}
                    onApprove={() => onApprove(cand)}
                    onReject={() => onReject(cand.id)}
                    onShortlist={() => onShortlist(cand.id)}
                    isApproving={isApproving}
                    showApprove={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expanded: locked state — inspectable */}
      {expanded && state === 'locked' && (
        <div className="px-3 pb-3 pt-1 border-t border-border/20 space-y-3">
          <div className="flex items-center gap-3">
            <LockedActorThumb actor={boundActor} size="lg" />
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{boundActor?.name || name}</p>
              <p className="text-[10px] text-primary flex items-center gap-1">
                <Lock className="h-3 w-3" /> Locked into production
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] gap-1 shrink-0 hover:border-destructive/50 hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setShowUnlockConfirm(true); }}
              disabled={isUnlocking}
            >
              {isUnlocking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
              Unlock
            </Button>
          </div>

          {/* Actor details */}
          {boundActor && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] bg-muted/10 rounded-md p-2.5 border border-border/20">
              {binding?.ai_actor_version_id && (
                <div>
                  <span className="text-muted-foreground">Version</span>
                  <p className="text-foreground font-mono truncate">{binding.ai_actor_version_id.slice(0, 8)}</p>
                </div>
              )}
              {boundActor.anchor_coverage_status && boundActor.anchor_coverage_status !== 'unknown' && (
                <div>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Fingerprint className="h-2.5 w-2.5" /> Anchor Coverage
                  </span>
                  <p className={cn(
                    'font-medium',
                    boundActor.anchor_coverage_status === 'complete' ? 'text-emerald-400' :
                    boundActor.anchor_coverage_status === 'partial' ? 'text-amber-400' :
                    'text-muted-foreground'
                  )}>
                    {boundActor.anchor_coverage_status}
                  </p>
                </div>
              )}
              {boundActor.anchor_coherence_status && boundActor.anchor_coherence_status !== 'unknown' && (
                <div>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <ShieldAlert className="h-2.5 w-2.5" /> Coherence
                  </span>
                  <p className={cn(
                    'font-medium',
                    boundActor.anchor_coherence_status === 'coherent' ? 'text-emerald-400' :
                    boundActor.anchor_coherence_status === 'weak' ? 'text-amber-400' :
                    'text-muted-foreground'
                  )}>
                    {boundActor.anchor_coherence_status}
                  </p>
                </div>
              )}
              {boundActor.roster_ready !== undefined && (
                <div>
                  <span className="text-muted-foreground">Roster Ready</span>
                  <p className={boundActor.roster_ready ? 'text-emerald-400 font-medium' : 'text-muted-foreground'}>
                    {boundActor.roster_ready ? 'Yes' : 'No'}
                  </p>
                </div>
              )}
            </div>
          )}
          {/* Dataset strengthen CTA per character */}
          {datasetIncomplete && onStrengthen && (
            <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2 text-[11px]">
                <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="text-muted-foreground">Missing: {datasetIncomplete.missing.join(', ')}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1 shrink-0"
                onClick={(e) => { e.stopPropagation(); onStrengthen(); }}
                disabled={isStrengthening}
              >
                {isStrengthening ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                Complete Dataset
              </Button>
            </div>
          )}

          {/* Show locked actor assets */}
          <LockedActorAssets actor={boundActor} />
        </div>
      )}
    </div>

    <AlertDialog open={showUnlockConfirm} onOpenChange={setShowUnlockConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unlock cast selection?</AlertDialogTitle>
          <AlertDialogDescription>
            This will reopen casting for <strong>{name}</strong> and allow new options or replacement. The current actor selection will be unbound but candidate history is preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { onUnlock(); setShowUnlockConfirm(false); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Unlock
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── Placeholder Card (shimmer during generation) ────────────────────────────

function PlaceholderCandidateCard({ index }: { index: number }) {
  return (
    <div
      className="rounded-lg border border-border/30 overflow-hidden bg-card/20 cast-reveal"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="aspect-[3/4] bg-muted/10 relative overflow-hidden">
        <div className="absolute inset-0 cast-shimmer" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 text-muted-foreground/30 animate-spin" />
          <span className="text-[9px] text-muted-foreground/40">Generating…</span>
        </div>
      </div>
      <div className="p-2">
        <div className="h-3 w-16 rounded bg-muted/20 cast-shimmer" />
      </div>
    </div>
  );
}

// ── Pipeline Candidate Card ─────────────────────────────────────────────────

function PipelineCandidateCard({
  candidate,
  index,
  onApprove,
  onReject,
  onShortlist,
  isApproving,
  showApprove = true,
}: {
  candidate: CastingCandidate;
  index: number;
  onApprove: () => void;
  onReject: () => void;
  onShortlist: () => void;
  isApproving: boolean;
  showApprove?: boolean;
}) {
  const thumb = candidate.headshot_url || candidate.full_body_url;
  const [imgLoaded, setImgLoaded] = useState(false);
  const isShortlisted = candidate.status === 'shortlisted';

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden bg-card/30 hover:border-border/80 transition-all cast-reveal" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="aspect-[3/4] bg-muted/10 relative">
        {thumb ? (
          <img
            src={thumb}
            alt={candidate.display_name || ''}
            className={cn('w-full h-full object-cover transition-all duration-500', imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]')}
            onLoad={() => setImgLoaded(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Users className="h-6 w-6 text-muted-foreground/20" />
          </div>
        )}
        {!imgLoaded && thumb && (
          <div className="absolute inset-0 cast-shimmer rounded" />
        )}
        {isShortlisted && (
          <Badge className="absolute top-1.5 right-1.5 text-[9px] bg-amber-500/90 text-white">
            <Star className="h-2.5 w-2.5 mr-0.5" /> Shortlisted
          </Badge>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        <p className="text-[10px] text-muted-foreground truncate">
          {candidate.display_name || `Option ${index + 1}`}
        </p>
        {showApprove && (
          <div className="space-y-1">
            <Button
              size="sm"
              className="w-full h-7 text-[10px] gap-1"
              onClick={(e) => { e.stopPropagation(); onApprove(); }}
              disabled={isApproving}
            >
              {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Approve & Lock
            </Button>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 h-6 text-[9px] gap-0.5 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onReject(); }}
              >
                <ThumbsDown className="h-2.5 w-2.5" />
                Pass
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn('flex-1 h-6 text-[9px] gap-0.5', isShortlisted ? 'text-amber-400' : 'text-muted-foreground')}
                onClick={(e) => { e.stopPropagation(); onShortlist(); }}
              >
                <Star className={cn('h-2.5 w-2.5', isShortlisted && 'fill-current')} />
                {isShortlisted ? 'Listed' : 'Shortlist'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Locked Actor Thumbnail ──────────────────────────────────────────────────

function LockedActorThumb({ actor, size = 'sm' }: { actor: any; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'h-16 w-16' : 'h-8 w-8';
  if (!actor) {
    return (
      <div className={cn(dim, 'rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center')}>
        <Lock className="h-3 w-3 text-primary" />
      </div>
    );
  }

  const approvedVersionId = actor.approved_version_id;
  const versions = actor.ai_actor_versions || [];
  const approvedVersion = approvedVersionId
    ? versions.find((v: any) => v.id === approvedVersionId)
    : versions[0];
  const assets = approvedVersion?.ai_actor_assets || [];
  const thumb = assets.find((a: any) => a.asset_type === 'reference_headshot')?.public_url
    || assets.find((a: any) => a.public_url)?.public_url;

  if (thumb) {
    return <img src={thumb} alt={actor.name} className={cn(dim, 'rounded-md object-cover border border-primary/30')} />;
  }

  return (
    <div className={cn(dim, 'rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center')}>
      <Crown className="h-3 w-3 text-primary" />
    </div>
  );
}

// ── Locked Actor Assets Strip ───────────────────────────────────────────────

function LockedActorAssets({ actor }: { actor: any }) {
  if (!actor) return null;

  const approvedVersionId = actor.approved_version_id;
  const versions = actor.ai_actor_versions || [];
  const approvedVersion = approvedVersionId
    ? versions.find((v: any) => v.id === approvedVersionId)
    : null;
  const assets = (approvedVersion?.ai_actor_assets || []) as Array<{ asset_type: string; public_url: string }>;

  if (assets.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground font-medium">Reference Assets</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {assets.filter((a) => a.public_url).map((asset, i) => (
          <div key={i} className="shrink-0 space-y-0.5">
            <img
              src={asset.public_url}
              alt={asset.asset_type}
              className="h-20 w-16 rounded-md object-cover border border-border/30"
            />
            <p className="text-[9px] text-muted-foreground/60 truncate w-16 text-center">
              {asset.asset_type.replace(/_/g, ' ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
