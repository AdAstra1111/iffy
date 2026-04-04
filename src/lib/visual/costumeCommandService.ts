/**
 * costumeCommandService.ts — Persisted command/control layer for costume generation runs.
 *
 * All commands are persisted to `costume_run_commands` table (Supabase).
 * Command consumption is ATOMIC via `consume_next_costume_command` RPC.
 * Run identity is persisted to `costume_runs` table.
 *
 * UI issues commands via DB inserts; executor consumes via RPC.
 * Pause state is DB-driven (costume_runs.status), not browser-local.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Types ──

export type PersistedCommandType = 'pause_run' | 'resume_run' | 'retry_state' | 'skip_state';
// NOTE: retry_slot is deliberately excluded — no slot-level executor checkpoint exists yet.

export type PersistedCommandStatus = 'pending' | 'applied' | 'failed' | 'cancelled';

export interface PersistedCommand {
  id: string;
  run_id: string;
  command_type: PersistedCommandType;
  character_key: string | null;
  state_key: string | null;
  slot_key: string | null;
  payload_json: Record<string, any> | null;
  status: PersistedCommandStatus;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  consumed_at: string | null;
  result_json: Record<string, any> | null;
  project_id: string;
}

export type CostumeRunStatus = 'running' | 'paused' | 'completed' | 'aborted';

export interface CostumeRunRecord {
  id: string;
  project_id: string;
  status: CostumeRunStatus;
  manifest_json: Record<string, any>;
  created_by: string | null;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
}

// ── Run Persistence ──

/**
 * Create a persisted run record. Must be called at run start.
 */
export async function createPersistedRun(
  runId: string,
  projectId: string,
  userId: string | null,
  manifestJson: Record<string, any>,
): Promise<CostumeRunRecord | null> {
  const { data, error } = await (supabase as any)
    .from('costume_runs')
    .insert({
      id: runId,
      project_id: projectId,
      status: 'running',
      manifest_json: manifestJson,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    console.error(`[CostumeRun] Failed to persist run:`, error);
    return null;
  }

  console.log(`[CostumeRun] Persisted run: ${runId}`);
  return data as CostumeRunRecord;
}

/**
 * Update run status. Used for completion and abort.
 */
export async function updateRunStatus(
  projectId: string,
  runId: string,
  status: CostumeRunStatus,
): Promise<void> {
  const updates: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'completed' || status === 'aborted') {
    updates.ended_at = new Date().toISOString();
  }

  const { error } = await (supabase as any)
    .from('costume_runs')
    .update(updates)
    .eq('id', runId)
    .eq('project_id', projectId);

  if (error) {
    console.error(`[CostumeRun] Failed to update run status:`, error);
  } else {
    console.log(`[CostumeRun] Run ${runId} → ${status}`);
  }
}

/**
 * Fetch the latest active run for a project (running or paused).
 * Used on mount to restore run state after refresh.
 */
export async function fetchActiveRun(
  projectId: string,
): Promise<CostumeRunRecord | null> {
  const { data, error } = await (supabase as any)
    .from('costume_runs')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['running', 'paused'])
    .order('started_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0] as CostumeRunRecord;
}

// ── Command Issuance (UI → DB) ──

