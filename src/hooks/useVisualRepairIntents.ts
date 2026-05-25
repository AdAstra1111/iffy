import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VisualRepairIntent {
  id: string;
  project_id: string;
  stage_id: string;
  stale_reason_codes: string[];
  recommended_action: string;
  intent_label: string | null;
  intent_detail: string | null;
  created_by: string;
  approval_state: 'pending' | 'approved' | 'rejected' | 'cancelled';
  execution_state: 'queued' | 'ready' | 'blocked' | 'completed' | 'failed';
  provenance_snapshot: { sourceType: string; sourceDetail?: string; generatedAsset?: string; functionName?: string } | null;
  downstream_stages: string[] | null;
  created_at: string;
  approved_at: string | null;
  executed_at: string | null;
  rejection_reason: string | null;
  execution_result_json: {
    status: string;
    output?: any;
    error?: string;
    evaluated_at?: string;
    stages_count?: number;
  } | null;
}

interface UseVisualRepairIntentsOptions {
  projectId: string | undefined;
  enabled?: boolean;
}

interface UseVisualRepairIntentsResult {
  intents: VisualRepairIntent[];
  intentsByStage: Map<string, VisualRepairIntent[]>;
  loading: boolean;
  error: string | null;
  createIntent: (opts: {
    stageId: string;
    staleReasonCodes: string[];
    recommendedAction: string;
    intentLabel?: string;
    intentDetail?: string;
    provenanceSnapshot?: any;
    downstreamStages?: string[];
    createdBy: string;
  }) => Promise<void>;
  approveIntent: (intentId: string) => Promise<void>;
  rejectIntent: (intentId: string, reason?: string) => Promise<void>;
  cancelIntent: (intentId: string) => Promise<void>;
  executeIntent: (intentId: string) => Promise<{ success: boolean; error?: string; blocked?: boolean }>;
  refresh: () => Promise<void>;
}

export function useVisualRepairIntents({
  projectId,
  enabled = true,
}: UseVisualRepairIntentsOptions): UseVisualRepairIntentsResult {
  const [intents, setIntents] = useState<VisualRepairIntent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchIntents = useCallback(async () => {
    if (!projectId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('repair-visual-intents', {
        body: { action: 'list', projectId },
      });
      if (fnError) throw fnError;
      if (data?.intents) setIntents(data.intents);
    } catch (err: any) {
      console.warn('useVisualRepairIntents: failed to fetch', err.message);
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (projectId && enabled) fetchIntents();
    return () => { mountedRef.current = false; };
  }, [projectId, enabled, fetchIntents]);

  // Build a Map<stageId, intents[]>
  const intentsByStage = new Map<string, VisualRepairIntent[]>();
  for (const intent of intents) {
    const existing = intentsByStage.get(intent.stage_id) ?? [];
    existing.push(intent);
    intentsByStage.set(intent.stage_id, existing);
  }

  const createIntent = useCallback(async (opts: {
    stageId: string; staleReasonCodes: string[]; recommendedAction: string;
    intentLabel?: string; intentDetail?: string; provenanceSnapshot?: any;
    downstreamStages?: string[]; createdBy: string;
  }) => {
    if (!projectId) return;
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('repair-visual-intents', {
        body: { action: 'create', projectId, ...opts },
      });
      if (fnError) throw fnError;
      if (data?.intent) setIntents(prev => [...prev, data.intent]);
    } catch (err: any) {
      setError(err.message);
    }
  }, [projectId]);

  const approveIntent = useCallback(async (intentId: string) => {
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('repair-visual-intents', {
        body: { action: 'approve', intentId },
      });
      if (fnError) throw fnError;
      if (data?.intent) {
        setIntents(prev => prev.map(i => i.id === intentId ? data.intent : i));
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const rejectIntent = useCallback(async (intentId: string, reason?: string) => {
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('repair-visual-intents', {
        body: { action: 'reject', intentId, reason },
      });
      if (fnError) throw fnError;
      if (data?.intent) {
        setIntents(prev => prev.map(i => i.id === intentId ? data.intent : i));
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const cancelIntent = useCallback(async (intentId: string) => {
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('repair-visual-intents', {
        body: { action: 'cancel', intentId },
      });
      if (fnError) throw fnError;
      if (data?.intent) {
        setIntents(prev => prev.map(i => i.id === intentId ? data.intent : i));
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const executeIntent = useCallback(async (intentId: string): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('repair-visual-intents', {
        body: { action: 'execute', intentId },
      });
      if (fnError) throw fnError;
      if (data?.error) {
        return { success: false, error: data.error };
      }
      if (data?.intent) {
        setIntents(prev => prev.map(i => i.id === intentId ? data.intent : i));
        return { success: true };
      }
      return { success: false, error: 'No intent returned' };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  return {
    intents,
    intentsByStage,
    loading,
    error,
    createIntent,
    approveIntent,
    rejectIntent,
    cancelIntent,
    executeIntent,
    refresh: fetchIntents,
  };
}