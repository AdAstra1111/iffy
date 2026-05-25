import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ExecutionProvenanceRow } from '@/lib/visual/visualExecutionProvenanceTypes';

interface UseVisualExecutionProvenanceOptions {
  projectId: string | undefined;
  enabled?: boolean;
}

interface UseVisualExecutionProvenanceResult {
  rows: ExecutionProvenanceRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useVisualExecutionProvenance({
  projectId,
  enabled = true,
}: UseVisualExecutionProvenanceOptions): UseVisualExecutionProvenanceResult {
  const [rows, setRows] = useState<ExecutionProvenanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchProvenance = useCallback(async () => {
    if (!projectId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await (supabase as any)
        .from('project_visual_execution_provenance')
        .select('*')
        .eq('project_id', projectId)
        .order('execution_number', { ascending: false });

      if (queryError) throw queryError;
      if (data) setRows(data);
    } catch (err: any) {
      console.warn('useVisualExecutionProvenance: failed to fetch', err.message);
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (projectId && enabled) fetchProvenance();
    return () => { mountedRef.current = false; };
  }, [projectId, enabled, fetchProvenance]);

  return { rows, loading, error, refresh: fetchProvenance };
}