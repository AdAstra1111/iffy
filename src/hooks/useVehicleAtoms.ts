/**
 * useVehicleAtoms — hook for vehicle atom lifecycle
 *
 * Pattern: POST /functions/v1/vehicle-atomiser
 *   { action: "extract" | "generate" | "status" | "reset_failed", project_id }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FUNC_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-atomiser`;

export interface VehicleAtom {
  id: string;
  project_id: string;
  atom_type: 'vehicle';
  entity_id: string | null;
  canonical_name: string;
  generation_status: 'pending' | 'generating' | 'running' | 'completed' | 'complete' | 'failed';
  readiness_state: string;
  priority: number;
  confidence: number | null;
  attributes: VehicleAtomAttributes | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleAtomAttributes {
  vehicle_type: string;
  era_alignment: string;
  make_model: string;
  period_accuracy: 'accurate' | 'stylised' | 'anachronistic';
  ownership: string;
  character_association: string;
  condition: string;
  distinctive_features: string;
  modification_level: 'stock' | 'mildly_customised' | 'heavily_modified';
  visual_complexity: 'simple' | 'moderate' | 'complex';
  set_requirements: string;
  driving_context: string;
  sound_profile: string;
  budget_estimate: 'budget' | 'moderate' | 'expensive' | 'prohibitively_expensive';
  availability_notes: string;
  reference_images_needed: string[];
  casting_type_tags: string[];
  anachronism_flags: string[];
  production_notes: string;
  // Meta
  frequencyInScript: number;
  sourceType?: 'entity' | 'extracted';
  confidence: number;
  readinessBadge: 'foundation' | 'rich' | 'verified';
  generationStatus: string;
}

interface UseVehicleAtomsOptions {
  projectId: string;
  enabled?: boolean;
}

interface UseVehicleAtomsReturn {
  atoms: VehicleAtom[];
  isLoading: boolean;
  isRefreshing: boolean;
  isExtracting: boolean;
  isGenerating: boolean;
  extract: () => Promise<{ created: number; vehicles?: string[] } | null>;
  generate: () => Promise<{ spawned: boolean; count?: number } | null>;
  resetFailed: () => Promise<{ reset: number } | null>;
  refetch: () => Promise<void>;
}

async function callAtomiserAction(action: string, projectId: string): Promise<any> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token || '';
  const resp = await fetch(FUNC_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, project_id: projectId }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || `vehicle-atomiser ${action} failed: HTTP ${resp.status}`);
  if (json?.error) throw new Error(json.error);
  return json;
}

export function useVehicleAtoms({
  projectId,
  enabled = true,
}: UseVehicleAtomsOptions): UseVehicleAtomsReturn {
  const [atoms, setAtoms] = useState<VehicleAtom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await callAtomiserAction('status', projectId);
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

  const startPoll = useCallback(
    (delayMs = 4000) => {
      stopPoll();
      const tick = async () => {
        setIsRefreshing(true);
        const current = await fetchStatus();
        setIsRefreshing(false);
        const hasRunning = current.some(
          (a: VehicleAtom) =>
            a.generation_status === 'pending' ||
            a.generation_status === 'generating' ||
            a.generation_status === 'running',
        );
        if (hasRunning) {
          pollTimer.current = setTimeout(tick, delayMs);
        }
      };
      pollTimer.current = setTimeout(tick, delayMs);
    },
    [fetchStatus, stopPoll],
  );

  useEffect(() => {
    if (!enabled || !projectId) return;
    setIsLoading(true);
    fetchStatus().then((current) => {
      setIsLoading(false);
      const hasRunning = current.some(
        (a: VehicleAtom) =>
          a.generation_status === 'pending' ||
          a.generation_status === 'generating' ||
          a.generation_status === 'running',
      );
      if (hasRunning) startPoll(4000);
    });
    return () => stopPoll();
  }, [enabled, projectId, fetchStatus, startPoll, stopPoll]);

  const extract = useCallback(async () => {
    setIsExtracting(true);
    setError(null);
    try {
      const data = await callAtomiserAction('extract', projectId);
      await fetchStatus();
      setIsExtracting(false);
      return data;
    } catch (err: any) {
      setError(err.message);
      setIsExtracting(false);
      return null;
    }
  }, [projectId, fetchStatus]);

  const generate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const data = await callAtomiserAction('generate', projectId);
      startPoll(4000);      return data;
    } catch (err: any) {
      setError(err.message);
      setIsGenerating(false);
      return null;
    }
  }, [projectId, startPoll]);

  const resetFailed = useCallback(async () => {
    setError(null);
    try {
      const data = await callAtomiserAction('reset_failed', projectId);
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

  return { atoms, isLoading, isRefreshing, isExtracting, isGenerating, lastUpdated, error, extract, generate, resetFailed, refetch };
}
