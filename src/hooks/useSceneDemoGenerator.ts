/**
 * useSceneDemoGenerator — Hook for the Scene Demo Generation + Validation + Approval System.
 *
 * Manages the lifecycle of generating, validating, approving, and locking scene demo images.
 * Consumes useSceneDemoPlanner for plan data.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSceneDemoPlanner } from './useSceneDemoPlanner';
import type { SceneDemoPlan } from '@/lib/visual/sceneDemoPlanner';
import {
  validateSceneDemoSlot,
  validateSceneDemoRun,
  isSlotApprovable,
  checkRunLockEligibility,
  detectRunStaleness,
  type SceneDemoSlotValidation,
  type SceneDemoRunValidation,
  type SlotApprovalStatus,
  type SceneDemoRunStatus,
} from '@/lib/visual/sceneDemoValidation';
import { SCENE_DEMO_SLOTS } from '@/lib/visual/sceneDemoGenerator';

// ── Types ──

export interface SceneDemoRun {
  id: string;
  project_id: string;
  scene_id: string;
  plan_snapshot: SceneDemoPlan;
  status: string;
  slot_count: number;
  completed_count: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SceneDemoImage {
  id: string;
  run_id: string;
  slot_key: string;
  character_key: string | null;
  status: string;
  prompt_used: string | null;
  storage_path: string | null;
  public_url: string | null;
  error: string | null;
  generation_config: Record<string, unknown>;
  created_at: string;
  // Validation + approval fields
  approval_status: SlotApprovalStatus;
  validation_payload: SceneDemoSlotValidation | null;
}

// ── Hook ──

export function useSceneDemoGenerator(projectId: string | undefined) {
  const qc = useQueryClient();
  const planner = useSceneDemoPlanner(projectId);

  // Fetch current locked set IDs for drift detection
  const lockedSetsQuery = useQuery({
    queryKey: ['scene-demo-locked-ids', projectId],
    queryFn: async (): Promise<Set<string>> => {
      if (!projectId) return new Set();
      const { data, error } = await (supabase as any)
        .from('visual_sets')
        .select('id')
        .eq('project_id', projectId)
        .eq('status', 'locked');
      if (error) throw error;
      return new Set((data || []).map((r: any) => r.id));
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });

  const currentLockedSetIds = lockedSetsQuery.data || new Set<string>();

  // Fetch existing runs
  const runsQuery = useQuery({
    queryKey: ['scene-demo-runs', projectId],
    queryFn: async (): Promise<SceneDemoRun[]> => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('scene_demo_runs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        plan_snapshot: r.plan_snapshot || {},
      }));
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });

  // Fetch images for a run
  const fetchImagesForRun = useCallback(async (runId: string): Promise<SceneDemoImage[]> => {
    const { data, error } = await (supabase as any)
      .from('scene_demo_images')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((img: any) => ({
      ...img,
      approval_status: img.approval_status || 'pending',
      validation_payload: img.validation_payload || null,
    }));
  }, []);

  // Start generation for a ready plan
  const generateMutation = useMutation({
    mutationFn: async (plan: SceneDemoPlan) => {
      if (!projectId) throw new Error('No project');

      // IEL gate: plan must be ready
      if (plan.readiness_status !== 'ready') {
        throw new Error(`Plan is not ready (status: ${plan.readiness_status}). Blocking reasons: ${plan.blocking_reasons.join(', ')}`);
      }

      const { data: user } = await supabase.auth.getUser();
      const { data: run, error: runErr } = await (supabase as any)
        .from('scene_demo_runs')
        .insert({
          project_id: projectId,
          scene_id: plan.scene_id,
          plan_snapshot: plan,
          status: 'queued',
          slot_count: SCENE_DEMO_SLOTS.length,
          completed_count: 0,
          created_by: user?.user?.id || null,
        })
        .select()
        .single();
      if (runErr) throw runErr;

      const slots = SCENE_DEMO_SLOTS.map(s => s.key);
      const imageRows = slots.map(slotKey => ({
        run_id: run.id,
        project_id: projectId,
        slot_key: slotKey,
        character_key: plan.characters[0]?.character_key || null,
        status: 'queued',
        approval_status: 'pending',
        generation_config: {
          scene_purpose: plan.scene_purpose,
          character_keys: plan.characters.map((c: any) => c.character_key),
          actor_ids: plan.characters.map((c: any) => c.actor_id),
          costume_look_set_ids: plan.characters.map((c: any) => c.costume_look_set_id).filter(Boolean),
          location_set_id: plan.location_set_id,
          atmosphere_set_id: plan.atmosphere_set_id,
          world_mode: 'grounded',
        },
      }));
      const { error: imgErr } = await (supabase as any)
        .from('scene_demo_images')
        .insert(imageRows);
      if (imgErr) throw imgErr;

      // Invoke edge function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const resp = await fetch(`${supabaseUrl}/functions/v1/generate-scene-demo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          run_id: run.id,
          project_id: projectId,
          plan: plan,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        await (supabase as any)
          .from('scene_demo_runs')
          .update({ status: 'failed', error: errText.slice(0, 500) })
          .eq('id', run.id);
        throw new Error(`Generation failed: ${errText.slice(0, 200)}`);
      }

      return run;
    },
    onSuccess: () => {
      toast.success('Scene demo generation started');
      invalidateAll();
    },
    onError: (e: Error) => {
      toast.error(`Generation failed: ${e.message}`);
    },
  });

  // Validate a slot
  const validateSlot = useCallback((image: SceneDemoImage, plan: SceneDemoPlan): SceneDemoSlotValidation => {
    return validateSceneDemoSlot({
      slot_key: image.slot_key,
      prompt_used: image.prompt_used,
      generation_config: image.generation_config,
      plan,
      world_mode: (image.generation_config.world_mode as string) || 'grounded',
    });
  }, []);

  // Validate entire run
  const validateRun = useCallback((run: SceneDemoRun, images: SceneDemoImage[]): SceneDemoRunValidation => {
    const plan = run.plan_snapshot as SceneDemoPlan;
    const slotInputs = images.map(img => ({
      slot_key: img.slot_key,
      prompt_used: img.prompt_used,
      generation_config: img.generation_config,
      plan,
      world_mode: (img.generation_config.world_mode as string) || 'grounded',
    }));
    return validateSceneDemoRun({
      run_id: run.id,
      plan,
      slots: slotInputs,
      currentLockedSetIds,
      world_mode: 'grounded',
    });
  }, [currentLockedSetIds]);

  // Approve a single slot
  const approveSlotMutation = useMutation({
    mutationFn: async ({ imageId, plan }: { imageId: string; plan: SceneDemoPlan }) => {
      // Re-check drift before approve
      const drift = detectRunStaleness(plan, currentLockedSetIds);
      if (drift.stale) throw new Error(`Cannot approve: ${drift.reasons.join(', ')}`);

      const { error } = await (supabase as any)
        .from('scene_demo_images')
        .update({ approval_status: 'approved' })
        .eq('id', imageId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success('Slot approved'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reject a single slot
  const rejectSlotMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await (supabase as any)
        .from('scene_demo_images')
        .update({ approval_status: 'rejected' })
        .eq('id', imageId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success('Slot rejected'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Redo a single slot
  const redoSlotMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await (supabase as any)
        .from('scene_demo_images')
        .update({ approval_status: 'redo_requested', status: 'queued', public_url: null, storage_path: null, error: null })
        .eq('id', imageId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success('Redo requested'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Approve all safe slots in a run
  const approveAllSafeMutation = useMutation({
    mutationFn: async ({ runId, images, plan }: { runId: string; images: SceneDemoImage[]; plan: SceneDemoPlan }) => {
      const drift = detectRunStaleness(plan, currentLockedSetIds);
      if (drift.stale) throw new Error(`Cannot approve: upstream drift detected`);

      const safeIds: string[] = [];
      for (const img of images) {
        if (img.approval_status === 'pending' && img.status === 'done') {
          const validation = validateSlot(img, plan);
          if (isSlotApprovable(validation)) {
            safeIds.push(img.id);
          }
        }
      }

      if (safeIds.length === 0) throw new Error('No safe slots to approve');

      for (const id of safeIds) {
        const { error } = await (supabase as any)
          .from('scene_demo_images')
          .update({ approval_status: 'approved' })
          .eq('id', id);
        if (error) throw error;
      }

      // Check if we can auto-lock
      await tryAutoLock(runId, images, safeIds, plan);

      return { approved_count: safeIds.length };
    },
    onSuccess: (data) => {
      invalidateAll();
      toast.success(`Approved ${data.approved_count} slots`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Lock a run
  const lockRunMutation = useMutation({
    mutationFn: async ({ runId, plan }: { runId: string; plan: SceneDemoPlan }) => {
      // IEL: re-check drift
      const drift = detectRunStaleness(plan, currentLockedSetIds);
      if (drift.stale) throw new Error(`Cannot lock: ${drift.reasons.join(', ')}`);

      // Check all required slots approved
      const images = await fetchImagesForRun(runId);
      const requiredKeys = SCENE_DEMO_SLOTS.filter(s => s.required).map(s => s.key);
      const statuses: Record<string, SlotApprovalStatus> = {};
      for (const img of images) {
        statuses[img.slot_key] = img.approval_status;
      }
      const lockCheck = checkRunLockEligibility(statuses, requiredKeys);
      if (!lockCheck.eligible) {
        throw new Error(`Cannot lock: ${lockCheck.blocking_reasons.join(', ')}`);
      }

      const { error } = await (supabase as any)
        .from('scene_demo_runs')
        .update({ status: 'locked', completed_at: new Date().toISOString() })
        .eq('id', runId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success('Run locked'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-lock helper
  async function tryAutoLock(runId: string, existingImages: SceneDemoImage[], justApprovedIds: string[], plan: SceneDemoPlan) {
    const requiredKeys = SCENE_DEMO_SLOTS.filter(s => s.required).map(s => s.key);
    const statuses: Record<string, SlotApprovalStatus> = {};
    for (const img of existingImages) {
      statuses[img.slot_key] = justApprovedIds.includes(img.id) ? 'approved' : img.approval_status;
    }
    const lockCheck = checkRunLockEligibility(statuses, requiredKeys);
    if (lockCheck.eligible) {
      const drift = detectRunStaleness(plan, currentLockedSetIds);
      if (!drift.stale) {
        await (supabase as any)
          .from('scene_demo_runs')
          .update({ status: 'locked', completed_at: new Date().toISOString() })
          .eq('id', runId);
      }
    }
  }

  // Set canonical run (IEL: must be locked, uniqueness enforced by DB partial unique index)
  const setCanonicalMutation = useMutation({
    mutationFn: async (runId: string) => {
      if (!projectId) throw new Error('No project');

      // Fetch run to validate
      const run = (runsQuery.data || []).find(r => r.id === runId);
      if (!run) throw new Error('Run not found');
      if (run.status !== 'locked') throw new Error(`Cannot set canonical: run is not locked (status: ${run.status})`);

      // Unset any existing canonical for this scene
      await (supabase as any)
        .from('scene_demo_runs')
        .update({ is_canonical: false })
        .eq('project_id', projectId)
        .eq('scene_id', run.scene_id)
        .eq('is_canonical', true);

      // Set this run as canonical
      const { error } = await (supabase as any)
        .from('scene_demo_runs')
        .update({ is_canonical: true })
        .eq('id', runId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success('Set as canonical scene demo'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Unset canonical
  const unsetCanonicalMutation = useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await (supabase as any)
        .from('scene_demo_runs')
        .update({ is_canonical: false })
        .eq('id', runId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success('Canonical status removed'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Invalidate all related queries
  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['scene-demo-runs', projectId] });
    qc.invalidateQueries({ queryKey: ['scene-demo-locked-ids', projectId] });
  }, [qc, projectId]);

  // Get run for a specific scene
  const getRunForScene = useCallback((sceneId: string) => {
    return (runsQuery.data || []).find(r => r.scene_id === sceneId) || null;
  }, [runsQuery.data]);

  // Get canonical run for a scene
  const getCanonicalRunForScene = useCallback((sceneId: string) => {
    return (runsQuery.data || []).find(r => r.scene_id === sceneId && (r as any).is_canonical) || null;
  }, [runsQuery.data]);

  // Ready plans
  const readyPlans = planner.plans.filter(p => p.readiness_status === 'ready');

  // Check staleness for a run
  const checkRunStaleness = useCallback((run: SceneDemoRun) => {
    return detectRunStaleness(run.plan_snapshot as SceneDemoPlan, currentLockedSetIds);
  }, [currentLockedSetIds]);

  return {
    // Planner data
    plans: planner.plans,
    readyPlans,
    summary: planner.summary,
    plannerLoading: planner.isLoading,

    // Run data
    runs: runsQuery.data || [],
    runsLoading: runsQuery.isLoading,
    currentLockedSetIds,

    // Actions
    generate: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,

    // Validation
    validateSlot,
    validateRun,

    // Approval
    approveSlot: approveSlotMutation.mutateAsync,
    rejectSlot: rejectSlotMutation.mutateAsync,
    redoSlot: redoSlotMutation.mutateAsync,
    approveAllSafe: approveAllSafeMutation.mutateAsync,
    lockRun: lockRunMutation.mutateAsync,
    isApproving: approveSlotMutation.isPending || approveAllSafeMutation.isPending,
    isLocking: lockRunMutation.isPending,

    // Canonical
    setCanonical: setCanonicalMutation.mutateAsync,
    unsetCanonical: unsetCanonicalMutation.mutateAsync,
    isSettingCanonical: setCanonicalMutation.isPending,
    getCanonicalRunForScene,

    // Helpers
    getRunForScene,
    fetchImagesForRun,
    checkRunStaleness,
    invalidateRuns: invalidateAll,
  };
}
