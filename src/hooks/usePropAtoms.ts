/**
 * usePropAtoms — hook for prop atom lifecycle
 *
 * Pattern: POST /functions/v1/prop-atomiser
 *   { action: "extract" | "generate" | "status" | "reset_failed", project_id }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FUNC_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prop-atomiser`;

export interface PropAtom {
  id: string;
  project_id: string;
  atom_type: 'prop';
  entity_id: string | null;
  canonical_name: string;
  generation_status: 'pending' | 'generating' | 'running' | 'completed' | 'complete' | 'failed';
  readiness_state: string;
  priority: number;
  confidence: number | null;
  attributes: PropAtomAttributes | null;
  created_at: string;
  updated_at: string;
}

export interface PropAtomAttributes {
  canonicalName: string;
  aliases: string[];
  propType: 'held' | 'set_dressing' | 'vehicle' | 'wardrobe_item' | 'weapon' | 'document' | 'technology' | 'food' | 'flora' | 'other';
  physicalDescription: string;
  primaryColor: string;
  materialComposition: string[];
  condition: string;
  sizeCategory: 'small' | 'medium' | 'large' | 'oversized';
  distinctiveFeatures: string[];
  narrativeFunction: string;
  firstAppearance: string;
  lastAppearance: string;
  frequencyInScript: number;
  usageContexts: string[];
  associatedCharacters: string[];
  associatedLocations: string[];
  symbolicMeaning: string;
  stateChanges: Array<{
    sceneSlugline: string;
    previousState: string;
    newState: string;
    trigger: string;
  }>;
  productionComplexity: 'simple' | 'moderate' | 'complex';
  fabricationRequirements: string[];
  specialHandling: string[];
  referenceImageTerms: string[];
  propBudgetEstimate: string;
  confidence: number;
  readinessBadge: 'foundation' | 'rich' | 'verified';
  generationStatus: string;
}

interface UsePropAtomsOptions {
  projectId: string;
  enabled?: boolean;
}

interface UsePropAtomsReturn {
  atoms: PropAtom[];
  isLoading: boolean;
  isRefreshing: boolean;
  isExtracting: boolean;
  isGenerating: boolean;
  extract: () => Promise<{ created: number } | null>;
  generate: () => Promise<{ spawned: boolean } | null>;
  resetFailed: () => Promise<{ reset: number } | null>;
  refetch: () => Promise<void>;
}

async function callPropAtomiserAction(action: string, projectId: string): Promise<any> {
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
  if (!resp.ok) throw new Error(json?.error || `prop-atomiser ${action} failed: HTTP ${resp.status}`);
  if (json?.error) throw new Error(json.error);
  return json;
}

export function usePropAtoms({
  projectId,
  enabled = true,
}: UsePropAtomsOptions): UsePropAtomsReturn {
  const [atoms, setAtoms] = useState<PropAtom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await callPropAtomiserAction('status', projectId);
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
          (a: PropAtom) =>
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
        (a: PropAtom) =>
          a.generation_status === 'pending' ||
          a.generation_status === 'generating' ||
          a.generation_status === 'running',
      );
      if (hasRunning) startPoll(4000);
    });
    return () => stopPoll();
  }, [enabled, projectId, fetchStatus, startPoll, stopPoll]);

  const extract = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await callPropAtomiserAction('extract', projectId);
      await fetchStatus();
      return data;
    } catch (err: any) {
      setError(err.message);
      setIsExtracting(false);
      return null;
    }
  }, [projectId, fetchStatus]);

  const generate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await callPropAtomiserAction('generate', projectId);
      startPoll(4000);
      return data;
    } catch (err: any) {
      setError(err.message);
      setIsGenerating(false);
      return null;
    }
  }, [projectId, startPoll]);

  const resetFailed = useCallback(async () => {
    setError(null);
    try {
      const data = await callPropAtomiserAction('reset_failed', projectId);
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
