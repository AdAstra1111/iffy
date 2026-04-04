/**
 * costumeRunCommands.ts — Deterministic command/control layer for costume generation runs.
 *
 * Commands are ref-based (not DB-persisted) because the generation executor
 * is the browser itself. The generation loop checks pending commands
 * before each slot/state iteration.
 *
 * All commands are auditable via console logs and outcome tracking.
 */

// ── Command Types ──

export type CostumeCommandType =
  | 'pause_run'
  | 'resume_run'
  | 'retry_state'
  | 'skip_state'
  | 'retry_slot';

export type CostumeCommandStatus = 'pending' | 'applied' | 'failed' | 'cancelled';

export interface CostumeRunCommand {
  id: string;
  run_id: string;
  command_type: CostumeCommandType;
  character_key: string | null;
  state_key: string | null;
  slot_key: string | null;
  payload_json: Record<string, any> | null;
  status: CostumeCommandStatus;
  created_at: string;
  consumed_at: string | null;
  result_json: Record<string, any> | null;
  reason: string | null;
}

// ── Command Queue ──

let _cmdCounter = 0;

function generateCommandId(): string {
  _cmdCounter++;
  return `ccmd_${Date.now()}_${_cmdCounter}`;
}

export function createCommand(
  runId: string,
  type: CostumeCommandType,
  opts?: {
    characterKey?: string;
    stateKey?: string;
    slotKey?: string;
    reason?: string;
    payload?: Record<string, any>;
  },
): CostumeRunCommand {
  const cmd: CostumeRunCommand = {
    id: generateCommandId(),
    run_id: runId,
    command_type: type,
    character_key: opts?.characterKey ?? null,
    state_key: opts?.stateKey ?? null,
    slot_key: opts?.slotKey ?? null,
    payload_json: opts?.payload ?? null,
    status: 'pending',
    created_at: new Date().toISOString(),
    consumed_at: null,
    result_json: null,
    reason: opts?.reason ?? null,
  };

  console.log(`[CostumeCmd] Created: ${type} run=${runId}`, {
    character: opts?.characterKey,
    state: opts?.stateKey,
    slot: opts?.slotKey,
    reason: opts?.reason,
  });

  return cmd;
}

// ── Command Validation ──

export type CommandValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Validate a command is safe to issue given current run context.
 * Fail-closed: invalid commands are rejected with explicit reason.
 */
export function validateCommand(
  cmd: CostumeRunCommand,
  context: {
    isRunning: boolean;
    isPaused: boolean;
    activeCharacterKey: string | null;
    activeStateKey: string | null;
    activeSlotKey: string | null;
  },
): CommandValidationResult {
  switch (cmd.command_type) {
    case 'pause_run':
      if (!context.isRunning) return { valid: false, reason: 'No active run to pause' };
      if (context.isPaused) return { valid: false, reason: 'Run already paused' };
      return { valid: true };

    case 'resume_run':
      if (!context.isPaused) return { valid: false, reason: 'Run is not paused' };
      return { valid: true };

    case 'retry_state':
      if (!cmd.state_key) return { valid: false, reason: 'retry_state requires state_key' };
      if (!cmd.character_key) return { valid: false, reason: 'retry_state requires character_key' };
      return { valid: true };

    case 'skip_state':
      if (!cmd.state_key) return { valid: false, reason: 'skip_state requires state_key' };
      if (!cmd.character_key) return { valid: false, reason: 'skip_state requires character_key' };
      if (!cmd.reason) return { valid: false, reason: 'skip_state requires a reason' };
      return { valid: true };

    case 'retry_slot':
      if (!cmd.slot_key) return { valid: false, reason: 'retry_slot requires slot_key' };
      return { valid: true };

    default:
      return { valid: false, reason: `Unknown command type: ${cmd.command_type}` };
  }
}

// ── Consumption Result ──

export interface CommandConsumptionResult {
  action: 'pause' | 'skip_state' | 'retry_state' | 'retry_slot' | 'none';
  command: CostumeRunCommand | null;
  reason: string | null;
}

/**
 * Check pending commands and return the action the generation loop should take.
 * Consumes at most one command per call. Marks it as applied/failed.
 *
 * Called by the generation loop BEFORE each slot/state iteration.
 */
export function consumeNextCommand(
  queue: CostumeRunCommand[],
  context: {
    activeCharacterKey: string | null;
    activeStateKey: string | null;
    activeSlotKey: string | null;
  },
): CommandConsumptionResult {
  const pending = queue.filter(c => c.status === 'pending');
  if (pending.length === 0) return { action: 'none', command: null, reason: null };

  // Priority: pause > skip > retry_state > retry_slot
  const pause = pending.find(c => c.command_type === 'pause_run');
  if (pause) {
    pause.status = 'applied';
    pause.consumed_at = new Date().toISOString();
    console.log(`[CostumeCmd] Applied: pause_run`);
    return { action: 'pause', command: pause, reason: 'User requested pause' };
  }

  const skip = pending.find(c =>
    c.command_type === 'skip_state' &&
    c.character_key === context.activeCharacterKey &&
    c.state_key === context.activeStateKey,
  );
  if (skip) {
    skip.status = 'applied';
    skip.consumed_at = new Date().toISOString();
    console.log(`[CostumeCmd] Applied: skip_state ${skip.state_key} reason=${skip.reason}`);
    return { action: 'skip_state', command: skip, reason: skip.reason };
  }

  const retryState = pending.find(c =>
    c.command_type === 'retry_state' &&
    c.character_key === context.activeCharacterKey &&
    c.state_key === context.activeStateKey,
  );
  if (retryState) {
    retryState.status = 'applied';
    retryState.consumed_at = new Date().toISOString();
    console.log(`[CostumeCmd] Applied: retry_state ${retryState.state_key}`);
    return { action: 'retry_state', command: retryState, reason: null };
  }

  const retrySlot = pending.find(c =>
    c.command_type === 'retry_slot' &&
    c.slot_key === context.activeSlotKey,
  );
  if (retrySlot) {
    retrySlot.status = 'applied';
    retrySlot.consumed_at = new Date().toISOString();
    console.log(`[CostumeCmd] Applied: retry_slot ${retrySlot.slot_key}`);
    return { action: 'retry_slot', command: retrySlot, reason: null };
  }

  return { action: 'none', command: null, reason: null };
}

/**
 * Cancel all pending commands for a run (e.g. on run completion or abort).
 */
export function cancelPendingCommands(queue: CostumeRunCommand[]): void {
  for (const cmd of queue) {
    if (cmd.status === 'pending') {
      cmd.status = 'cancelled';
      cmd.consumed_at = new Date().toISOString();
    }
  }
}

/**
 * Get command history summary for audit/diagnostics.
 */
export function getCommandSummary(queue: CostumeRunCommand[]): {
  total: number;
  applied: number;
  failed: number;
  cancelled: number;
  pending: number;
} {
  return {
    total: queue.length,
    applied: queue.filter(c => c.status === 'applied').length,
    failed: queue.filter(c => c.status === 'failed').length,
    cancelled: queue.filter(c => c.status === 'cancelled').length,
    pending: queue.filter(c => c.status === 'pending').length,
  };
}
