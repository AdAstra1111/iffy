/**
 * useVisualLanguageAtoms — hook for visual language atom lifecycle
 *
 * Pattern: POST /functions/v1/visual-language-atomiser
 *   { action: "extract" | "generate" | "status" | "reset_failed", project_id }
 *
 * Tables:
 *   visual_language_atoms       — identity layer
 *   visual_language_projections — projection layer (1:1)
 *   visual_language_relations   — graph edge layer
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FUNC_BASE = `/api/supabase-proxy/functions/v1/visual-language-atomiser`;

// ── Types ──────────────────────────────────────────────────────────────

export interface VLProjection {
  id: string;
  vl_atom_id: string;
  colour_philosophy: string;
  contrast_model: string;
  lighting_philosophy: string;
  shadow_philosophy: string;
  lens_philosophy: string;
  saturation_profile: string;
  palette_bias: string;
  texture_philosophy: string;
  atmosphere_philosophy: string;
  focus_philosophy: string;
  depth_philosophy: string;
  realism_level: string;
  visual_scale: string;
  provenance: string;
  confidence: number;
}

export interface VLAtom {
  id: string;
  project_id: string;
  stable_key: string;
  canonical_name: string;
  description: string;
  visual_intent: string;
  cinematic_function: string;
  pressure_signatures: string[];
  confidence: number;
  generation_status: 'pending' | 'running' | 'complete' | 'failed';
  readiness_state: string;
  attributes: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Enriched by status endpoint
  projection: VLProjection | null;
  outgoing_relations: number;
  incoming_relations: number;
}

interface UseVLOptions { projectId: string; enabled?: boolean; }
interface UseVLReturn {
  atoms: VLAtom[]; isLoading: boolean; isRefreshing: boolean;
  isExtracting: boolean; isGenerating: boolean;
  lastUpdated: Date | null; error: string | null;
  extract: () => Promise<any>; generate: () => Promise<any>;
  resetFailed: () => Promise<any>; refetch: () => Promise<void>;
}

// ── API call ───────────────────────────────────────────────────────────

async function call(action: string, projectId: string): Promise<any> {
  const { data: { session: { access_token: token = '' } = {} } = {} } = await supabase.auth.getSession();
  const resp = await fetch(FUNC_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, project_id: projectId }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || `vl-atomiser ${action} failed: HTTP ${resp.status}`);
  if (json?.error) throw new Error(json.error);
  return json;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useVisualLanguageAtoms({ projectId, enabled = true }: UseVLOptions): UseVLReturn {
  const [atoms, setAtoms] = useState<VLAtom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await call('status', projectId);
      setAtoms(data.atoms || []);
      setLastUpdated(new Date());
      setError(null);
      return data.atoms || [];
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, [projectId]);

  const stopPoll = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const startPoll = useCallback((delayMs = 5000) => {
    stopPoll();
    const tick = async () => {
      setIsRefreshing(true);
      const current = await fetchStatus();
      setIsRefreshing(false);
      const hasRunning = current.some(
        (a: VLAtom) => a.generation_status === 'pending' || a.generation_status === 'running'
      );
      if (hasRunning) {
        pollTimer.current = setTimeout(tick, delayMs);
      } else {
        setIsGenerating(false);
      }
    };
    pollTimer.current = setTimeout(tick, delayMs);
  }, [fetchStatus, stopPoll]);

  useEffect(() => {
    if (!enabled || !projectId) return;
    setIsLoading(true);
    fetchStatus().then(current => {
      setIsLoading(false);
      if (current.some((a: VLAtom) => a.generation_status === 'pending' || a.generation_status === 'running')) {
        startPoll(5000);
      }
    });
    return () => stopPoll();
  }, [enabled, projectId, fetchStatus, startPoll, stopPoll]);

  const extract = useCallback(async () => {
    setIsLoading(true); setIsExtracting(true); setError(null);
    try {
      const data = await call('extract', projectId);
      await fetchStatus();
      // Start polling if atoms were created and are pending
      if (data?.created > 0) startPoll(5000);
      setIsLoading(false); setIsExtracting(false);
      return data;
    } catch (err: any) {
      setError(err.message); setIsLoading(false); setIsExtracting(false);
      return null;
    }
  }, [projectId, fetchStatus, startPoll]);

  const generate = useCallback(async () => {
    setIsGenerating(true); setError(null);
    try {
      const data = await call('generate', projectId);
      startPoll(5000);
      return data;
    } catch (err: any) {
      setError(err.message); setIsGenerating(false);
      return null;
    }
  }, [projectId, startPoll]);

  const resetFailed = useCallback(async () => {
    setError(null);
    try {
      const data = await call('reset_failed', projectId);
      await fetchStatus();
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [projectId, fetchStatus]);

  const refetch = useCallback(async () => {
    setIsRefreshing(true);
    await fetchStatus();
    setIsRefreshing(false);
  }, [fetchStatus]);

  return {
    atoms, isLoading, isRefreshing, isExtracting, isGenerating,
    lastUpdated, error, extract, generate, resetFailed, refetch,
  };
}
