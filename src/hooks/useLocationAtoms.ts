/**
 * useLocationAtoms — hook for location atom lifecycle
 *
 * Pattern: POST /functions/v1/location-atomiser
 *   { action: "extract" | "generate" | "status" | "reset_failed", project_id }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FUNC_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/location-atomiser`;

export interface LocationAtom {
  id: string;
  project_id: string;
  atom_type: 'location';
  entity_id: string;
  canonical_name: string;
  generation_status: 'pending' | 'generating' | 'completed' | 'complete' | 'failed';
  readiness_state: string;
  priority: number;
  confidence: number | null;
  attributes: LocationAtomAttributes | null;
  created_at: string;
  updated_at: string;
}

export interface LocationAtomAttributes {
  canonicalName: string;
  aliases: string[];
  era: string;
  period: string;
  architectureStyle: string;
  settingType: string;
  visualComplexity: 'low' | 'medium' | 'high';
  signatureArchitecturalFeatures: string[];
  dominantColors: string[];
  lightingCharacter: string;
  sensoryTexture: string[];
  acousticCharacter: string;
  temperatureImpression: string;
  atmosphericMood: string[];
  narrativeFunction: string;
  frequencyInScript: number;
  associatedCharacters: string[];
  keyScenes: string[];
  thematicSymbolism: string;
  productionComplexity: 'simple' | 'moderate' | 'complex';
  setRequirements: string[];
  specialConsiderations: string[];
  soundstageViability: string;
  castingSuggestions: string;
  moodBoardReference: string;
  confidence: number;
  readinessBadge: 'foundation' | 'rich' | 'verified';
  generationStatus: string;
}

interface UseLocationAtomsOptions {
  projectId: string;
  enabled?: boolean;
}

interface UseLocationAtomsReturn {
  atoms: LocationAtom[];
  isLoading: boolean;
  isRefreshing: boolean;
  isExtracting: boolean;
  isGenerating: boolean;
  extract: () => Promise<{ created: number } | null>;
  generate: () => Promise<{ spawned: boolean } | null>;
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
  if (!resp.ok) throw new Error(json?.error || `location-atomiser ${action} failed: HTTP ${resp.status}`);
  if (json?.error) throw new Error(json.error);
  return json;
}

export function useLocationAtoms({
  projectId,
  enabled = true,
}: UseLocationAtomsOptions): UseLocationAtomsReturn {
  const [atoms, setAtoms] = useState<LocationAtom[]>([]);
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
          (a: LocationAtom) => a.generation_status === 'pending' || a.generation_status === 'generating',
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
        (a: LocationAtom) => a.generation_status === 'pending' || a.generation_status === 'generating',
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