export async function issuePersistedCommand(
  projectId: string,
  runId: string,
  type: PersistedCommandType,
  userId: string | null,
  opts?: {
    characterKey?: string;
    stateKey?: string;
    reason?: string;
    payload?: Record<string, any>;
  },
): Promise<PersistedCommand | null> {
  const { data, error } = await (supabase as any)
    .from('costume_run_commands')
    .insert({
      project_id: projectId,
      run_id: runId,
      command_type: type,
      character_key: opts?.characterKey ?? null,
      state_key: opts?.stateKey ?? null,
      slot_key: null,
      payload_json: opts?.payload ?? null,
      reason: opts?.reason ?? null,
      created_by: userId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error(`[CostumeCmd] Failed to persist command:`, error);
    return null;
  }

  console.log(`[CostumeCmd] Persisted: ${type} run=${runId}`, {
    id: data.id,
    character: opts?.characterKey,
    state: opts?.stateKey,
    reason: opts?.reason,
  });

  return data as PersistedCommand;
}

// ── Atomic Command Consumption (Executor → RPC) ──

export type ConsumedAction = 'pause' | 'skip_state' | 'retry_state' | 'none';

export interface AtomicConsumptionResult {
  action: ConsumedAction;
  command_id: string | null;
  reason: string | null;
}

/**
 * Atomically consume the next pending command via server-side RPC.
 * Uses FOR UPDATE SKIP LOCKED — fully concurrency-safe.
 * Fail-closed: any RPC error returns 'none'.
 */
export async function consumeNextCommandAtomic(
  projectId: string,
  runId: string,
  context: {
    activeCharacterKey: string | null;
    activeStateKey: string | null;
  },
): Promise<AtomicConsumptionResult> {
  const { data, error } = await (supabase as any).rpc('consume_next_costume_command', {
    p_project_id: projectId,
    p_run_id: runId,
    p_character_key: context.activeCharacterKey,
    p_state_key: context.activeStateKey,
  });

  if (error) {
    console.error(`[CostumeCmd] RPC consumption failed (fail-closed → none):`, error);
    return { action: 'none', command_id: null, reason: null };
  }

  const action = (data?.action || 'none') as ConsumedAction;
  if (action !== 'none') {
    console.log(`[CostumeCmd] Atomic consumed: ${action} (cmd=${data.command_id})`);
  }

  return {
    action,
    command_id: data?.command_id || null,
    reason: data?.reason || null,
  };
}

/**
 * Resume a paused run via server-side RPC (atomically updates run status + consumes resume command).
 */
export async function resumeRunAtomic(
  projectId: string,
  runId: string,
): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('resume_costume_run', {
    p_project_id: projectId,
    p_run_id: runId,
  });

  if (error) {
    console.error(`[CostumeCmd] Resume RPC failed:`, error);
    return false;
  }

  console.log(`[CostumeCmd] Run resumed via RPC: ${runId}`, data);
  return true;
}

// ── DB-Driven Pause Check ──

/**
 * Check if a run is currently paused by reading costume_runs.status.
 * This is the canonical pause truth — not browser state.
 */
export async function isRunPausedFromDB(
  projectId: string,
  runId: string,
): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('costume_runs')
    .select('status')
    .eq('id', runId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (error || !data) return false;
  return data.status === 'paused';
}

/**
 * @deprecated Use isRunPausedFromDB for canonical truth.
 * Legacy: Check pause from command history. Kept for backward compatibility.
 */
export async function isRunPaused(
  projectId: string,
  runId: string,
): Promise<boolean> {
  // Prefer costume_runs table if run exists there
  const dbResult = await isRunPausedFromDB(projectId, runId);
  return dbResult;
}

// ── Cancel all pending commands for a run ──

export async function cancelPendingPersistedCommands(
  projectId: string,
  runId: string,
): Promise<number> {
  const { data, error } = await (supabase as any)
    .from('costume_run_commands')
    .update({
      status: 'cancelled',
      consumed_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('run_id', runId)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    console.error(`[CostumeCmd] Failed to cancel pending commands:`, error);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[CostumeCmd] Cancelled ${count} pending commands for run ${runId}`);
  }
  return count;
}

// ── Fetch command history for audit/UI ──

export async function fetchCommandHistory(
  projectId: string,
  runId?: string,
  limit = 50,
): Promise<PersistedCommand[]> {
  let query = (supabase as any)
    .from('costume_run_commands')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (runId) {
    query = query.eq('run_id', runId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(`[CostumeCmd] Failed to fetch command history:`, error);
    return [];
  }
  return (data || []) as PersistedCommand[];
}

// ── Utility: sleep for DB-driven pause polling ──

export function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
