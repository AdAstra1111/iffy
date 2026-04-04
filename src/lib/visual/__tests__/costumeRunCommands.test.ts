/**
 * costumeRunCommands.test.ts — Regression tests for the costume run command/control layer.
 */
import { describe, it, expect } from 'vitest';
import {
  createCommand,
  validateCommand,
  consumeNextCommand,
  cancelPendingCommands,
  getCommandSummary,
  type CostumeRunCommand,
} from '@/lib/visual/costumeRunCommands';

describe('costumeRunCommands', () => {
  // ── Command Creation ──

  it('creates a command with correct fields', () => {
    const cmd = createCommand('run_1', 'pause_run', { reason: 'test' });
    expect(cmd.run_id).toBe('run_1');
    expect(cmd.command_type).toBe('pause_run');
    expect(cmd.status).toBe('pending');
    expect(cmd.reason).toBe('test');
    expect(cmd.consumed_at).toBeNull();
    expect(cmd.id).toMatch(/^ccmd_/);
  });

  it('creates skip_state with required fields', () => {
    const cmd = createCommand('run_1', 'skip_state', {
      characterKey: 'char_a',
      stateKey: 'work',
      reason: 'Not needed',
    });
    expect(cmd.character_key).toBe('char_a');
    expect(cmd.state_key).toBe('work');
    expect(cmd.reason).toBe('Not needed');
  });

  // ── Command Validation ──

  it('validates pause_run requires active run', () => {
    const cmd = createCommand('run_1', 'pause_run');
    const result = validateCommand(cmd, {
      isRunning: false,
      isPaused: false,
      activeCharacterKey: null,
      activeStateKey: null,
      activeSlotKey: null,
    });
    expect(result.valid).toBe(false);
  });

  it('validates pause_run passes when running', () => {
    const cmd = createCommand('run_1', 'pause_run');
    const result = validateCommand(cmd, {
      isRunning: true,
      isPaused: false,
      activeCharacterKey: null,
      activeStateKey: null,
      activeSlotKey: null,
    });
    expect(result.valid).toBe(true);
  });

  it('validates resume_run requires paused state', () => {
    const cmd = createCommand('run_1', 'resume_run');
    const result = validateCommand(cmd, {
      isRunning: true,
      isPaused: false,
      activeCharacterKey: null,
      activeStateKey: null,
      activeSlotKey: null,
    });
    expect(result.valid).toBe(false);
  });

  it('validates resume_run passes when paused', () => {
    const cmd = createCommand('run_1', 'resume_run');
    const result = validateCommand(cmd, {
      isRunning: true,
      isPaused: true,
      activeCharacterKey: null,
      activeStateKey: null,
      activeSlotKey: null,
    });
    expect(result.valid).toBe(true);
  });

  it('validates skip_state requires reason', () => {
    const cmd = createCommand('run_1', 'skip_state', {
      characterKey: 'c', stateKey: 's',
    });
    const result = validateCommand(cmd, {
      isRunning: true, isPaused: false,
      activeCharacterKey: 'c', activeStateKey: 's', activeSlotKey: null,
    });
    expect(result.valid).toBe(false);
  });

  it('validates retry_state requires character_key and state_key', () => {
    const cmd = createCommand('run_1', 'retry_state');
    const result = validateCommand(cmd, {
      isRunning: true, isPaused: false,
      activeCharacterKey: null, activeStateKey: null, activeSlotKey: null,
    });
    expect(result.valid).toBe(false);
  });

  it('validates retry_slot requires slot_key', () => {
    const cmd = createCommand('run_1', 'retry_slot');
    const result = validateCommand(cmd, {
      isRunning: true, isPaused: false,
      activeCharacterKey: null, activeStateKey: null, activeSlotKey: null,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects unknown command types', () => {
    const cmd = createCommand('run_1', 'unknown_action' as any);
    const result = validateCommand(cmd, {
      isRunning: true, isPaused: false,
      activeCharacterKey: null, activeStateKey: null, activeSlotKey: null,
    });
    expect(result.valid).toBe(false);
  });

  // ── Command Consumption ──

  it('returns none when queue is empty', () => {
    const result = consumeNextCommand([], {
      activeCharacterKey: null, activeStateKey: null, activeSlotKey: null,
    });
    expect(result.action).toBe('none');
    expect(result.command).toBeNull();
  });

  it('consumes pause with highest priority', () => {
    const pause = createCommand('run_1', 'pause_run');
    const skip = createCommand('run_1', 'skip_state', {
      characterKey: 'c', stateKey: 's', reason: 'test',
    });
    const queue = [skip, pause];
    const result = consumeNextCommand(queue, {
      activeCharacterKey: 'c', activeStateKey: 's', activeSlotKey: null,
    });
    expect(result.action).toBe('pause');
    expect(pause.status).toBe('applied');
    expect(pause.consumed_at).not.toBeNull();
  });

  it('consumes skip_state when matching active context', () => {
    const skip = createCommand('run_1', 'skip_state', {
      characterKey: 'char_a', stateKey: 'work', reason: 'skip it',
    });
    const result = consumeNextCommand([skip], {
      activeCharacterKey: 'char_a', activeStateKey: 'work', activeSlotKey: null,
    });
    expect(result.action).toBe('skip_state');
    expect(result.reason).toBe('skip it');
    expect(skip.status).toBe('applied');
  });

  it('does not consume skip_state for wrong context', () => {
    const skip = createCommand('run_1', 'skip_state', {
      characterKey: 'char_a', stateKey: 'work', reason: 'skip it',
    });
    const result = consumeNextCommand([skip], {
      activeCharacterKey: 'char_b', activeStateKey: 'work', activeSlotKey: null,
    });
    expect(result.action).toBe('none');
    expect(skip.status).toBe('pending');
  });

  it('consumes retry_slot when matching active slot', () => {
    const retry = createCommand('run_1', 'retry_slot', { slotKey: 'full_body_primary' });
    const result = consumeNextCommand([retry], {
      activeCharacterKey: 'c', activeStateKey: 's', activeSlotKey: 'full_body_primary',
    });
    expect(result.action).toBe('retry_slot');
    expect(retry.status).toBe('applied');
  });

  // ── Cancel Pending ──

  it('cancels all pending commands', () => {
    const cmds = [
      createCommand('run_1', 'pause_run'),
      createCommand('run_1', 'skip_state', { characterKey: 'c', stateKey: 's', reason: 'r' }),
    ];
    cancelPendingCommands(cmds);
    expect(cmds.every(c => c.status === 'cancelled')).toBe(true);
    expect(cmds.every(c => c.consumed_at !== null)).toBe(true);
  });

  it('does not cancel already-applied commands', () => {
    const applied = createCommand('run_1', 'pause_run');
    applied.status = 'applied';
    const pending = createCommand('run_1', 'resume_run');
    cancelPendingCommands([applied, pending]);
    expect(applied.status).toBe('applied');
    expect(pending.status).toBe('cancelled');
  });

  // ── Summary ──

  it('returns correct command summary', () => {
    const cmds: CostumeRunCommand[] = [
      createCommand('run_1', 'pause_run'),
      createCommand('run_1', 'resume_run'),
      createCommand('run_1', 'skip_state', { characterKey: 'c', stateKey: 's', reason: 'r' }),
    ];
    cmds[0].status = 'applied';
    cmds[1].status = 'failed';
    const summary = getCommandSummary(cmds);
    expect(summary.total).toBe(3);
    expect(summary.applied).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.cancelled).toBe(0);
  });
});
