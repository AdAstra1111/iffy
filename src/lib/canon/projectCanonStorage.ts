import { supabase } from '@/integrations/supabase/client';

type CanonJson = Record<string, unknown>;

interface ProjectCanonSnapshot {
  canonJson: CanonJson;
  updatedAt: string | null;
}

const MAX_CANON_WRITE_RETRIES = 3;

export async function readProjectCanonSnapshot(projectId: string): Promise<ProjectCanonSnapshot> {
  const { data, error } = await (supabase as any)
    .from('project_canon')
    .select('canon_json, updated_at')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) throw error;

  return {
    canonJson: (data?.canon_json as CanonJson) || {},
    updatedAt: data?.updated_at ?? null,
  };
}

export async function mergeProjectCanonJson(
  projectId: string,
  merge: (current: CanonJson) => CanonJson,
  source: string,
): Promise<ProjectCanonSnapshot> {
  const { data: user } = await supabase.auth.getUser();
  const updatedBy = user?.user?.id ?? null;

  for (let attempt = 1; attempt <= MAX_CANON_WRITE_RETRIES; attempt += 1) {
    const snapshot = await readProjectCanonSnapshot(projectId);
    const nextCanonJson = merge(snapshot.canonJson);

    if (!snapshot.updatedAt) {
      const { error } = await (supabase as any)
        .from('project_canon')
        .upsert({ project_id: projectId, canon_json: nextCanonJson, updated_by: updatedBy }, { onConflict: 'project_id' });

      if (error) throw error;

      const refreshed = await readProjectCanonSnapshot(projectId);
      console.log('[ProjectCanon] canonical upsert committed', {
        source,
        projectId,
        updatedAt: refreshed.updatedAt,
        keys: Object.keys(refreshed.canonJson),
      });
      return refreshed;
    }

    const { data, error } = await (supabase as any)
      .from('project_canon')
      .update({ canon_json: nextCanonJson, updated_by: updatedBy })
      .eq('project_id', projectId)
      .eq('updated_at', snapshot.updatedAt)
      .select('canon_json, updated_at')
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const committed = {
        canonJson: (data.canon_json as CanonJson) || {},
        updatedAt: data.updated_at ?? null,
      };
      console.log('[ProjectCanon] canonical merge committed', {
        source,
        projectId,
        updatedAt: committed.updatedAt,
        keys: Object.keys(committed.canonJson),
      });
      return committed;
    }

    console.warn('[ProjectCanon] write conflict detected, retrying canonical merge', {
      source,
      projectId,
      attempt,
    });
  }

  throw new Error('Failed to persist canonical project truth due to a concurrent write. Please retry.');
}