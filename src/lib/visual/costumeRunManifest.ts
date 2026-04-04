/**
 * costumeRunManifest.ts — Run manifest for costume generation sessions.
 *
 * Provides deterministic scoping, run stamping, and cast-scope freeze
 * for costume generation runs.
 *
 * Every candidate created during a run MUST be stamped with the run_id
 * and generation_mode so historical vs current-run candidates can be
 * distinguished in the UI.
 */

// ── Types ──

export type CostumeGenerationMode = 'required_only' | 'full' | 'single_slot';

export interface CostumeRunManifest {
  run_id: string;
  generation_mode: CostumeGenerationMode;
  character_key: string;
  wardrobe_state_key: string;
  allowed_slot_keys: string[];
  cast_scope_hash: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'aborted' | 'stale';
  slots_attempted: number;
  slots_succeeded: number;
  stale_reason: string | null;
}

export interface CostumeRunSession {
  session_id: string;
  character_key: string;
  generation_mode: CostumeGenerationMode;
  cast_scope_hash: string;
  started_at: string;
  runs: CostumeRunManifest[];
  is_stale: boolean;
  stale_reason: string | null;
}

// ── Helpers ──

let _runCounter = 0;

/** Generate a unique run ID (client-side, no DB round-trip needed) */
export function generateRunId(): string {
  _runCounter++;
  return `crun_${Date.now()}_${_runCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a session ID */
export function generateSessionId(): string {
  return `csess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Compute a deterministic hash of the cast scope for drift detection.
 * Uses sorted character_key:actor_id:version_id triples.
 */
export function computeCastScopeHash(
  castBindings: Array<{ character_key: string; ai_actor_id: string; ai_actor_version_id: string }>
): string {
  const sorted = [...castBindings]
    .sort((a, b) => a.character_key.localeCompare(b.character_key))
    .map(c => `${c.character_key}:${c.ai_actor_id}:${c.ai_actor_version_id}`)
    .join('|');
  // Simple hash — not cryptographic, just for drift detection
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return `scope_${Math.abs(hash).toString(36)}`;
}

/**
 * Create a run manifest for a costume generation pass.
 */
export function createRunManifest(
  characterKey: string,
  wardrobeStateKey: string,
  mode: CostumeGenerationMode,
  allowedSlotKeys: string[],
  castScopeHash: string,
): CostumeRunManifest {
  return {
    run_id: generateRunId(),
    generation_mode: mode,
    character_key: characterKey,
    wardrobe_state_key: wardrobeStateKey,
    allowed_slot_keys: allowedSlotKeys,
    cast_scope_hash: castScopeHash,
    started_at: new Date().toISOString(),
    completed_at: null,
    status: 'running',
    slots_attempted: 0,
    slots_succeeded: 0,
    stale_reason: null,
  };
}

/**
 * FAIL-CLOSED: Check if a slot_key is permitted in the current run manifest.
 * Returns false for any slot not in allowed_slot_keys.
 */
export function isSlotAllowedInRun(manifest: CostumeRunManifest, slotKey: string): boolean {
  return manifest.allowed_slot_keys.includes(slotKey);
}

/**
 * Check if cast scope has drifted since session started.
 */
export function hasCastScopeDrifted(
  sessionHash: string,
  currentHash: string,
): boolean {
  return sessionHash !== currentHash;
}

/**
 * Determine which candidate belongs to the active run vs historical.
 */
export function isCandidateFromRun(
  candidateRunId: string | null | undefined,
  activeRunId: string,
): boolean {
  return !!candidateRunId && candidateRunId === activeRunId;
}
