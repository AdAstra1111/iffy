/**
 * useVisualProductionBible — React hook for VPB loading, regeneration, and export.
 *
 * Wraps the vpb-assembly-engine edge function and vpb_versions queries.
 * Provides loading state, error handling, and version tracking.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VPB {
  metadata: {
    projectId: string;
    version: number;
    generatedAt: string;
    status: string;
    projectTitle: string;
    projectFormat: string;
    projectGenres: string[];
    projectLogline: string;
  };
  sections: Record<string, any>;
  provenance: {
    generatedBy: string;
    assemblyTimestamp: string;
    assemblyDurationMs: number;
    sources: string[];
    nelStagesRun: string[];
    assetCount: number;
  };
}

export interface VPBVersion {
  id: string;
  version_number: number;
  is_current: boolean;
  status: string;
  vpb_json: VPB;
  nel_run_at: string;
  section_count: number;
  asset_count: number;
  assembly_duration_ms: number;
  created_at: string;
  generated_by: string;
}

export function useVisualProductionBible(projectId: string | undefined) {
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [vpb, setVpb] = useState<VPB | null>(null);
  const [version, setVersion] = useState<VPBVersion | null>(null);
  const [versions, setVersions] = useState<VPBVersion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadVPB = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      // Load latest version from vpb_versions table
      const { data, error: qErr } = await supabase
        .from('vpb_versions')
        .select('*')
        .eq('project_id', projectId)
        .order('version_number', { ascending: false });

      if (qErr) throw new Error(qErr.message);

      const rows = (data || []) as VPBVersion[];
      if (rows.length === 0) {
        setVpb(null);
        setVersion(null);
        setVersions([]);
        setIsLoading(false);
        return;
      }

      const latest = rows.find(r => r.is_current) || rows[0];
      setVpb(latest.vpb_json);
      setVersion(latest);
      setVersions(rows);
    } catch (err: any) {
      console.error('[useVPB] Load error:', err);
      setError(err.message || 'Failed to load VPB');
      toast.error('Failed to load VPB');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const regenerateVPB = useCallback(async () => {
    if (!projectId) return;
    setIsRegenerating(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('vpb-assembly-engine', {
        body: { projectId },
      });

      if (fnErr) throw new Error(fnErr.message || 'Regeneration failed');
      if (data?.error) throw new Error(data.error);

      toast.success(`VPB v${data.versionNumber} assembled (${data.sectionCount} sections, ${data.assemblyDurationMs}ms)`);
      
      // Reload to get the persisted version
      await loadVPB();
      return data;
    } catch (err: any) {
      console.error('[useVPB] Regenerate error:', err);
      setError(err.message || 'Regeneration failed');
      toast.error(err.message || 'VPB regeneration failed');
      return null;
    } finally {
      setIsRegenerating(false);
    }
  }, [projectId, loadVPB]);

  const exportMarkdown = useCallback(async (): Promise<string | null> => {
    if (!projectId) return null;
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('vpb-export', {
        body: { projectId, format: 'markdown' },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      return data.markdown;
    } catch (err: any) {
      console.error('[useVPB] Export error:', err);
      toast.error('Export failed: ' + (err.message || 'Unknown error'));
      return null;
    }
  }, [projectId]);

  const loadVersion = useCallback(async (versionId: string) => {
    if (!projectId) return;
    try {
      const { data, error: qErr } = await supabase
        .from('vpb_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (qErr) throw new Error(qErr.message);
      if (data) {
        const v = data as VPBVersion;
        setVpb(v.vpb_json);
        setVersion(v);
      }
    } catch (err: any) {
      console.error('[useVPB] Load version error:', err);
    }
  }, [projectId]);

  return {
    isLoading,
    isRegenerating,
    vpb,
    version,
    versions,
    error,
    loadVPB,
    regenerateVPB,
    exportMarkdown,
    loadVersion,
  };
}