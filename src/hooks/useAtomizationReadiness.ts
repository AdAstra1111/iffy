import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface StageStatus {
  isReady: boolean;
  isLoading: boolean;
  missingStages: string[];
  // Raw for debug
  scene_extract_status?: string;
  entity_extract_status?: string;
}

async function checkAtomizationReadiness(projectId: string): Promise<{
  isReady: boolean;
  missingStages: string[];
  scene_extract_status: string | null;
  entity_extract_status: string | null;
}> {
  // Get most recent run for this project
  const { data: run, error: runErr } = await supabase
    .from('screenplay_intake_runs')
    .select('id')
    .eq('project_id', projectId)
    .order('initiated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runErr || !run) {
    return { isReady: false, missingStages: ['scene_extract', 'entity_extract'], scene_extract_status: null, entity_extract_status: null };
  }

  // Get stage statuses for scene_extract and entity_extract
  const { data: stages, error: stageErr } = await supabase
    .from('screenplay_intake_stage_runs')
    .select('stage_key, status')
    .eq('run_id', run.id)
    .in('stage_key', ['scene_extract', 'entity_extract']);

  if (stageErr || !stages || stages.length === 0) {
    return { isReady: false, missingStages: ['scene_extract', 'entity_extract'], scene_extract_status: null, entity_extract_status: null };
  }

  const stageMap = new Map(stages.map(s => [s.stage_key, s.status]));
  const sceneStatus = stageMap.get('scene_extract') ?? null;
  const entityStatus = stageMap.get('entity_extract') ?? null;

  const missing: string[] = [];
  if (sceneStatus !== 'done') missing.push('scene_extract');
  if (entityStatus !== 'done') missing.push('entity_extract');

  return {
    isReady: missing.length === 0,
    missingStages: missing,
    scene_extract_status: sceneStatus,
    entity_extract_status: entityStatus,
  };
}

export function useAtomizationReadiness(projectId: string): StageStatus {
  const [missingStages, setMissingStages] = useState<string[]>(['scene_extract', 'entity_extract']);
  const [sceneExtractStatus, setSceneExtractStatus] = useState<string | undefined>();
  const [entityExtractStatus, setEntityExtractStatus] = useState<string | undefined>();

  // Use useQuery for the initial + cached check (refetches on window focus)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['atomization-readiness', projectId],
    queryFn: () => checkAtomizationReadiness(projectId),
    refetchInterval: (query) => {
      // Poll every 5s while not ready
      if (query.state.data?.isReady === true) return false;
      return 5000;
    },
    refetchIntervalInBackground: false,
    staleTime: 2000,
  });

  useEffect(() => {
    if (data) {
      setMissingStages(data.missingStages);
      setSceneExtractStatus(data.scene_extract_status ?? undefined);
      setEntityExtractStatus(data.entity_extract_status ?? undefined);
    }
  }, [data]);

  return {
    isReady: data?.isReady ?? false,
    isLoading,
    missingStages,
    scene_extract_status: sceneExtractStatus,
    entity_extract_status: entityExtractStatus,
  };
}